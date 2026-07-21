import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImportDataType, ImportMode, ImprovementType, MediaType, StoreCode, TownPageType } from "@/generated/prisma/client";
import { executeCastMerge, previewCastMerge } from "@/lib/casts/merge-service";
import { prisma } from "@/lib/prisma";

const suffix = randomUUID().slice(0, 8);
const castIds: string[] = [];
let adminId = ""; let kasukabeId = ""; let koshigayaId = ""; let sourceId = ""; let batchId = "";

async function cast(name: string) {
  const row = await prisma.cast.create({ data: { displayName: `${name}-${suffix}`, normalizedName: `${name}-${suffix}`, startedOn: new Date("2097-01-01T00:00:00Z"), primaryStoreId: kasukabeId } });
  castIds.push(row.id); return row;
}

function ctiData(castId: string, date: string, salesAmount = 10000) {
  return { businessDate: new Date(`${date}T00:00:00Z`), storeId: kasukabeId, castId, importBatchId: batchId, sourceSheetName: "統合試験", sourceRowNumber: 2, attendanceCount: 1, attendanceMinutes: 60, sameDayAbsenceCount: 0, reservationCount: 1, cancellationCount: 0, serviceCount: 1, regularNominationCount: 1, photoNominationCount: 0, freeCount: 0, contractCount: 1, salesAmount, castRewardAmount: 5000, ctiProfitAmount: 5000, payoutAfterRewardAmount: 5000, diaryCountCti: 0, paidOptionCount: 0 };
}

beforeAll(async () => {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const kasukabe = await prisma.store.findUniqueOrThrow({ where: { code: StoreCode.KASUKABE } });
  const koshigaya = await prisma.store.findUniqueOrThrow({ where: { code: StoreCode.KOSHIGAYA } });
  adminId = admin.id; kasukabeId = kasukabe.id; koshigayaId = koshigaya.id;
  const source = await prisma.importSource.create({ data: { name: `Cast統合試験-${suffix}`, mediaType: MediaType.CTI, dataType: ImportDataType.CTI_CAST_REPORT, storeId: kasukabeId } }); sourceId = source.id;
  const batch = await prisma.importBatch.create({ data: { importSourceId: sourceId, originalFilename: `${suffix}.xlsx`, storedFilename: `${suffix}.xlsx`, storagePath: `${suffix}.xlsx`, fileHash: suffix.padEnd(64, "0"), fileSizeBytes: BigInt(1), dataType: ImportDataType.CTI_CAST_REPORT, importMode: ImportMode.DAILY, targetFrom: new Date("2097-01-01T00:00:00Z"), targetTo: new Date("2097-12-31T00:00:00Z") } }); batchId = batch.id;
});

afterAll(async () => {
  await prisma.castMergeHistory.deleteMany({ where: { OR: [{ sourceCastId: { in: castIds } }, { targetCastId: { in: castIds } }] } });
  await prisma.cast.updateMany({ where: { id: { in: castIds } }, data: { mergedIntoCastId: null, mergedAt: null } });
  await prisma.townLandingDaily.deleteMany({ where: { castId: { in: castIds } } });
  await prisma.townUrlDaily.deleteMany({ where: { castId: { in: castIds } } });
  await prisma.townCastDaily.deleteMany({ where: { castId: { in: castIds } } });
  await prisma.ctiCastDaily.deleteMany({ where: { castId: { in: castIds } } });
  await prisma.improvementLog.deleteMany({ where: { castId: { in: castIds } } });
  await prisma.mediaListing.deleteMany({ where: { castId: { in: castIds } } });
  await prisma.castAlias.deleteMany({ where: { castId: { in: castIds } } });
  await prisma.castNameHistory.deleteMany({ where: { castId: { in: castIds } } });
  await prisma.cast.deleteMany({ where: { id: { in: castIds } } });
  if (batchId) await prisma.importBatch.delete({ where: { id: batchId } });
  if (sourceId) await prisma.importSource.delete({ where: { id: sourceId } });
  await prisma.$disconnect();
});

describe("cast merge integration", () => {
  it("moves every Cast relation, preserves both aliases, and keeps source as an audit record", async () => {
    const source = await cast("久統合A"); const target = await cast("統合A"); const previousSource = await cast("旧統合A");
    await prisma.cast.update({ where: { id: previousSource.id }, data: { mergedIntoCastId: source.id, mergedAt: new Date("2097-01-02T00:00:00Z") } });
    await prisma.castAlias.createMany({ data: [
      { mediaType: MediaType.CTI, aliasName: `久統合A-${suffix}`, normalizedAlias: `久統合A-${suffix}`, castId: source.id, storeId: kasukabeId, reviewStatus: "MAPPED", validFrom: new Date("2097-01-01T00:00:00Z") },
      { mediaType: MediaType.TOWN, aliasName: `統合A-${suffix}`, normalizedAlias: `統合A-${suffix}`, castId: target.id, storeId: kasukabeId, reviewStatus: "MAPPED", validFrom: new Date("2097-01-01T00:00:00Z") },
    ] });
    await prisma.mediaListing.create({ data: { castId: source.id, storeId: koshigayaId, mediaType: MediaType.TOWN, isListed: true } });
    await prisma.castNameHistory.create({ data: { castId: source.id, oldName: "旧名", newName: source.displayName, changedByUserId: adminId } });
    await prisma.ctiCastDaily.create({ data: ctiData(source.id, "2097-01-03") });
    await prisma.townCastDaily.create({ data: { date: new Date("2097-01-03T00:00:00Z"), storeId: kasukabeId, castId: target.id, importBatchId: batchId, sourceCastName: target.displayName, pv: 10, uu: 5, telTapUu: 1, sourceRowNumber: 2 } });
    await prisma.townUrlDaily.create({ data: { date: new Date("2097-01-03T00:00:00Z"), storeId: kasukabeId, castId: source.id, importBatchId: batchId, url: `https://example.test/${suffix}/a`, normalizedUrl: `https://example.test/${suffix}/a`, sourceCastName: source.displayName, pageType: TownPageType.CAST_PROFILE, pv: 1, uu: 1, telTapUu: 0, sourceRowNumber: 2 } });
    await prisma.townLandingDaily.create({ data: { date: new Date("2097-01-03T00:00:00Z"), storeId: kasukabeId, castId: source.id, importBatchId: batchId, landingUrl: `https://example.test/${suffix}/a`, normalizedUrl: `https://example.test/${suffix}/a`, sourceCastName: source.displayName, pageType: TownPageType.CAST_PROFILE, uu: 1, telTapUu: 0, sourceRowNumber: 2 } });
    await prisma.improvementLog.create({ data: { castId: source.id, storeId: kasukabeId, type: ImprovementType.GROWING, title: "統合試験", message: "統合試験", ruleVersion: "test", observedFrom: new Date("2097-01-01T00:00:00Z"), observedTo: new Date("2097-01-03T00:00:00Z") } });
    const preview = await previewCastMerge(source.id, target.id);
    const result = await executeCastMerge({ sourceCastId: source.id, targetCastId: target.id, expectedFingerprint: preview.fingerprint, finalValues: { displayName: target.displayName, primaryStoreId: kasukabeId, startedOn: source.startedOn, endedOn: null, notes: null }, mergedByUserId: adminId, reason: "統合テスト" });
    expect(result.targetCastId).toBe(target.id);
    expect(await prisma.cast.findUnique({ where: { id: source.id } })).toMatchObject({ id: source.id, displayName: source.displayName, status: "ACTIVE", mergedIntoCastId: target.id });
    expect(await prisma.cast.findUnique({ where: { id: previousSource.id } })).toMatchObject({ mergedIntoCastId: target.id, mergedAt: new Date("2097-01-02T00:00:00Z") });
    expect(await prisma.castAlias.count({ where: { castId: source.id } })).toBe(0);
    expect(await prisma.castAlias.count({ where: { castId: target.id } })).toBe(2);
    expect(await prisma.mediaListing.count({ where: { castId: target.id } })).toBe(1);
    expect(await prisma.ctiCastDaily.count({ where: { castId: target.id } })).toBe(1);
    expect(await prisma.townCastDaily.count({ where: { castId: target.id } })).toBe(1);
    expect(await prisma.townUrlDaily.count({ where: { castId: target.id } })).toBe(1);
    expect(await prisma.townLandingDaily.count({ where: { castId: target.id } })).toBe(1);
    expect(await prisma.castNameHistory.count({ where: { castId: target.id } })).toBe(1);
    expect(await prisma.improvementLog.count({ where: { castId: target.id } })).toBe(1);
    expect(await prisma.cast.count({ where: { id: source.id, mergedIntoCastId: null } })).toBe(0);
    const history = await prisma.castMergeHistory.findUniqueOrThrow({ where: { id: result.historyId } });
    expect(history).toMatchObject({ sourceCastId: source.id, targetCastId: target.id, mergedByUserId: adminId });
  });

  it("collapses a completely identical unique-key record without adding values", async () => {
    const source = await cast("重複B元"); const target = await cast("重複B先");
    await prisma.ctiCastDaily.createMany({ data: [ctiData(source.id, "2097-02-01"), ctiData(target.id, "2097-02-01")] });
    const preview = await previewCastMerge(source.id, target.id);
    expect(preview.exactDuplicates).toHaveLength(1); expect(preview.canMerge).toBe(true);
    await executeCastMerge({ sourceCastId: source.id, targetCastId: target.id, expectedFingerprint: preview.fingerprint, finalValues: { displayName: target.displayName, primaryStoreId: kasukabeId, startedOn: target.startedOn, endedOn: null, notes: null }, mergedByUserId: adminId, reason: null });
    expect(await prisma.ctiCastDaily.count({ where: { castId: target.id, businessDate: new Date("2097-02-01T00:00:00Z") } })).toBe(1);
  });

  it("blocks a differing collision and leaves both casts untouched", async () => {
    const source = await cast("衝突C元"); const target = await cast("衝突C先");
    await prisma.ctiCastDaily.createMany({ data: [ctiData(source.id, "2097-03-01", 10000), ctiData(target.id, "2097-03-01", 20000)] });
    const preview = await previewCastMerge(source.id, target.id);
    expect(preview.blockingConflicts).toHaveLength(1); expect(preview.canMerge).toBe(false);
    await expect(executeCastMerge({ sourceCastId: source.id, targetCastId: target.id, expectedFingerprint: preview.fingerprint, finalValues: { displayName: target.displayName, primaryStoreId: kasukabeId, startedOn: target.startedOn, endedOn: null, notes: null }, mergedByUserId: adminId, reason: null })).rejects.toThrow("衝突");
    expect(await prisma.ctiCastDaily.count({ where: { castId: source.id } })).toBe(1);
    expect(await prisma.cast.findUnique({ where: { id: source.id } })).toMatchObject({ mergedIntoCastId: null });
  });

  it("rolls back relation moves when a later write fails", async () => {
    const source = await cast("取消D元"); const target = await cast("取消D先");
    await prisma.ctiCastDaily.create({ data: ctiData(source.id, "2097-04-01") });
    const preview = await previewCastMerge(source.id, target.id);
    await expect(executeCastMerge({ sourceCastId: source.id, targetCastId: target.id, expectedFingerprint: preview.fingerprint, finalValues: { displayName: "長".repeat(101), primaryStoreId: kasukabeId, startedOn: target.startedOn, endedOn: null, notes: null }, mergedByUserId: adminId, reason: null })).rejects.toThrow();
    expect(await prisma.ctiCastDaily.count({ where: { castId: source.id } })).toBe(1);
    expect(await prisma.ctiCastDaily.count({ where: { castId: target.id } })).toBe(0);
    expect(await prisma.cast.findUnique({ where: { id: source.id } })).toMatchObject({ mergedIntoCastId: null });
  });

  it("rejects same ids, merged sources, and merged targets", async () => {
    const source = await cast("禁止E元"); const target = await cast("禁止E先"); const other = await cast("禁止E他");
    await expect(previewCastMerge(source.id, source.id)).rejects.toThrow("同じキャスト");
    await prisma.cast.update({ where: { id: source.id }, data: { mergedIntoCastId: target.id, mergedAt: new Date() } });
    await expect(previewCastMerge(source.id, other.id)).rejects.toThrow("sourceCast");
    await expect(previewCastMerge(other.id, source.id)).rejects.toThrow("統合先");
  });
});
