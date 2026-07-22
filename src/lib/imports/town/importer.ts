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

function isIdFormatName(value: string | null | undefined) {
  return /^ID:\s*\d+$/.test(value || "");
}

function assertIdNoSourceUrlPartial(preview: TownPreview, batch: { status: ImportBatchStatus; errorCount: number; metadata: unknown }) {
  const metadata = metadataObject(batch.metadata);
  const townBulk = metadata.townBulk && typeof metadata.townBulk === "object" && !Array.isArray(metadata.townBulk)
    ? metadata.townBulk as Record<string, unknown> : {};
  const correctionBatchIds = Array.isArray(townBulk.correctionBatchIds) ? townBulk.correctionBatchIds : [];
  let heldRows = 0;
  let saveRows = 0;
  let nonDUnmatchedRows = 0;
  let errorRows = batch.errorCount;
  for (const row of preview.rows) {
    const rowError = row.issues.some((issue) => issue.level === "ERROR");
    if (rowError) errorRows += 1;
    if (row.resolutionStatus === "SKIPPED") continue;
    if (row.kind !== "CAST") {
      if (row.resolutionStatus === "UNMATCHED" || row.resolutionStatus === "AMBIGUOUS") nonDUnmatchedRows += 1;
      continue;
    }
    if (row.resolutionStatus === "UNMATCHED" || row.resolutionStatus === "AMBIGUOUS") {
      if (!row.castId && row.resolutionStatus === "UNMATCHED" && isIdFormatName(row.normalizedCastName)) heldRows += 1;
      else nonDUnmatchedRows += 1;
    } else if (!rowError && row.castId) saveRows += 1;
  }
  if (preview.dataType !== "TOWN_CAST" || batch.status !== ImportBatchStatus.WAITING_FOR_CAST_LINK || batch.errorCount !== 0 || errorRows !== 0 || correctionBatchIds.length !== 0 || heldRows === 0 || saveRows === 0 || nonDUnmatchedRows !== 0) {
    throw new Error("ID_NO_SOURCE_URL専用の部分確定条件を満たしていません。D以外の未紐付け・エラー・修正版候補が混在していないか確認してください。");
  }
  return { heldRows, saveRows };
}

export async function confirmTownImport(batchId: string, forceDuplicate: boolean, options?: { mode?: "CAST_ONLY_HOLD_PARTIAL" | "ID_NO_SOURCE_URL_HOLD_PARTIAL"; executedBy?: string }) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error("取込履歴が見つかりません。");
  if (batch.status !== ImportBatchStatus.PREVIEW_READY && batch.status !== ImportBatchStatus.WAITING_FOR_CAST_LINK) throw new Error("この取込は確定できる状態ではありません。");
  const metadata = metadataObject(batch.metadata);
  if (metadata.duplicateCompletedBatchId && !forceDuplicate) throw new Error("同一ファイルの完了履歴があります。再処理を明示してください。");
  const preview = await readPreview<TownPreview>(batchId);
  const idPartial = options?.mode === "ID_NO_SOURCE_URL_HOLD_PARTIAL" ? assertIdNoSourceUrlPartial(preview, batch) : null;
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
      if (options?.mode === "CAST_ONLY_HOLD_PARTIAL" || options?.mode === "ID_NO_SOURCE_URL_HOLD_PARTIAL") {
        const lockPrefix = options.mode === "ID_NO_SOURCE_URL_HOLD_PARTIAL" ? "town-id-no-source-url-partial:" : "town-bulk-partial:";
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockPrefix} || ${batchId})) IS NULL AS locked`;
        const lockedBatch = await tx.importBatch.findUnique({ where: { id: batchId }, select: { status: true, errorCount: true, metadata: true } });
        if (!lockedBatch) throw new Error("取込履歴が見つかりません。");
        if (options.mode === "ID_NO_SOURCE_URL_HOLD_PARTIAL") assertIdNoSourceUrlPartial(preview, lockedBatch);
      }
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
          if (options?.mode !== "CAST_ONLY_HOLD_PARTIAL" && options?.mode !== "ID_NO_SOURCE_URL_HOLD_PARTIAL") {
            await tx.mediaListing.upsert({
              where: { castId_storeId_mediaType: { castId: row.castId, storeId: preview.storeId, mediaType: MediaType.TOWN } },
              create: { castId: row.castId, storeId: preview.storeId, mediaType: MediaType.TOWN, isListed: true, listedFrom: date },
              update: { isListed: true, listedTo: null },
            });
          }
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
        status: options?.mode === "ID_NO_SOURCE_URL_HOLD_PARTIAL" ? ImportBatchStatus.COMPLETED_WITH_WARNINGS : (hasWarnings ? ImportBatchStatus.COMPLETED_WITH_WARNINGS : ImportBatchStatus.COMPLETED),
        completedAt: new Date(), insertedCount, updatedCount, pendingCount: summary.pendingCount,
        skippedCount: summary.skippedCount, warningCount: summary.warningCount + (summary.pendingCount > 0 ? 1 : 0), errorCount: summary.errorCount, failureMessage: null,
        metadata: { ...metadata, partialImport: summary.pendingCount > 0, confirmedAt: new Date().toISOString(), insertedKeys: rows.filter((row) => !existingKeys.has(key(row))).map(key), updatedKeys: rows.filter((row) => existingKeys.has(key(row))).map(key), importEvents: [...importEvents(metadata.importEvents), { type: "INITIAL_CONFIRM", inserted: insertedCount, updated: updatedCount, at: new Date().toISOString() }, ...(options?.mode === "CAST_ONLY_HOLD_PARTIAL" ? [{ type: "TOWN_CAST_ONLY_HOLD_PARTIAL_CONFIRM", mode: options.mode, executedBy: options.executedBy || null, executedAt: new Date().toISOString(), batchId, fileName: batch.originalFilename, storeName: preview.storeName, savedRows: rows.length, urlRows: rows.filter((row) => row.kind === "URL").length, landingRows: rows.filter((row) => row.kind === "LANDING").length, unmatchedUrlLandingRows: preview.rows.filter((row) => (row.kind === "URL" || row.kind === "LANDING") && row.resolutionStatus === "UNMATCHED").length, warningCount: summary.warningCount }] : []), ...(options?.mode === "ID_NO_SOURCE_URL_HOLD_PARTIAL" ? [{ type: "TOWN_ID_NO_SOURCE_URL_HOLD_PARTIAL_CONFIRM", mode: options.mode, executedBy: options.executedBy || null, executedAt: new Date().toISOString(), batchId, fileName: batch.originalFilename, savedRows: rows.length, insertedRows: insertedCount, updatedRows: updatedCount, heldRows: idPartial?.heldRows || 0, warningCount: summary.warningCount }] : [])] },
      } });
    }, { maxWait: 10_000, timeout: 60_000 });
  } catch (error) {
    await prisma.importBatch.update({ where: { id: batchId }, data: { status: ImportBatchStatus.FAILED, completedAt: new Date(), failureMessage: "タウン取込確定処理に失敗しました。" } });
    throw error;
  }
  return { insertedCount, updatedCount, pendingCount: summary.pendingCount };
}
