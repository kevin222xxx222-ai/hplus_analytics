import { AliasReviewStatus, CastStatus, ImportBatchStatus, MediaType } from "@/generated/prisma/client";
import { parseDateOnly } from "@/lib/date";
import { summarizePreview } from "@/lib/imports/cti/service";
import type { CtiPreview } from "@/lib/imports/cti/types";
import { readPreview, writePreview } from "@/lib/imports/storage";
import { normalizeCastName } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";

type ResolutionInput =
  | { action: "EXISTING"; castId: string }
  | { action: "NEW"; displayName: string; startedOn?: string }
  | { action: "SKIP" }
  | { action: "PENDING" };

export async function resolveCtiPreviewRow(batchId: string, rowKey: string, input: ResolutionInput) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || (batch.status !== ImportBatchStatus.PREVIEW_READY && batch.status !== ImportBatchStatus.WAITING_FOR_CAST_LINK)) throw new Error("編集可能なプレビューが見つかりません。");
  const preview = await readPreview<CtiPreview>(batchId);
  const row = preview.sheets.flatMap((sheet) => sheet.rows).find((candidate) => candidate.rowKey === rowKey);
  if (!row) throw new Error("対象行が見つかりません。");
  const businessDate = parseDateOnly(preview.targetTo);

  if (input.action === "SKIP" || input.action === "PENDING") {
    row.castId = null;
    row.castDisplayName = null;
    row.resolutionStatus = input.action === "SKIP" ? "SKIPPED" : "UNMATCHED";
    if (input.action === "SKIP") {
      row.issues = row.issues.filter((issue) => issue.code !== "UNMATCHED_CAST" && issue.code !== "AMBIGUOUS_CAST");
      await prisma.importError.updateMany({ where: { importBatchId: batchId, sheetName: row.sourceSheetName, rowNumber: row.sourceRowNumber, errorCode: { in: ["UNMATCHED_CAST", "AMBIGUOUS_CAST"] }, status: "OPEN" }, data: { status: "IGNORED", resolvedAt: new Date() } });
    }
  } else {
    const cast = await prisma.$transaction(async (tx) => {
      let selected;
      if (input.action === "EXISTING") {
        selected = await tx.cast.findFirst({ where: { id: input.castId, startedOn: { lte: businessDate }, OR: [{ endedOn: null }, { endedOn: { gte: businessDate } }] } });
        if (!selected) throw new Error("対象日に在籍期間内のキャストを選択してください。");
      } else {
        const displayName = input.displayName.trim();
        if (!displayName) throw new Error("新規キャスト名を入力してください。");
        selected = await tx.cast.create({ data: {
          displayName, normalizedName: normalizeCastName(displayName), status: CastStatus.ACTIVE,
          startedOn: input.startedOn ? parseDateOnly(input.startedOn) : businessDate, primaryStoreId: row.storeId,
        } });
      }
      const existingAlias = await tx.castAlias.findFirst({ where: { mediaType: MediaType.CTI, storeId: row.storeId, normalizedAlias: row.normalizedCastName, castId: selected.id } });
      if (!existingAlias) await tx.castAlias.create({ data: {
        mediaType: MediaType.CTI, aliasName: row.originalCastName, normalizedAlias: row.normalizedCastName,
        reviewStatus: AliasReviewStatus.MAPPED, castId: selected.id, storeId: row.storeId, validFrom: businessDate,
      } });
      await tx.importError.updateMany({ where: { importBatchId: batchId, sheetName: row.sourceSheetName, rowNumber: row.sourceRowNumber, errorCode: { in: ["UNMATCHED_CAST", "AMBIGUOUS_CAST"] }, status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date() } });
      return selected;
    });
    row.castId = cast.id;
    row.castDisplayName = cast.displayName;
    row.resolutionStatus = "EXACT_ALIAS";
    row.issues = row.issues.filter((issue) => issue.code !== "AMBIGUOUS_CAST" && issue.code !== "UNMATCHED_CAST");
  }
  await writePreview(batchId, preview);
  const summary = summarizePreview(preview);
  await prisma.importBatch.update({ where: { id: batchId }, data: {
    status: summary.pendingCount ? ImportBatchStatus.WAITING_FOR_CAST_LINK : ImportBatchStatus.PREVIEW_READY,
    pendingCount: summary.pendingCount, skippedCount: summary.skippedCount, warningCount: summary.warningCount, errorCount: summary.errorCount,
  } });
  return { row, summary };
}
