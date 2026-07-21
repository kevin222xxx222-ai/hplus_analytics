import { ImportBatchStatus } from "@/generated/prisma/client";
import { formatDateOnly } from "@/lib/date";
import { readImportFile, writePreview } from "@/lib/imports/storage";
import { inspectTownBulkPreviewSafety } from "@/lib/imports/town/bulk-service";
import { TOWN_EXTERNAL_STORE_IDS, summarizeTownPreview } from "@/lib/imports/town/service";
import { TOWN_DATA_TYPES } from "@/lib/imports/town/columns";
import { parseTownCsv } from "@/lib/imports/town/parser";
import { resolveTownPreviewRows } from "@/lib/imports/town/resolver";
import type { TownImportDataType, TownIssue } from "@/lib/imports/town/types";
import { prisma } from "@/lib/prisma";

const REPARSEABLE = [ImportBatchStatus.FAILED, ImportBatchStatus.PREVIEW_READY, ImportBatchStatus.WAITING_FOR_CAST_LINK] as const;
const activeReparses = new Map<string, Promise<unknown>>();

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
}

function issueRow(issue: TownIssue) {
  if (!issue.rawData || typeof issue.rawData !== "object" || Array.isArray(issue.rawData)) return null;
  const value = issue.rawData as Record<string, unknown>;
  return typeof value.rowNumber === "number" ? value.rowNumber : null;
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
  if (correctionBatchIds.length) preview.globalIssues.push({
    code: "BULK_CORRECTION_CANDIDATE", level: "WARNING",
    message: "同日・店舗・種別に別SHA-256の既存バッチがあります。自動上書きせず確認が必要です。",
    rawData: { batchIds: correctionBatchIds },
  });

  const summary = summarizeTownPreview(preview);
  const fatalCodes = new Set(["HEADER_NOT_FOUND", "FILE_TYPE_MISMATCH", "TARGET_PERIOD_MISMATCH", "MULTI_DAY_WITHOUT_DATE_COLUMN"]);
  const fatal = preview.globalIssues.some((issue) => issue.level === "ERROR" && fatalCodes.has(issue.code));
  const status = fatal ? ImportBatchStatus.FAILED : summary.pendingCount ? ImportBatchStatus.WAITING_FOR_CAST_LINK : ImportBatchStatus.PREVIEW_READY;
  const safety = inspectTownBulkPreviewSafety(preview, correctionBatchIds);
  const issueRecords = [
    ...preview.globalIssues.map((issue) => ({ issue, rowNumber: issueRow(issue) })),
    ...preview.rows.flatMap((row) => row.issues.map((issue) => ({ issue, rowNumber: row.sourceRowNumber }))),
  ];
  const metadata = metadataObject(batch.metadata);
  const townBulk = metadataObject(metadata.townBulk);

  await writePreview(batch.id, preview);
  await prisma.$transaction(async (tx) => {
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
      metadata: {
        ...metadata, sourcePeriodFrom: preview.sourcePeriodFrom, sourcePeriodTo: preview.sourcePeriodTo,
        townBulk: { ...townBulk, ambiguousCount: safety.ambiguousCount, unmatchedCount: safety.unmatchedCount, autoConfirmSafe: safety.autoConfirmSafe, correctionBatchIds },
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
