import { MediaType, type Prisma } from "@/generated/prisma/client";
import { parseDateOnly } from "@/lib/date";
import type { TownPreview, TownPreviewRow } from "@/lib/imports/town/types";

export function townRowKey(row: TownPreviewRow) {
  if (row.kind === "STORE") return row.date;
  if (row.kind === "CAST") return `${row.date}:${row.castId}`;
  return `${row.date}:${row.normalizedUrl}`;
}

export async function persistTownRow(tx: Prisma.TransactionClient, batchId: string, preview: TownPreview, row: TownPreviewRow) {
  const date = parseDateOnly(row.date);
  const key = townRowKey(row);
  if (row.kind === "STORE") {
    const existing = await tx.townStoreDaily.findUnique({ where: { date_storeId: { date, storeId: preview.storeId } }, select: { importBatchId: true } });
    const data = { importBatchId: batchId, pv: row.pv, uu: row.uu, averagePv: row.averagePv, sourceAveragePv: row.sourceAveragePv, bounceRate: row.bounceRate, telTapUu: row.telTapUu, conversionRate: row.conversionRate, sourceConversionRate: row.sourceConversionRate, sourceRowNumber: row.sourceRowNumber };
    await tx.townStoreDaily.upsert({ where: { date_storeId: { date, storeId: preview.storeId } }, create: { date, storeId: preview.storeId, ...data }, update: data });
    return { key, existed: Boolean(existing), existingImportBatchId: existing?.importBatchId || null, persisted: true };
  }
  if (row.kind === "CAST" && row.castId) {
    const existing = await tx.townCastDaily.findUnique({ where: { date_storeId_castId: { date, storeId: preview.storeId, castId: row.castId } }, select: { importBatchId: true } });
    if (existing?.importBatchId === batchId) return { key, existed: true, existingImportBatchId: batchId, persisted: false };
    const data = { importBatchId: batchId, sourceCastName: row.originalCastName, pv: row.pv, uu: row.uu, averagePv: row.averagePv, sourceAveragePv: row.sourceAveragePv, telTapUu: row.telTapUu, conversionRate: row.conversionRate, sourceConversionRate: row.sourceConversionRate, isListed: true, sourceRowNumber: row.sourceRowNumber };
    await tx.townCastDaily.upsert({ where: { date_storeId_castId: { date, storeId: preview.storeId, castId: row.castId } }, create: { date, storeId: preview.storeId, castId: row.castId, ...data }, update: data });
    await tx.mediaListing.upsert({ where: { castId_storeId_mediaType: { castId: row.castId, storeId: preview.storeId, mediaType: MediaType.TOWN } }, create: { castId: row.castId, storeId: preview.storeId, mediaType: MediaType.TOWN, isListed: true, listedFrom: date }, update: { isListed: true, listedTo: null } });
    return { key, existed: Boolean(existing), existingImportBatchId: existing?.importBatchId || null, persisted: true };
  }
  if (row.kind === "URL") {
    const existing = await tx.townUrlDaily.findUnique({ where: { date_storeId_normalizedUrl: { date, storeId: preview.storeId, normalizedUrl: row.normalizedUrl } }, select: { importBatchId: true } });
    const data = { importBatchId: batchId, url: row.url, externalStoreId: row.externalStoreId, externalCastId: row.externalCastId, castId: row.castId, sourceCastName: row.sourceCastName, pageType: row.pageType, pv: row.pv, uu: row.uu, averagePv: row.averagePv, sourceAveragePv: row.sourceAveragePv, telTapUu: row.telTapUu, conversionRate: row.conversionRate, sourceConversionRate: row.sourceConversionRate, sourceRowNumber: row.sourceRowNumber };
    await tx.townUrlDaily.upsert({ where: { date_storeId_normalizedUrl: { date, storeId: preview.storeId, normalizedUrl: row.normalizedUrl } }, create: { date, storeId: preview.storeId, normalizedUrl: row.normalizedUrl, ...data }, update: data });
    return { key, existed: Boolean(existing), existingImportBatchId: existing?.importBatchId || null, persisted: true };
  }
  if (row.kind === "LANDING") {
    const existing = await tx.townLandingDaily.findUnique({ where: { date_storeId_normalizedUrl: { date, storeId: preview.storeId, normalizedUrl: row.normalizedUrl } }, select: { importBatchId: true } });
    const data = { importBatchId: batchId, landingUrl: row.landingUrl, externalStoreId: row.externalStoreId, externalCastId: row.externalCastId, castId: row.castId, sourceCastName: row.sourceCastName, pageType: row.pageType, uu: row.uu, bounceRate: row.bounceRate, telTapUu: row.telTapUu, conversionRate: row.conversionRate, sourceConversionRate: row.sourceConversionRate, sourceRowNumber: row.sourceRowNumber };
    await tx.townLandingDaily.upsert({ where: { date_storeId_normalizedUrl: { date, storeId: preview.storeId, normalizedUrl: row.normalizedUrl } }, create: { date, storeId: preview.storeId, normalizedUrl: row.normalizedUrl, ...data }, update: data });
    return { key, existed: Boolean(existing), existingImportBatchId: existing?.importBatchId || null, persisted: true };
  }
  throw new Error("保存可能なタウン行ではありません。");
}
