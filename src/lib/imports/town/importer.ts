import { ImportBatchStatus, ImportErrorLevel, MediaType } from "@/generated/prisma/client";
import { parseDateOnly } from "@/lib/date";
import { readPreview } from "@/lib/imports/storage";
import { summarizeTownPreview } from "@/lib/imports/town/service";
import type { TownPreview, TownPreviewRow } from "@/lib/imports/town/types";
import { prisma } from "@/lib/prisma";

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
}

function importEvents(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function eligible(row: TownPreviewRow) {
  if (row.resolutionStatus === "SKIPPED" || row.issues.some((issue) => issue.level === "ERROR")) return false;
  return row.kind !== "CAST" || Boolean(row.castId);
}

function key(row: TownPreviewRow) {
  if (row.kind === "STORE") return row.date;
  if (row.kind === "CAST") return `${row.date}:${row.castId}`;
  return `${row.date}:${row.normalizedUrl}`;
}

export async function confirmTownImport(batchId: string, forceDuplicate: boolean) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error("取込履歴が見つかりません。");
  if (batch.status !== ImportBatchStatus.PREVIEW_READY && batch.status !== ImportBatchStatus.WAITING_FOR_CAST_LINK) throw new Error("この取込は確定できる状態ではありません。");
  const metadata = metadataObject(batch.metadata);
  if (metadata.duplicateCompletedBatchId && !forceDuplicate) throw new Error("同一ファイルの完了履歴があります。再処理を明示してください。");
  const preview = await readPreview<TownPreview>(batchId);
  const rows = preview.rows.filter(eligible);
  if (!rows.length) throw new Error("取込可能な行がありません。");
  const summary = summarizeTownPreview(preview);

  let existingKeys = new Set<string>();
  if (preview.dataType === "TOWN_STORE") {
    const existing = await prisma.townStoreDaily.findMany({ where: { storeId: preview.storeId, date: { gte: batch.targetFrom, lte: batch.targetTo } }, select: { date: true } });
    existingKeys = new Set(existing.map((record) => record.date.toISOString().slice(0, 10)));
  } else if (preview.dataType === "TOWN_CAST") {
    const existing = await prisma.townCastDaily.findMany({ where: { storeId: preview.storeId, date: { gte: batch.targetFrom, lte: batch.targetTo } }, select: { date: true, castId: true } });
    existingKeys = new Set(existing.map((record) => `${record.date.toISOString().slice(0, 10)}:${record.castId}`));
  } else if (preview.dataType === "TOWN_URL") {
    const existing = await prisma.townUrlDaily.findMany({ where: { storeId: preview.storeId, date: { gte: batch.targetFrom, lte: batch.targetTo } }, select: { date: true, normalizedUrl: true } });
    existingKeys = new Set(existing.map((record) => `${record.date.toISOString().slice(0, 10)}:${record.normalizedUrl}`));
  } else {
    const existing = await prisma.townLandingDaily.findMany({ where: { storeId: preview.storeId, date: { gte: batch.targetFrom, lte: batch.targetTo } }, select: { date: true, normalizedUrl: true } });
    existingKeys = new Set(existing.map((record) => `${record.date.toISOString().slice(0, 10)}:${record.normalizedUrl}`));
  }
  const insertedCount = rows.filter((row) => !existingKeys.has(key(row))).length;
  const updatedCount = rows.length - insertedCount;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.importBatch.update({ where: { id: batchId }, data: { status: ImportBatchStatus.IMPORTING } });
      for (const row of rows) {
        const date = parseDateOnly(row.date);
        if (row.kind === "STORE") {
          const data = {
            importBatchId: batchId, pv: row.pv, uu: row.uu, averagePv: row.averagePv,
            sourceAveragePv: row.sourceAveragePv, bounceRate: row.bounceRate, telTapUu: row.telTapUu,
            conversionRate: row.conversionRate, sourceConversionRate: row.sourceConversionRate, sourceRowNumber: row.sourceRowNumber,
          };
          await tx.townStoreDaily.upsert({ where: { date_storeId: { date, storeId: preview.storeId } }, create: { date, storeId: preview.storeId, ...data }, update: data });
        } else if (row.kind === "CAST" && row.castId) {
          const data = {
            importBatchId: batchId, sourceCastName: row.originalCastName, pv: row.pv, uu: row.uu,
            averagePv: row.averagePv, sourceAveragePv: row.sourceAveragePv, telTapUu: row.telTapUu,
            conversionRate: row.conversionRate, sourceConversionRate: row.sourceConversionRate,
            isListed: true, sourceRowNumber: row.sourceRowNumber,
          };
          await tx.townCastDaily.upsert({ where: { date_storeId_castId: { date, storeId: preview.storeId, castId: row.castId } }, create: { date, storeId: preview.storeId, castId: row.castId, ...data }, update: data });
          await tx.mediaListing.upsert({
            where: { castId_storeId_mediaType: { castId: row.castId, storeId: preview.storeId, mediaType: MediaType.TOWN } },
            create: { castId: row.castId, storeId: preview.storeId, mediaType: MediaType.TOWN, isListed: true, listedFrom: date },
            update: { isListed: true, listedTo: null },
          });
        } else if (row.kind === "URL") {
          const data = {
            importBatchId: batchId, url: row.url, externalStoreId: row.externalStoreId, externalCastId: row.externalCastId,
            castId: row.castId, sourceCastName: row.sourceCastName, pageType: row.pageType,
            pv: row.pv, uu: row.uu, averagePv: row.averagePv, sourceAveragePv: row.sourceAveragePv,
            telTapUu: row.telTapUu, conversionRate: row.conversionRate, sourceConversionRate: row.sourceConversionRate,
            sourceRowNumber: row.sourceRowNumber,
          };
          await tx.townUrlDaily.upsert({ where: { date_storeId_normalizedUrl: { date, storeId: preview.storeId, normalizedUrl: row.normalizedUrl } }, create: { date, storeId: preview.storeId, normalizedUrl: row.normalizedUrl, ...data }, update: data });
        } else if (row.kind === "LANDING") {
          const data = {
            importBatchId: batchId, landingUrl: row.landingUrl, externalStoreId: row.externalStoreId, externalCastId: row.externalCastId,
            castId: row.castId, sourceCastName: row.sourceCastName, pageType: row.pageType,
            uu: row.uu, bounceRate: row.bounceRate, telTapUu: row.telTapUu,
            conversionRate: row.conversionRate, sourceConversionRate: row.sourceConversionRate, sourceRowNumber: row.sourceRowNumber,
          };
          await tx.townLandingDaily.upsert({ where: { date_storeId_normalizedUrl: { date, storeId: preview.storeId, normalizedUrl: row.normalizedUrl } }, create: { date, storeId: preview.storeId, normalizedUrl: row.normalizedUrl, ...data }, update: data });
        }
      }
      if (summary.pendingCount > 0) await tx.importError.create({ data: {
        runId: batch.runId, importSourceId: batch.importSourceId, importBatchId: batch.id,
        fileName: batch.originalFilename, fileHash: batch.fileHash, errorCode: "PARTIAL_IMPORT", level: ImportErrorLevel.WARNING,
        message: `未紐付け${summary.pendingCount}行を保留し、取込可能な行だけを保存しました。`,
      } });
      const hasWarnings = summary.warningCount > 0 || summary.pendingCount > 0 || summary.errorCount > 0;
      await tx.importBatch.update({ where: { id: batchId }, data: {
        status: hasWarnings ? ImportBatchStatus.COMPLETED_WITH_WARNINGS : ImportBatchStatus.COMPLETED,
        completedAt: new Date(), insertedCount, updatedCount, pendingCount: summary.pendingCount,
        skippedCount: summary.skippedCount, warningCount: summary.warningCount + (summary.pendingCount > 0 ? 1 : 0), errorCount: summary.errorCount,
        metadata: { ...metadata, partialImport: summary.pendingCount > 0, confirmedAt: new Date().toISOString(), insertedKeys: rows.filter((row) => !existingKeys.has(key(row))).map(key), updatedKeys: rows.filter((row) => existingKeys.has(key(row))).map(key), importEvents: [...importEvents(metadata.importEvents), { type: "INITIAL_CONFIRM", inserted: insertedCount, updated: updatedCount, at: new Date().toISOString() }] },
      } });
    }, { maxWait: 10_000, timeout: 60_000 });
  } catch (error) {
    await prisma.importBatch.update({ where: { id: batchId }, data: { status: ImportBatchStatus.FAILED, completedAt: new Date(), failureMessage: "タウン取込確定処理に失敗しました。" } });
    throw error;
  }
  return { insertedCount, updatedCount, pendingCount: summary.pendingCount };
}
