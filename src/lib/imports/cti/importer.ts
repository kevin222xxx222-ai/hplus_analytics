import { ImportBatchStatus, ImportErrorLevel, ImportMode } from "@/generated/prisma/client";
import { formatDateOnly } from "@/lib/date";
import type { CtiMetrics, CtiPreview, CtiPreviewRow } from "@/lib/imports/cti/types";
import { summarizePreview } from "@/lib/imports/cti/service";
import { readPreview } from "@/lib/imports/storage";
import { prisma } from "@/lib/prisma";

function eligible(row: CtiPreviewRow): row is CtiPreviewRow & { castId: string; metrics: CtiMetrics } {
  return Boolean(row.castId && row.metrics && row.resolutionStatus !== "SKIPPED" && !row.issues.some((issue) => issue.level === "ERROR"));
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
}

export async function confirmCtiImport(batchId: string, forceDuplicate: boolean) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { errors: true } });
  if (!batch) throw new Error("取込履歴が見つかりません。");
  if (batch.status !== ImportBatchStatus.PREVIEW_READY && batch.status !== ImportBatchStatus.WAITING_FOR_CAST_LINK) throw new Error("この取込は確定できる状態ではありません。");
  if (batch.importMode !== ImportMode.DAILY) throw new Error("Phase 2で実績確定できるのは日次ファイルだけです。");
  if (batch.targetFrom.getTime() !== batch.targetTo.getTime()) throw new Error("日次取込の対象期間が同日ではありません。");
  const metadata = metadataObject(batch.metadata);
  if (metadata.duplicateCompletedBatchId && !forceDuplicate) throw new Error("同一ファイルの完了履歴があります。再処理を明示してください。");

  const preview = await readPreview<CtiPreview>(batchId);
  const allRows = preview.sheets.flatMap((sheet) => sheet.rows);
  const rows = allRows.filter(eligible);
  if (!rows.length) throw new Error("取込可能な行がありません。");
  const summary = summarizePreview(preview);
  const rejectedCount = allRows.filter((row) =>
    !eligible(row)
    && row.resolutionStatus !== "SKIPPED"
    && row.resolutionStatus !== "UNMATCHED"
    && row.resolutionStatus !== "AMBIGUOUS"
  ).length;
  const existing = await prisma.ctiCastDaily.findMany({ where: { businessDate: batch.targetFrom } });
  const existingMap = new Map(existing.map((record) => [`${record.storeId}:${record.castId}`, record]));
  const insertedCount = rows.filter((row) => !existingMap.has(`${row.storeId}:${row.castId}`)).length;
  const updatedCount = rows.length - insertedCount;
  const diffs = rows.flatMap((row) => {
    const before = existingMap.get(`${row.storeId}:${row.castId}`);
    if (!before) return [];
    const changes: Record<string, { before: number | null; after: number | null }> = {};
    for (const key of Object.keys(row.metrics) as Array<keyof CtiMetrics>) {
      const previous = before[key as keyof typeof before];
      const after = row.metrics[key];
      if ((typeof previous === "number" || previous === null) && previous !== after) changes[key] = { before: previous, after };
    }
    return Object.keys(changes).length ? [{ storeId: row.storeId, castId: row.castId, businessDate: preview.targetFrom, changes }] : [];
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.importBatch.update({ where: { id: batchId }, data: { status: ImportBatchStatus.IMPORTING } });
      for (const row of rows) {
        const data = {
          importBatchId: batchId, sourceSheetName: row.sourceSheetName, sourceRowNumber: row.sourceRowNumber,
          attendanceCount: row.metrics.attendanceCount, attendanceMinutes: row.metrics.attendanceMinutes, sameDayAbsenceCount: row.metrics.sameDayAbsenceCount,
          reservationCount: row.metrics.reservationCount, cancellationCount: row.metrics.cancellationCount,
          serviceCount: row.metrics.serviceCount, sourceServiceCount: row.metrics.sourceServiceCount,
          regularNominationCount: row.metrics.regularNominationCount, photoNominationCount: row.metrics.photoNominationCount,
          freeCount: row.metrics.freeCount, contractCount: row.metrics.contractCount, sourceContractCount: row.metrics.sourceContractCount,
          newCount: row.metrics.newCount, repeatCount: row.metrics.repeatCount,
          salesAmount: row.metrics.salesAmount, castRewardAmount: row.metrics.castRewardAmount,
          ctiProfitAmount: row.metrics.ctiProfitAmount, payoutAfterRewardAmount: row.metrics.payoutAfterRewardAmount,
          diaryCountCti: row.metrics.diaryCountCti, paidOptionCount: row.metrics.paidOptionCount,
        };
        await tx.ctiCastDaily.upsert({
          where: { businessDate_storeId_castId: { businessDate: batch.targetFrom, storeId: row.storeId, castId: row.castId } },
          create: { businessDate: batch.targetFrom, storeId: row.storeId, castId: row.castId, ...data },
          update: data,
        });
      }
      if (summary.pendingCount > 0) {
        await tx.importError.create({ data: {
          runId: batch.runId, importSourceId: batch.importSourceId, importBatchId: batch.id, fileName: batch.originalFilename,
          fileHash: batch.fileHash, errorCode: "PARTIAL_IMPORT", level: ImportErrorLevel.WARNING,
          message: `未紐付け${summary.pendingCount}行を保留し、紐付け済み行だけを取り込みました。`,
        } });
      }
      const hasWarnings = summary.warningCount > 0 || summary.pendingCount > 0 || summary.errorCount > 0 || rejectedCount > 0;
      await tx.importBatch.update({ where: { id: batchId }, data: {
        status: hasWarnings ? ImportBatchStatus.COMPLETED_WITH_WARNINGS : ImportBatchStatus.COMPLETED,
        completedAt: new Date(), insertedCount, updatedCount,
        pendingCount: summary.pendingCount, skippedCount: summary.skippedCount + rejectedCount,
        warningCount: summary.warningCount + (summary.pendingCount > 0 ? 1 : 0), errorCount: summary.errorCount,
        metadata: { ...metadata, partialImport: summary.pendingCount > 0, updatedRecordDiffs: diffs, confirmedAt: new Date().toISOString() },
      } });
    }, { maxWait: 10_000, timeout: 60_000 });
  } catch (error) {
    await prisma.importBatch.update({ where: { id: batchId }, data: { status: ImportBatchStatus.FAILED, completedAt: new Date(), failureMessage: "取込確定処理に失敗しました。" } });
    throw error;
  }
  return { insertedCount, updatedCount, pendingCount: summary.pendingCount, targetDate: formatDateOnly(batch.targetFrom) };
}
