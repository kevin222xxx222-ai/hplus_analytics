import { ImportBatchStatus, ImportDataType, type Prisma } from "@/generated/prisma/client";
import { formatDateOnly } from "@/lib/date";
import { analyzeCtiWorkbook } from "@/lib/imports/cti/service";
import type { CtiPreview } from "@/lib/imports/cti/types";
import { readImportFile, readPreview, writePreview } from "@/lib/imports/storage";
import { prisma } from "@/lib/prisma";

const REPARSEABLE = [ImportBatchStatus.FAILED, ImportBatchStatus.WAITING_FOR_CAST_LINK, ImportBatchStatus.COMPLETED_WITH_WARNINGS, ImportBatchStatus.COMPLETED] as const;
const activeReparses = new Map<string, Promise<unknown>>();

function importableCount(preview: CtiPreview) {
  return preview.sheets.flatMap((sheet) => sheet.rows).filter((row) => row.castId && row.metrics && !row.issues.some((issue) => issue.level === "ERROR")).length;
}

function metadataObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

export function runCtiReparseExclusively<T>(batchId: string, task: () => Promise<T>): Promise<T> {
  const active = activeReparses.get(batchId) as Promise<T> | undefined;
  if (active) return active;
  const pending = task().finally(() => {
    if (activeReparses.get(batchId) === pending) activeReparses.delete(batchId);
  });
  activeReparses.set(batchId, pending);
  return pending;
}

async function reparseCtiBatchUnlocked(batchId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.dataType !== ImportDataType.CTI_CAST_REPORT) throw new Error("CTI取込履歴が見つかりません。");
  if (!REPARSEABLE.includes(batch.status as typeof REPARSEABLE[number])) throw new Error("この状態の取込は再解析できません。");

  let previousPreview: CtiPreview | null = null;
  try { previousPreview = await readPreview<CtiPreview>(batch.id); } catch { previousPreview = null; }
  const before = { pendingCount: batch.pendingCount, warningCount: batch.warningCount, importableCount: previousPreview ? importableCount(previousPreview) : 0 };
  const metadata = metadataObject(batch.metadata);
  const duplicateCompletedBatchId = typeof metadata.duplicateCompletedBatchId === "string" ? metadata.duplicateCompletedBatchId : null;
  const buffer = await readImportFile(batch.storagePath);
  const analysis = await analyzeCtiWorkbook({
    buffer,
    batchId: batch.id,
    runId: batch.runId,
    importMode: batch.importMode,
    targetFrom: formatDateOnly(batch.targetFrom),
    targetTo: formatDateOnly(batch.targetTo),
    duplicateCompletedBatchId,
  });

  let status: ImportBatchStatus = analysis.status;
  const wasCompleted = batch.status === ImportBatchStatus.COMPLETED || batch.status === ImportBatchStatus.COMPLETED_WITH_WARNINGS;
  if (wasCompleted && !analysis.fatal) {
    status = analysis.summary.pendingCount || analysis.summary.warningCount || analysis.summary.errorCount
      ? ImportBatchStatus.COMPLETED_WITH_WARNINGS
      : ImportBatchStatus.COMPLETED;
  }

  await writePreview(batch.id, analysis.preview);
  await prisma.$transaction(async (tx) => {
    await tx.importError.deleteMany({ where: { importBatchId: batch.id } });
    if (analysis.issueRecords.length) await tx.importError.createMany({ data: analysis.issueRecords.map(({ issue, sheetName, rowNumber }) => ({
      runId: batch.runId,
      importSourceId: batch.importSourceId,
      importBatchId: batch.id,
      fileName: batch.originalFilename,
      fileHash: batch.fileHash,
      sheetName,
      rowNumber,
      columnName: issue.columnName,
      errorCode: issue.code,
      level: issue.level,
      message: issue.message,
      rawData: issue.rawData === undefined ? undefined : JSON.parse(JSON.stringify(issue.rawData)),
    })) });
    await tx.importBatch.update({ where: { id: batch.id }, data: {
      status,
      failureMessage: analysis.fatal ? "対象シートまたは有効なヘッダーを検出できません。" : null,
      sourceSheetNames: analysis.preview.workbookSheetNames,
      detectedColumns: analysis.detectedColumns,
      pendingCount: analysis.summary.pendingCount,
      warningCount: analysis.summary.warningCount,
      errorCount: analysis.summary.errorCount,
      skippedCount: analysis.summary.skippedCount,
      completedAt: wasCompleted ? batch.completedAt : analysis.fatal ? new Date() : null,
    } });
  }, { isolationLevel: "Serializable" });

  const after = { pendingCount: analysis.summary.pendingCount, warningCount: analysis.summary.warningCount, importableCount: importableCount(analysis.preview) };
  return { batchId: batch.id, status, before, after };
}

export function reparseCtiBatch(batchId: string) {
  return runCtiReparseExclusively(batchId, () => reparseCtiBatchUnlocked(batchId));
}
