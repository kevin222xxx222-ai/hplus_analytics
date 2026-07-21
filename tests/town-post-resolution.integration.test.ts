import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImportBatchStatus, ImportDataType, ImportMode, StoreCode, TownPageType } from "@/generated/prisma/client";
import { getPreviewPath, writePreview } from "@/lib/imports/storage";
import { inspectTownCastCreation, resolveTownPreviewRow } from "@/lib/imports/town/resolution-service";
import type { TownCastPreviewRow, TownLandingPreviewRow, TownPreview, TownPreviewRow, TownUrlPreviewRow } from "@/lib/imports/town/types";
import { prisma } from "@/lib/prisma";

const batchIds: string[] = []; const castIds: string[] = [];
let userId = ""; let kasukabeId = ""; let koshigayaId = ""; let kukiId = "";
const sourceIds = new Map<string, string>();

function sourceKey(storeId: string, dataType: ImportDataType) { return `${storeId}:${dataType}`; }
function uniqueName(label: string) { return `${label}-${randomUUID().slice(0, 8)}`; }

function castRow(rowNumber: number, name: string, castId: string | null, date = "2099-03-01", pv = 100): TownCastPreviewRow {
  return { kind: "CAST", rowKey: `CAST:${rowNumber}`, sourceRowNumber: rowNumber, date, originalCastName: name, normalizedCastName: name, castId, castDisplayName: castId ? name : null, resolutionStatus: castId ? "EXACT_ALIAS" : "UNMATCHED", isListed: true, pv, uu: 20, averagePv: pv / 20, sourceAveragePv: pv / 20, telTapUu: 1, conversionRate: 0.05, sourceConversionRate: 0.05, issues: castId ? [] : [{ code: "UNMATCHED_CAST", level: "WARNING", message: "未紐付け" }] };
}

function urlRow(rowNumber: number, name: string, date = "2099-03-01"): TownUrlPreviewRow {
  const url = `https://www.dto.jp/gal/${randomUUID()}`;
  return { kind: "URL", rowKey: `URL:${rowNumber}`, sourceRowNumber: rowNumber, date, url, normalizedUrl: url, externalStoreId: null, externalCastId: null, sourceCastName: name, normalizedCastName: name, castId: null, castDisplayName: null, resolutionStatus: "UNMATCHED", pageType: TownPageType.CAST_PROFILE, pv: 50, uu: 10, averagePv: 5, sourceAveragePv: 5, telTapUu: 1, conversionRate: 0.1, sourceConversionRate: 0.1, issues: [{ code: "UNMATCHED_CAST", level: "WARNING", message: "未紐付け" }] };
}

function landingRow(rowNumber: number, name: string, date = "2099-03-01"): TownLandingPreviewRow {
  const landingUrl = `https://www.dto.jp/gal/${randomUUID()}`;
  return { kind: "LANDING", rowKey: `LANDING:${rowNumber}`, sourceRowNumber: rowNumber, date, landingUrl, normalizedUrl: landingUrl, externalStoreId: null, externalCastId: null, sourceCastName: name, normalizedCastName: name, castId: null, castDisplayName: null, resolutionStatus: "UNMATCHED", pageType: TownPageType.CAST_PROFILE, uu: 10, bounceRate: 0.2, telTapUu: 1, conversionRate: 0.1, sourceConversionRate: 0.1, issues: [{ code: "UNMATCHED_CAST", level: "WARNING", message: "未紐付け" }] };
}

async function createCast(displayName: string, endedOn: Date | null = null) {
  const cast = await prisma.cast.create({ data: { displayName, normalizedName: displayName, startedOn: new Date("2099-01-01T00:00:00Z"), endedOn, primaryStoreId: kasukabeId } });
  castIds.push(cast.id); return cast;
}

async function createBatch(storeId: string, storeCode: StoreCode, dataType: ImportDataType, rows: TownPreviewRow[], status: ImportBatchStatus, insertedKeys: string[] = []) {
  const id = randomUUID(); const runId = randomUUID(); const fileHash = randomUUID().replaceAll("-", "").padEnd(64, "0"); batchIds.push(id);
  const sourceId = sourceIds.get(sourceKey(storeId, dataType)); if (!sourceId) throw new Error("source missing");
  const unresolved = rows.filter((row) => row.kind !== "STORE" && row.castId === null && row.resolutionStatus !== "SKIPPED");
  await prisma.importBatch.create({ data: { id, runId, importSourceId: sourceId, originalFilename: `${id}.csv`, storedFilename: `${id}.csv`, storagePath: `${id}.csv`, fileHash, fileSizeBytes: 100n, dataType, importMode: ImportMode.DAILY, targetFrom: new Date("2099-03-01T00:00:00Z"), targetTo: new Date("2099-03-01T00:00:00Z"), status, uploadedByUserId: userId, insertedCount: insertedKeys.length, pendingCount: unresolved.length, warningCount: unresolved.length + (status === ImportBatchStatus.COMPLETED_WITH_WARNINGS ? 1 : 0), completedAt: status === ImportBatchStatus.COMPLETED || status === ImportBatchStatus.COMPLETED_WITH_WARNINGS ? new Date() : null, metadata: { insertedKeys, updatedKeys: [], importEvents: [{ type: "INITIAL_CONFIRM", inserted: insertedKeys.length, updated: 0, at: new Date().toISOString() }] } } });
  if (unresolved.length) await prisma.importError.createMany({ data: unresolved.map((row) => ({ runId, importSourceId: sourceId, importBatchId: id, fileName: `${id}.csv`, fileHash, rowNumber: row.sourceRowNumber, errorCode: "UNMATCHED_CAST", level: "WARNING", message: "未紐付け" })) });
  if (status === ImportBatchStatus.COMPLETED_WITH_WARNINGS) await prisma.importError.create({ data: { runId, importSourceId: sourceId, importBatchId: id, fileName: `${id}.csv`, fileHash, errorCode: "PARTIAL_IMPORT", level: "WARNING", message: "部分取込" } });
  const preview: TownPreview = { version: 1, batchId: id, runId, dataType: dataType as TownPreview["dataType"], storeId, storeCode, storeName: storeCode === StoreCode.KASUKABE ? "春日部" : "越谷", targetFrom: "2099-03-01", targetTo: "2099-03-01", sourcePeriodFrom: "2099-03-01", sourcePeriodTo: "2099-03-01", encoding: "UTF-8", delimiter: ",", headerRow: 4, detectedColumns: [], unknownColumns: [], rows, globalIssues: [], createdAt: new Date().toISOString() };
  await writePreview(id, preview); return { id, preview };
}

beforeAll(async () => {
  const [user, kasukabe, koshigaya, kuki, sources] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } }),
    prisma.store.findUniqueOrThrow({ where: { code: StoreCode.KASUKABE } }),
    prisma.store.findUniqueOrThrow({ where: { code: StoreCode.KOSHIGAYA } }),
    prisma.store.findUniqueOrThrow({ where: { code: StoreCode.KUKI } }),
    prisma.importSource.findMany({ where: { dataType: { in: [ImportDataType.TOWN_CAST, ImportDataType.TOWN_URL, ImportDataType.TOWN_LANDING] } } }),
  ]);
  userId = user.id; kasukabeId = kasukabe.id; koshigayaId = koshigaya.id; kukiId = kuki.id;
  sources.forEach((source) => { if (source.storeId) sourceIds.set(sourceKey(source.storeId, source.dataType), source.id); });
});

afterAll(async () => {
  await prisma.townCastDaily.deleteMany({ where: { importBatchId: { in: batchIds } } });
  await prisma.townUrlDaily.deleteMany({ where: { importBatchId: { in: batchIds } } });
  await prisma.townLandingDaily.deleteMany({ where: { importBatchId: { in: batchIds } } });
  await prisma.importBatch.deleteMany({ where: { id: { in: batchIds } } });
  await prisma.mediaListing.deleteMany({ where: { castId: { in: castIds } } });
  await prisma.castAlias.deleteMany({ where: { castId: { in: castIds } } });
  await prisma.cast.deleteMany({ where: { id: { in: castIds } } });
  await Promise.all(batchIds.map((id) => unlink(getPreviewPath(id)).catch(() => undefined)));
  await prisma.$disconnect();
});

describe("Town post-resolution import", () => {
  it("adds only newly resolved rows, preserves existing rows and completes after the final resolution", async () => {
    const existing = await createCast(uniqueName("既存")); const targetA = await createCast(uniqueName("追加A")); const targetB = await createCast(uniqueName("追加B"));
    const nameA = uniqueName("原文A"); const nameB = uniqueName("原文B");
    const existingRow = castRow(5, existing.displayName, existing.id, "2099-03-01", 333);
    const batch = await createBatch(kasukabeId, StoreCode.KASUKABE, ImportDataType.TOWN_CAST, [existingRow, castRow(6, nameA, null, "2099-03-01", 111), castRow(7, nameB, null, "2099-03-01", 222)], ImportBatchStatus.COMPLETED_WITH_WARNINGS, [`2099-03-01:${existing.id}`]);
    await prisma.townCastDaily.create({ data: { date: new Date("2099-03-01T00:00:00Z"), storeId: kasukabeId, castId: existing.id, importBatchId: batch.id, sourceCastName: existing.displayName, pv: 333, uu: 20, averagePv: 16.65, sourceAveragePv: 16.65, telTapUu: 1, conversionRate: 0.05, sourceConversionRate: 0.05, isListed: true, sourceRowNumber: 5 } });

    await resolveTownPreviewRow(batch.id, "CAST:6", { action: "EXISTING", castId: targetA.id });
    const afterOne = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(afterOne).toMatchObject({ status: ImportBatchStatus.COMPLETED_WITH_WARNINGS, insertedCount: 2, updatedCount: 0, pendingCount: 1, warningCount: 2 });
    expect(await prisma.townCastDaily.count({ where: { importBatchId: batch.id } })).toBe(2);
    expect((await prisma.townCastDaily.findUniqueOrThrow({ where: { date_storeId_castId: { date: new Date("2099-03-01T00:00:00Z"), storeId: kasukabeId, castId: existing.id } } })).pv).toBe(333);

    await resolveTownPreviewRow(batch.id, "CAST:7", { action: "EXISTING", castId: targetB.id });
    const completed = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(completed).toMatchObject({ status: ImportBatchStatus.COMPLETED, insertedCount: 3, updatedCount: 0, pendingCount: 0, warningCount: 0, errorCount: 0 });
    expect(await prisma.townCastDaily.count({ where: { importBatchId: batch.id } })).toBe(3);
  });

  it("skips only the selected batch and does not change MediaListing", async () => {
    const name = uniqueName("除外");
    const selected = await createBatch(kasukabeId, StoreCode.KASUKABE, ImportDataType.TOWN_CAST, [castRow(10, name, null)], ImportBatchStatus.COMPLETED_WITH_WARNINGS);
    const other = await createBatch(kasukabeId, StoreCode.KASUKABE, ImportDataType.TOWN_CAST, [castRow(10, name, null)], ImportBatchStatus.COMPLETED_WITH_WARNINGS);
    const listingBefore = await prisma.mediaListing.count();
    await resolveTownPreviewRow(selected.id, "CAST:10", { action: "SKIP" });
    expect(await prisma.importBatch.findUniqueOrThrow({ where: { id: selected.id } })).toMatchObject({ status: ImportBatchStatus.COMPLETED, pendingCount: 0, skippedCount: 1, warningCount: 0 });
    expect(await prisma.importBatch.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ status: ImportBatchStatus.COMPLETED_WITH_WARNINGS, pendingCount: 1 });
    expect(await prisma.mediaListing.count()).toBe(listingBefore);
  });

  it("re-resolves same-store URL/LP but never the same name in another store", async () => {
    const target = await createCast(uniqueName("横断対象")); const sourceName = uniqueName("横断原文");
    const castBatch = await createBatch(kasukabeId, StoreCode.KASUKABE, ImportDataType.TOWN_CAST, [castRow(20, sourceName, null)], ImportBatchStatus.COMPLETED_WITH_WARNINGS);
    const url = urlRow(20, sourceName); const urlBatch = await createBatch(kasukabeId, StoreCode.KASUKABE, ImportDataType.TOWN_URL, [url], ImportBatchStatus.COMPLETED_WITH_WARNINGS, [`2099-03-01:${url.normalizedUrl}`]);
    const lp = landingRow(20, sourceName); const lpBatch = await createBatch(kasukabeId, StoreCode.KASUKABE, ImportDataType.TOWN_LANDING, [lp], ImportBatchStatus.COMPLETED_WITH_WARNINGS, [`2099-03-01:${lp.normalizedUrl}`]);
    const otherUrl = urlRow(20, sourceName); const otherBatch = await createBatch(koshigayaId, StoreCode.KOSHIGAYA, ImportDataType.TOWN_URL, [otherUrl], ImportBatchStatus.COMPLETED_WITH_WARNINGS, [`2099-03-01:${otherUrl.normalizedUrl}`]);
    await prisma.townUrlDaily.createMany({ data: [
      { date: new Date("2099-03-01T00:00:00Z"), storeId: kasukabeId, importBatchId: urlBatch.id, url: url.url, normalizedUrl: url.normalizedUrl, sourceCastName: sourceName, pageType: url.pageType, pv: url.pv, uu: url.uu, averagePv: url.averagePv, sourceAveragePv: url.sourceAveragePv, telTapUu: url.telTapUu, conversionRate: url.conversionRate, sourceConversionRate: url.sourceConversionRate, sourceRowNumber: url.sourceRowNumber },
      { date: new Date("2099-03-01T00:00:00Z"), storeId: koshigayaId, importBatchId: otherBatch.id, url: otherUrl.url, normalizedUrl: otherUrl.normalizedUrl, sourceCastName: sourceName, pageType: otherUrl.pageType, pv: otherUrl.pv, uu: otherUrl.uu, averagePv: otherUrl.averagePv, sourceAveragePv: otherUrl.sourceAveragePv, telTapUu: otherUrl.telTapUu, conversionRate: otherUrl.conversionRate, sourceConversionRate: otherUrl.sourceConversionRate, sourceRowNumber: otherUrl.sourceRowNumber },
    ] });
    await prisma.townLandingDaily.create({ data: { date: new Date("2099-03-01T00:00:00Z"), storeId: kasukabeId, importBatchId: lpBatch.id, landingUrl: lp.landingUrl, normalizedUrl: lp.normalizedUrl, sourceCastName: sourceName, pageType: lp.pageType, uu: lp.uu, bounceRate: lp.bounceRate, telTapUu: lp.telTapUu, conversionRate: lp.conversionRate, sourceConversionRate: lp.sourceConversionRate, sourceRowNumber: lp.sourceRowNumber } });

    await resolveTownPreviewRow(castBatch.id, "CAST:20", { action: "EXISTING", castId: target.id });
    expect(await prisma.townUrlDaily.findUniqueOrThrow({ where: { date_storeId_normalizedUrl: { date: new Date("2099-03-01T00:00:00Z"), storeId: kasukabeId, normalizedUrl: url.normalizedUrl } } })).toMatchObject({ castId: target.id });
    expect(await prisma.townLandingDaily.findUniqueOrThrow({ where: { date_storeId_normalizedUrl: { date: new Date("2099-03-01T00:00:00Z"), storeId: kasukabeId, normalizedUrl: lp.normalizedUrl } } })).toMatchObject({ castId: target.id });
    expect(await prisma.townUrlDaily.findUniqueOrThrow({ where: { date_storeId_normalizedUrl: { date: new Date("2099-03-01T00:00:00Z"), storeId: koshigayaId, normalizedUrl: otherUrl.normalizedUrl } } })).toMatchObject({ castId: null });
    expect(await prisma.importBatch.findUniqueOrThrow({ where: { id: urlBatch.id } })).toMatchObject({ insertedCount: 1, updatedCount: 0, pendingCount: 0, status: ImportBatchStatus.COMPLETED });
    expect(await prisma.importBatch.findUniqueOrThrow({ where: { id: otherBatch.id } })).toMatchObject({ pendingCount: 1, status: ImportBatchStatus.COMPLETED_WITH_WARNINGS });
  });

  it("rejects linking a cast outside the business-date employment period", async () => {
    const ended = await createCast(uniqueName("期間外"), new Date("2099-02-01T00:00:00Z"));
    const batch = await createBatch(kasukabeId, StoreCode.KASUKABE, ImportDataType.TOWN_CAST, [castRow(30, uniqueName("期間外原文"), null)], ImportBatchStatus.COMPLETED_WITH_WARNINGS);
    await expect(resolveTownPreviewRow(batch.id, "CAST:30", { action: "EXISTING", castId: ended.id })).rejects.toThrow("在籍期間内");
  });

  it("creates a Town cast, alias and listing, then resolves existing CAST/URL/LP rows", async () => {
    const sourceName = uniqueName("Town新規");
    const castBatch = await createBatch(kasukabeId, StoreCode.KASUKABE, ImportDataType.TOWN_CAST, [castRow(40, sourceName, null, "2099-03-01", 444)], ImportBatchStatus.COMPLETED_WITH_WARNINGS);
    const url = urlRow(40, sourceName); const urlBatch = await createBatch(kasukabeId, StoreCode.KASUKABE, ImportDataType.TOWN_URL, [url], ImportBatchStatus.COMPLETED_WITH_WARNINGS, [`2099-03-01:${url.normalizedUrl}`]);
    const lp = landingRow(40, sourceName); const lpBatch = await createBatch(kasukabeId, StoreCode.KASUKABE, ImportDataType.TOWN_LANDING, [lp], ImportBatchStatus.COMPLETED_WITH_WARNINGS, [`2099-03-01:${lp.normalizedUrl}`]);
    await prisma.townUrlDaily.create({ data: { date: new Date("2099-03-01T00:00:00Z"), storeId: kasukabeId, importBatchId: urlBatch.id, url: url.url, normalizedUrl: url.normalizedUrl, sourceCastName: sourceName, pageType: url.pageType, pv: url.pv, uu: url.uu, averagePv: url.averagePv, sourceAveragePv: url.sourceAveragePv, telTapUu: url.telTapUu, conversionRate: url.conversionRate, sourceConversionRate: url.sourceConversionRate, sourceRowNumber: url.sourceRowNumber } });
    await prisma.townLandingDaily.create({ data: { date: new Date("2099-03-01T00:00:00Z"), storeId: kasukabeId, importBatchId: lpBatch.id, landingUrl: lp.landingUrl, normalizedUrl: lp.normalizedUrl, sourceCastName: sourceName, pageType: lp.pageType, uu: lp.uu, bounceRate: lp.bounceRate, telTapUu: lp.telTapUu, conversionRate: lp.conversionRate, sourceConversionRate: lp.sourceConversionRate, sourceRowNumber: lp.sourceRowNumber } });

    expect((await inspectTownCastCreation(castBatch.id, "CAST:40", sourceName, "2099-03-01")).candidates).toHaveLength(0);
    const result = await resolveTownPreviewRow(castBatch.id, "CAST:40", { action: "NEW", displayName: sourceName, primaryStoreId: kukiId, startedOn: "2099-03-01", notes: "Town画面から作成" });
    expect(result.createdCastId).toBeTruthy();
    castIds.push(result.createdCastId!);
    const created = await prisma.cast.findUniqueOrThrow({ where: { id: result.createdCastId! } });
    expect(created).toMatchObject({ displayName: sourceName, normalizedName: sourceName, primaryStoreId: kukiId, notes: "Town画面から作成" });
    expect(await prisma.castAlias.count({ where: { mediaType: "TOWN", storeId: kasukabeId, normalizedAlias: sourceName, castId: created.id } })).toBe(1);
    expect(await prisma.mediaListing.findUniqueOrThrow({ where: { castId_storeId_mediaType: { castId: created.id, storeId: kasukabeId, mediaType: "TOWN" } } })).toMatchObject({ isListed: true });
    expect(await prisma.townCastDaily.findUniqueOrThrow({ where: { date_storeId_castId: { date: new Date("2099-03-01T00:00:00Z"), storeId: kasukabeId, castId: created.id } } })).toMatchObject({ pv: 444 });
    expect(await prisma.townCastDaily.count({ where: { storeId: kukiId, castId: created.id } })).toBe(0);
    expect(await prisma.townUrlDaily.findUniqueOrThrow({ where: { date_storeId_normalizedUrl: { date: new Date("2099-03-01T00:00:00Z"), storeId: kasukabeId, normalizedUrl: url.normalizedUrl } } })).toMatchObject({ castId: created.id });
    expect(await prisma.townLandingDaily.findUniqueOrThrow({ where: { date_storeId_normalizedUrl: { date: new Date("2099-03-01T00:00:00Z"), storeId: kasukabeId, normalizedUrl: lp.normalizedUrl } } })).toMatchObject({ castId: created.id });
  });

  it("keeps Kuki available only as a primary affiliation store", async () => {
    expect(await prisma.store.findUniqueOrThrow({ where: { code: StoreCode.KUKI } })).toMatchObject({ name: "久喜", shortName: "久喜", isActive: true, hasManagementMetrics: false, hasAcquisitionMetrics: false });
    expect(await prisma.importSource.count({ where: { storeId: kukiId } })).toBe(0);
    expect((await prisma.store.findMany({ where: { hasManagementMetrics: true }, select: { code: true } })).map((store) => store.code)).not.toContain(StoreCode.KUKI);
    expect((await prisma.store.findMany({ where: { hasAcquisitionMetrics: true }, select: { code: true } })).map((store) => store.code)).not.toContain(StoreCode.KUKI);
  });

  it("warns for one active same-name candidate and blocks creation when multiple candidates exist", async () => {
    const sourceName = uniqueName("Town同名");
    await createCast(sourceName);
    const batch = await createBatch(kasukabeId, StoreCode.KASUKABE, ImportDataType.TOWN_CAST, [castRow(50, sourceName, null)], ImportBatchStatus.COMPLETED_WITH_WARNINGS);
    const firstCheck = await inspectTownCastCreation(batch.id, "CAST:50", sourceName, "2099-03-01");
    expect(firstCheck.candidates).toHaveLength(1);
    await expect(resolveTownPreviewRow(batch.id, "CAST:50", { action: "NEW", displayName: sourceName, primaryStoreId: kasukabeId, startedOn: "2099-03-01" })).rejects.toThrow("既存キャストへの紐付けを推奨");
    await createCast(sourceName);
    expect((await inspectTownCastCreation(batch.id, "CAST:50", sourceName, "2099-03-01")).candidates).toHaveLength(2);
    await expect(resolveTownPreviewRow(batch.id, "CAST:50", { action: "NEW", displayName: sourceName, primaryStoreId: kasukabeId, startedOn: "2099-03-01", confirmDuplicate: true })).rejects.toThrow("複数存在");
  });
});
