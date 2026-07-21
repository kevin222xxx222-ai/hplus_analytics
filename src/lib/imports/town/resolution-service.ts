import { AliasReviewStatus, CastStatus, ImportBatchStatus, ImportDataType, MediaType, StoreCode, type ImportBatch, type Prisma } from "@/generated/prisma/client";
import { formatDateOnly, parseDateOnly } from "@/lib/date";
import { readPreview, writePreview } from "@/lib/imports/storage";
import { persistTownRow } from "@/lib/imports/town/persistence";
import { canResolveTownRow, isTownResolutionBatch, openUnmatchedRowNumbers, TOWN_RESOLUTION_DATA_TYPES, TOWN_RESOLUTION_STATUSES } from "@/lib/imports/town/resolution-policy";
import type { TownPreview, TownPreviewRow } from "@/lib/imports/town/types";
import { normalizeCastName } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";

type NewCastInput = {
  action: "NEW";
  displayName: string;
  primaryStoreId: string | null;
  startedOn: string;
  notes?: string;
  confirmDuplicate?: boolean;
};
type ResolutionInput = { action: "EXISTING"; castId: string } | NewCastInput | { action: "SKIP" } | { action: "PENDING" };
type BatchWithErrors = ImportBatch & { errors: Array<{ rowNumber: number | null; errorCode: string; status: "OPEN" | "RESOLVED" | "IGNORED" }> };
type ImportEvent = { type: string; inserted?: number; updated?: number; skipped?: number; resolvedRows?: number; at: string };

const PRIMARY_STORE_CODES = [StoreCode.KASUKABE, StoreCode.KOSHIGAYA, StoreCode.NODA, StoreCode.KUKI] as const;

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
}

function stringSet(value: unknown) {
  return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
}

function importEvents(value: unknown): ImportEvent[] {
  return Array.isArray(value) ? value.filter((item): item is ImportEvent => Boolean(item && typeof item === "object" && !Array.isArray(item) && typeof (item as ImportEvent).type === "string")) : [];
}

function rowName(row: TownPreviewRow) {
  if (row.kind === "CAST") return { raw: row.originalCastName, normalized: row.normalizedCastName };
  if ((row.kind === "URL" || row.kind === "LANDING") && row.sourceCastName) return { raw: row.sourceCastName, normalized: normalizeCastName(row.sourceCastName) };
  return null;
}

function isCompletedStatus(status: string) {
  return status === ImportBatchStatus.COMPLETED || status === ImportBatchStatus.COMPLETED_WITH_WARNINGS;
}

function activeOn(cast: { startedOn: Date; endedOn: Date | null }, date: Date) {
  return cast.startedOn <= date && (!cast.endedOn || cast.endedOn >= date);
}

function validateNewCastInput(input: NewCastInput, targetDate: Date) {
  const displayName = input.displayName.trim();
  const notes = input.notes?.trim() || null;
  if (!displayName || displayName.length > 100) throw new Error("新規キャスト名は1〜100文字で入力してください。");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startedOn)) throw new Error("在籍開始日が不正です。");
  if (notes && notes.length > 1000) throw new Error("メモは1000文字以内で入力してください。");
  const startedOn = parseDateOnly(input.startedOn);
  if (startedOn > targetDate) throw new Error("在籍開始日は対象日以前を指定してください。");
  return { displayName, normalizedName: normalizeCastName(displayName), notes, startedOn };
}

async function sameNameCandidates(tx: Prisma.TransactionClient, normalizedName: string, targetDate: Date) {
  const candidates = await tx.cast.findMany({
    where: {
      normalizedName,
      status: CastStatus.ACTIVE,
      mergedIntoCastId: null,
      startedOn: { lte: targetDate },
      OR: [{ endedOn: null }, { endedOn: { gte: targetDate } }],
    },
    select: { id: true, displayName: true, startedOn: true, endedOn: true, primaryStore: { select: { shortName: true } } },
    orderBy: [{ startedOn: "asc" }, { displayName: "asc" }],
  });
  return candidates.map((cast) => ({
    id: cast.id,
    displayName: cast.displayName,
    startedOn: formatDateOnly(cast.startedOn),
    endedOn: cast.endedOn ? formatDateOnly(cast.endedOn) : null,
    primaryStoreName: cast.primaryStore?.shortName || null,
  }));
}

async function loadResolutionTarget(batchId: string, rowKey: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { errors: { select: { rowNumber: true, errorCode: true, status: true } } } });
  if (!batch || !isTownResolutionBatch(batch.dataType, batch.status)) throw new Error("編集可能なタウンプレビューが見つかりません。");
  const preview = await readPreview<TownPreview>(batchId);
  const row = preview.rows.find((candidate) => candidate.rowKey === rowKey);
  if (!row || !canResolveTownRow(batch.dataType, batch.status, row, openUnmatchedRowNumbers(batch.errors))) throw new Error("OPENの未紐付け行が見つかりません。");
  const name = rowName(row);
  if (!name) throw new Error("この行には紐付け対象のキャスト名がありません。");
  return { batch: batch as BatchWithErrors, preview, row, name };
}

export async function inspectTownCastCreation(batchId: string, rowKey: string, displayName: string, startedOnValue: string) {
  const { batch, row } = await loadResolutionTarget(batchId, rowKey);
  if (batch.dataType !== ImportDataType.TOWN_CAST || row.kind !== "CAST") throw new Error("新規キャスト作成はTown女子別の未紐付け行からのみ実行できます。");
  const targetDate = parseDateOnly(row.date);
  const validated = validateNewCastInput({ action: "NEW", displayName, primaryStoreId: null, startedOn: startedOnValue }, targetDate);
  const candidates = await prisma.$transaction((tx) => sameNameCandidates(tx, validated.normalizedName, targetDate));
  return { normalizedName: validated.normalizedName, candidates, canCreate: candidates.length === 0 };
}

async function recountBatch(
  tx: Prisma.TransactionClient,
  batch: BatchWithErrors,
  preview: TownPreview,
  operation: { insertedKeys: string[]; updatedKeys: string[]; resolvedRows?: number; skipped?: number },
) {
  const metadata = metadataObject(batch.metadata);
  const insertedKeys = stringSet(metadata.insertedKeys);
  const updatedKeys = stringSet(metadata.updatedKeys);
  const hadInsertedLedger = Array.isArray(metadata.insertedKeys);
  const hadUpdatedLedger = Array.isArray(metadata.updatedKeys);
  const newlyInserted = operation.insertedKeys.filter((key) => !insertedKeys.has(key));
  const newlyUpdated = operation.updatedKeys.filter((key) => !insertedKeys.has(key) && !updatedKeys.has(key));
  newlyInserted.forEach((key) => { insertedKeys.add(key); updatedKeys.delete(key); });
  newlyUpdated.forEach((key) => updatedKeys.add(key));

  let openErrors = await tx.importError.findMany({ where: { importBatchId: batch.id, status: "OPEN" }, select: { rowNumber: true, errorCode: true, level: true } });
  const openRows = new Set(openErrors.flatMap((error) => error.errorCode === "UNMATCHED_CAST" && error.rowNumber !== null ? [error.rowNumber] : []));
  const pendingCount = preview.rows.filter((row) => row.kind !== "STORE" && row.castId === null && row.resolutionStatus !== "SKIPPED" && openRows.has(row.sourceRowNumber)).length;
  if (pendingCount === 0) {
    await tx.importError.updateMany({ where: { importBatchId: batch.id, errorCode: "PARTIAL_IMPORT", status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    openErrors = await tx.importError.findMany({ where: { importBatchId: batch.id, status: "OPEN" }, select: { rowNumber: true, errorCode: true, level: true } });
  }
  const warningCount = openErrors.filter((error) => error.level === "WARNING").length;
  const errorCount = openErrors.filter((error) => error.level === "ERROR").length;
  const skippedCount = preview.rows.filter((row) => row.resolutionStatus === "SKIPPED").length;
  const completed = isCompletedStatus(batch.status);
  const status = completed
    ? pendingCount === 0 && warningCount === 0 && errorCount === 0 ? ImportBatchStatus.COMPLETED : ImportBatchStatus.COMPLETED_WITH_WARNINGS
    : pendingCount > 0 ? ImportBatchStatus.WAITING_FOR_CAST_LINK : ImportBatchStatus.PREVIEW_READY;
  const events = importEvents(metadata.importEvents);
  if (completed && (operation.resolvedRows || operation.skipped)) events.push(operation.skipped
    ? { type: "POST_RESOLUTION_SKIP", skipped: operation.skipped, at: new Date().toISOString() }
    : { type: "POST_RESOLUTION_IMPORT", inserted: newlyInserted.length, updated: newlyUpdated.length, resolvedRows: operation.resolvedRows, at: new Date().toISOString() });
  const insertedCount = hadInsertedLedger ? insertedKeys.size : batch.insertedCount + newlyInserted.length;
  const updatedCount = hadUpdatedLedger ? updatedKeys.size : batch.updatedCount + newlyUpdated.length;
  await tx.importBatch.update({ where: { id: batch.id }, data: {
    status, insertedCount, updatedCount, pendingCount, skippedCount, warningCount, errorCount,
    metadata: { ...metadata, insertedKeys: [...insertedKeys], updatedKeys: [...updatedKeys], importEvents: events, partialImport: pendingCount > 0 },
  } });
  return { insertedCount, updatedCount, pendingCount, skippedCount, warningCount, errorCount, status };
}

export async function resolveTownPreviewRow(batchId: string, rowKey: string, input: ResolutionInput) {
  const { batch: primaryBatch, preview: primaryPreview, row: primaryRow, name } = await loadResolutionTarget(batchId, rowKey);
  if (input.action === "PENDING") return { row: primaryRow, summary: { pendingCount: primaryBatch.pendingCount, skippedCount: primaryBatch.skippedCount, warningCount: primaryBatch.warningCount, errorCount: primaryBatch.errorCount }, affectedBatchCount: 0 };

  if (input.action === "SKIP") {
    primaryRow.castId = null; primaryRow.castDisplayName = null; primaryRow.resolutionStatus = "SKIPPED";
    primaryRow.issues = primaryRow.issues.filter((issue) => issue.code !== "UNMATCHED_CAST");
    const summary = await prisma.$transaction(async (tx) => {
      await tx.importError.updateMany({ where: { importBatchId: batchId, rowNumber: primaryRow.sourceRowNumber, errorCode: "UNMATCHED_CAST", status: "OPEN" }, data: { status: "IGNORED", resolvedAt: new Date() } });
      await writePreview(batchId, primaryPreview);
      return recountBatch(tx, primaryBatch, primaryPreview, { insertedKeys: [], updatedKeys: [], skipped: 1 });
    });
    return { row: primaryRow, summary, affectedBatchCount: 1 };
  }

  const validFrom = parseDateOnly(primaryRow.date);
  const newCastData = input.action === "NEW" ? validateNewCastInput(input, validFrom) : null;
  if (input.action === "NEW" && (primaryBatch.dataType !== ImportDataType.TOWN_CAST || primaryRow.kind !== "CAST")) throw new Error("新規キャスト作成はTown女子別の未紐付け行からのみ実行できます。");
  const candidateBatches = await prisma.importBatch.findMany({
    where: {
      importSource: { storeId: primaryPreview.storeId },
      dataType: { in: [...TOWN_RESOLUTION_DATA_TYPES] },
      status: { in: [...TOWN_RESOLUTION_STATUSES] },
      errors: { some: { errorCode: "UNMATCHED_CAST", status: "OPEN" } },
    },
    include: { errors: { select: { rowNumber: true, errorCode: true, status: true } } },
  });
  const loadedContexts: Array<{ batch: BatchWithErrors; preview: TownPreview; rows: TownPreviewRow[] }> = [];
  for (const candidate of candidateBatches) {
    let preview: TownPreview;
    try { preview = candidate.id === batchId ? primaryPreview : await readPreview<TownPreview>(candidate.id); } catch { continue; }
    const openRows = openUnmatchedRowNumbers(candidate.errors);
    const rows = preview.rows.filter((row) => {
      const candidateName = rowName(row);
      const date = parseDateOnly(row.date);
      return row.kind !== "STORE" && row.castId === null && row.resolutionStatus !== "SKIPPED" && openRows.has(row.sourceRowNumber)
        && candidateName?.normalized === name.normalized && date >= validFrom;
    });
    if (rows.length) loadedContexts.push({ batch: candidate as BatchWithErrors, preview, rows });
  }

  const transactionResult = await prisma.$transaction(async (tx) => {
    let selected;
    if (input.action === "NEW" && newCastData) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`town-cast:${newCastData.normalizedName}`})) IS NULL AS locked`;
      const candidates = await sameNameCandidates(tx, newCastData.normalizedName, validFrom);
      if (candidates.length > 1) throw new Error("同じ正規化名の在籍キャストが複数存在するため、新規作成を停止しました。既存キャストを確認してください。");
      if (candidates.length === 1 && !input.confirmDuplicate) throw new Error(`同名の在籍キャスト「${candidates[0].displayName}」があります。既存キャストへの紐付けを推奨します。`);
      if (input.primaryStoreId) {
        const primaryStore = await tx.store.findFirst({ where: { id: input.primaryStoreId, code: { in: [...PRIMARY_STORE_CODES] } }, select: { id: true } });
        if (!primaryStore) throw new Error("主所属店舗が不正です。");
      }
      selected = await tx.cast.create({ data: {
        displayName: newCastData.displayName,
        normalizedName: newCastData.normalizedName,
        status: CastStatus.ACTIVE,
        startedOn: newCastData.startedOn,
        primaryStoreId: input.primaryStoreId || null,
        notes: newCastData.notes,
      } });
      await tx.mediaListing.upsert({
        where: { castId_storeId_mediaType: { castId: selected.id, storeId: primaryPreview.storeId, mediaType: MediaType.TOWN } },
        create: { castId: selected.id, storeId: primaryPreview.storeId, mediaType: MediaType.TOWN, isListed: true, listedFrom: validFrom },
        update: { isListed: true, listedTo: null },
      });
    } else if (input.action === "EXISTING") {
      selected = await tx.cast.findFirst({ where: { id: input.castId, mergedIntoCastId: null, startedOn: { lte: validFrom }, OR: [{ endedOn: null }, { endedOn: { gte: validFrom } }] } });
      if (!selected) throw new Error("対象日に在籍期間内のキャストを選択してください。");
    } else {
      throw new Error("紐付け操作が不正です。");
    }

    const contexts = loadedContexts.map((context) => ({ ...context, rows: context.rows.filter((row) => activeOn(selected, parseDateOnly(row.date))) })).filter((context) => context.rows.length);
    if (!contexts.some((context) => context.batch.id === batchId && context.rows.some((row) => row.rowKey === rowKey))) throw new Error("対象行を再解決できません。");
    await tx.castAlias.upsert({
      where: { mediaType_storeId_normalizedAlias_validFrom: { mediaType: MediaType.TOWN, storeId: primaryPreview.storeId, normalizedAlias: name.normalized, validFrom } },
      create: { mediaType: MediaType.TOWN, aliasName: name.raw, normalizedAlias: name.normalized, reviewStatus: AliasReviewStatus.MAPPED, castId: selected.id, storeId: primaryPreview.storeId, validFrom },
      update: { aliasName: name.raw, reviewStatus: AliasReviewStatus.MAPPED, castId: selected.id },
    });
    const summaries = [];
    for (const context of contexts) {
      const rowNumbers = context.rows.map((row) => row.sourceRowNumber);
      await tx.importError.updateMany({ where: { importBatchId: context.batch.id, rowNumber: { in: rowNumbers }, errorCode: "UNMATCHED_CAST", status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date() } });
      const insertedKeys: string[] = []; const updatedKeys: string[] = [];
      for (const row of context.rows) {
        row.castId = selected.id; row.castDisplayName = selected.displayName; row.resolutionStatus = "EXACT_ALIAS";
        row.issues = row.issues.filter((issue) => issue.code !== "UNMATCHED_CAST");
        if (isCompletedStatus(context.batch.status)) {
          const persisted = await persistTownRow(tx, context.batch.id, context.preview, row);
          if (!persisted.existed) insertedKeys.push(persisted.key);
          else if (persisted.existingImportBatchId !== context.batch.id && persisted.persisted) updatedKeys.push(persisted.key);
        }
      }
      await writePreview(context.batch.id, context.preview);
      summaries.push({ batchId: context.batch.id, summary: await recountBatch(tx, context.batch, context.preview, { insertedKeys, updatedKeys, resolvedRows: context.rows.length }) });
    }
    return { selected, summaries };
  }, { maxWait: 10_000, timeout: 60_000 });

  return {
    row: primaryRow,
    summary: transactionResult.summaries.find((item) => item.batchId === batchId)?.summary,
    affectedBatchCount: transactionResult.summaries.length,
    createdCastId: input.action === "NEW" ? transactionResult.selected.id : null,
  };
}
