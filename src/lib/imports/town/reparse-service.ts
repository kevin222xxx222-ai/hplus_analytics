import { ImportBatchStatus } from "@/generated/prisma/client";
import { formatDateOnly } from "@/lib/date";
import { readImportFile, writePreview } from "@/lib/imports/storage";
import { inspectTownBulkPreviewSafety } from "@/lib/imports/town/bulk-service";
import { TOWN_EXTERNAL_STORE_IDS, summarizeTownPreview } from "@/lib/imports/town/service";
import { TOWN_DATA_TYPES } from "@/lib/imports/town/columns";
import { parseTownCsv } from "@/lib/imports/town/parser";
import { resolveTownPreviewRows } from "@/lib/imports/town/resolver";
import { normalizeCastName } from "@/lib/normalize";
import type { TownImportDataType, TownIssue, TownPreview } from "@/lib/imports/town/types";
import { prisma } from "@/lib/prisma";

const REPARSEABLE = [ImportBatchStatus.FAILED, ImportBatchStatus.PREVIEW_READY, ImportBatchStatus.WAITING_FOR_CAST_LINK, ImportBatchStatus.COMPLETED_WITH_WARNINGS] as const;
const activeReparses = new Map<string, Promise<unknown>>();

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
}

function issueRow(issue: TownIssue) {
  if (!issue.rawData || typeof issue.rawData !== "object" || Array.isArray(issue.rawData)) return null;
  const value = issue.rawData as Record<string, unknown>;
  return typeof value.rowNumber === "number" ? value.rowNumber : null;
}

/**
 * Reapply decisions made by an administrator after the resolver has run.
 *
 * A BULK_TOWN_SKIP event is intentionally stronger than the current resolver
 * result: a later Alias or Cast change must not silently undo an explicit
 * exclusion. The event is scoped to the same store and normalized source name
 * and is applied to every media row in that batch (CAST/URL/LP).
 */
export function reapplyTownAdministrativeDecisions(preview: TownPreview, metadata: unknown): TownPreview {
  const value = metadataObject(metadata);
  const events = Array.isArray(value.importEvents) ? value.importEvents : [];
  const skipKeys = new Set(events
    .filter((event): event is Record<string, unknown> => Boolean(event && typeof event === "object" && event.type === "BULK_TOWN_SKIP"))
    .map((event) => `${String(event.storeName || "")}\u0000${normalizeCastName(String(event.externalProfileId || event.townName || ""))}`));
  if (!skipKeys.size) return preview;

  return {
    ...preview,
    rows: preview.rows.map((row) => {
      if (row.kind === "STORE") return row;
      const normalizedName = row.normalizedCastName;
      if (!normalizedName || !skipKeys.has(`${preview.storeName}\u0000${normalizeCastName(normalizedName)}`)) return row;
      return {
        ...row,
        castId: null,
        castDisplayName: null,
        resolutionStatus: "SKIPPED",
        issues: row.issues.filter((issue) => issue.code !== "UNMATCHED_CAST"),
      };
    }),
  };
}

export function runTownReparseExclusively<T>(batchId: string, task: () => Promise<T>): Promise<T> {
  const active = activeReparses.get(batchId) as Promise<T> | undefined;
  if (active) return active;
  const pending = task().finally(() => {
    if (activeReparses.get(batchId) === pending) activeReparses.delete(batchId);
  });
  activeReparses.set(batchId, pending);
  return pending;
}

async function reparseTownBatchUnlocked(batchId: string) {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    include: { importSource: { include: { store: true } } },
  });
  if (!batch || !TOWN_DATA_TYPES.includes(batch.dataType as TownImportDataType) || !batch.importSource.store) {
    throw new Error("Town取込履歴が見つかりません。");
  }
  if (!REPARSEABLE.includes(batch.status as typeof REPARSEABLE[number])) {
    throw new Error("確定済みまたは対象外状態のTownバッチは再解析できません。");
  }

  const dataType = batch.dataType as TownImportDataType;
  const before = {
    pendingCount: batch.pendingCount,
    warningCount: batch.warningCount,
    errorCount: batch.errorCount,
    unmatchedCount: typeof metadataObject(metadataObject(batch.metadata).townBulk).unmatchedCount === "number"
      ? metadataObject(metadataObject(batch.metadata).townBulk).unmatchedCount as number
      : batch.pendingCount,
  };
  const store = batch.importSource.store;
  const targetFrom = formatDateOnly(batch.targetFrom);
  const targetTo = formatDateOnly(batch.targetTo);
  const correctionBatches = await prisma.importBatch.findMany({
    where: {
      id: { not: batch.id }, fileHash: { not: batch.fileHash }, dataType,
      importSource: { is: { storeId: store.id } }, targetFrom: batch.targetFrom, targetTo: batch.targetTo,
    },
    select: { id: true },
  });
  const correctionBatchIds = correctionBatches.map((candidate) => candidate.id);
  const buffer = await readImportFile(batch.storagePath);
  let preview = parseTownCsv({
    buffer, batchId: batch.id, runId: batch.runId, dataType, storeId: store.id,
    storeCode: store.code, storeName: store.shortName, targetFrom, targetTo,
    expectedExternalStoreId: TOWN_EXTERNAL_STORE_IDS[store.code] || null,
  });
  preview = { ...preview, rows: await resolveTownPreviewRows(preview.rows, store.id, batch.targetTo) };
  // Resolver output is provisional. Restore explicit administrator decisions
  // before calculating errors/counts and writing the regenerated preview.
  const metadata = metadataObject(batch.metadata);
  const importEvents = Array.isArray(metadata.importEvents) ? metadata.importEvents : [];
  const idNoSourceUrlPartial = importEvents.some((event) => Boolean(event && typeof event === "object" && (event as Record<string, unknown>).type === "TOWN_ID_NO_SOURCE_URL_HOLD_PARTIAL_CONFIRM"));
  preview = reapplyTownAdministrativeDecisions(preview, metadata);
  if (correctionBatchIds.length) preview.globalIssues.push({
    code: "BULK_CORRECTION_CANDIDATE", level: "WARNING",
    message: "同日・店舗・種別に別SHA-256の既存バッチがあります。自動上書きせず確認が必要です。",
    rawData: { batchIds: correctionBatchIds },
  });

  const summary = summarizeTownPreview(preview);
  const fatalCodes = new Set(["HEADER_NOT_FOUND", "FILE_TYPE_MISMATCH", "TARGET_PERIOD_MISMATCH", "MULTI_DAY_WITHOUT_DATE_COLUMN"]);
  const fatal = preview.globalIssues.some((issue) => issue.level === "ERROR" && fatalCodes.has(issue.code));
  const status = fatal ? ImportBatchStatus.FAILED
    : idNoSourceUrlPartial
      ? (summary.pendingCount || summary.warningCount || summary.errorCount ? ImportBatchStatus.COMPLETED_WITH_WARNINGS : ImportBatchStatus.COMPLETED)
      : summary.pendingCount ? ImportBatchStatus.WAITING_FOR_CAST_LINK : ImportBatchStatus.PREVIEW_READY;
  const safety = inspectTownBulkPreviewSafety(preview, correctionBatchIds);
  const issueRecords = [
    ...preview.globalIssues.map((issue) => ({ issue, rowNumber: issueRow(issue) })),
    ...preview.rows.flatMap((row) => row.issues.map((issue) => ({ issue, rowNumber: row.sourceRowNumber }))),
  ];
  const townBulk = metadataObject(metadata.townBulk);

  await writePreview(batch.id, preview);
  let newlyInsertedPartialCastRows = 0;
  await prisma.$transaction(async (tx) => {
    if (idNoSourceUrlPartial && dataType === "TOWN_CAST") {
      const existing = await tx.townCastDaily.findMany({ where: { storeId: store.id, date: { gte: batch.targetFrom, lte: batch.targetTo } }, select: { date: true, castId: true } });
      const existingKeys = new Set(existing.map((record) => `${record.date.toISOString().slice(0, 10)}:${record.castId}`));
      for (const row of preview.rows) {
        if (row.kind !== "CAST" || !row.castId || row.resolutionStatus === "SKIPPED" || row.issues.some((issue) => issue.level === "ERROR")) continue;
        const rowKey = `${row.date}:${row.castId}`;
        if (existingKeys.has(rowKey)) continue;
        const date = new Date(`${row.date}T00:00:00.000Z`);
        await tx.townCastDaily.create({ data: {
          date, storeId: preview.storeId, castId: row.castId, importBatchId: batch.id,
          sourceCastName: row.originalCastName, pv: row.pv, uu: row.uu, averagePv: row.averagePv,
          sourceAveragePv: row.sourceAveragePv, telTapUu: row.telTapUu, conversionRate: row.conversionRate,
          sourceConversionRate: row.sourceConversionRate, isListed: true, sourceRowNumber: row.sourceRowNumber,
        } });
        existingKeys.add(rowKey);
        newlyInsertedPartialCastRows += 1;
      }
    }
    await tx.importError.deleteMany({ where: { importBatchId: batch.id } });
    if (issueRecords.length) await tx.importError.createMany({ data: issueRecords.map(({ issue, rowNumber }) => ({
      runId: batch.runId, importSourceId: batch.importSourceId, importBatchId: batch.id,
      fileName: batch.originalFilename, fileHash: batch.fileHash, rowNumber,
      columnName: issue.columnName, errorCode: issue.code, level: issue.level, message: issue.message,
      rawData: issue.rawData === undefined ? undefined : JSON.parse(JSON.stringify(issue.rawData)),
    })) });
    await tx.importBatch.update({ where: { id: batch.id }, data: {
      status, failureMessage: fatal ? "選択内容とCSV構造または対象期間が一致しません。" : null,
      sourceSheetNames: [],
      detectedColumns: { headerRow: preview.headerRow, encoding: preview.encoding, delimiter: preview.delimiter, columns: preview.detectedColumns, unknown: preview.unknownColumns },
      pendingCount: summary.pendingCount, skippedCount: summary.skippedCount,
      warningCount: summary.warningCount, errorCount: summary.errorCount,
      insertedCount: idNoSourceUrlPartial ? batch.insertedCount + newlyInsertedPartialCastRows : batch.insertedCount,
      metadata: {
        ...metadata, sourcePeriodFrom: preview.sourcePeriodFrom, sourcePeriodTo: preview.sourcePeriodTo,
        townBulk: { ...townBulk, ambiguousCount: safety.ambiguousCount, unmatchedCount: safety.unmatchedCount, autoConfirmSafe: safety.autoConfirmSafe, correctionBatchIds },
        importEvents: idNoSourceUrlPartial
          ? [...importEvents, { type: "TOWN_ID_NO_SOURCE_URL_HOLD_PARTIAL_REPARSE", mode: "ID_NO_SOURCE_URL_HOLD_PARTIAL", at: new Date().toISOString(), batchId: batch.id, newlyInsertedCastRows: newlyInsertedPartialCastRows, heldRows: preview.rows.filter((row) => row.kind === "CAST" && row.resolutionStatus === "UNMATCHED" && !row.castId).length }]
          : importEvents,
      },
    } });
  }, { isolationLevel: "Serializable" });

  return {
    batchId: batch.id, status, before,
    after: { pendingCount: safety.pendingCount, warningCount: safety.warningCount, errorCount: safety.errorCount, unmatchedCount: safety.unmatchedCount },
    ...safety,
  };
}

export function reparseTownBatch(batchId: string) {
  return runTownReparseExclusively(batchId, () => reparseTownBatchUnlocked(batchId));
}
