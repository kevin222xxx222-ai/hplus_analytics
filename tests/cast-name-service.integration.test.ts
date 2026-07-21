import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImportDataType, ImportMode, MediaType, StoreCode, TownPageType } from "@/generated/prisma/client";
import { castPeriodsOverlap, renameCast } from "@/lib/casts/name-service";
import { prisma } from "@/lib/prisma";

const suffix = randomUUID().slice(0, 8);
let castId = ""; let conflictId = ""; let batchId = ""; let sourceId = ""; let storeId = ""; let adminId = "";

beforeAll(async () => {
  const [store, admin] = await Promise.all([
    prisma.store.findUniqueOrThrow({ where: { code: StoreCode.KASUKABE } }),
    prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } }),
  ]);
  storeId = store.id; adminId = admin.id;
  const source = await prisma.importSource.create({ data: { name: `表示名変更試験-${suffix}`, mediaType: MediaType.CTI, dataType: ImportDataType.CTI_CAST_REPORT, storeId } });
  sourceId = source.id;
  const batch = await prisma.importBatch.create({ data: {
    importSourceId: sourceId, originalFilename: `${suffix}.xlsx`, storedFilename: `${suffix}.xlsx`, storagePath: `${suffix}.xlsx`, fileHash: suffix.padEnd(64, "0"), fileSizeBytes: BigInt(1),
    dataType: ImportDataType.CTI_CAST_REPORT, importMode: ImportMode.DAILY, targetFrom: new Date("2098-12-31T00:00:00Z"), targetTo: new Date("2098-12-31T00:00:00Z"),
  } });
  batchId = batch.id;
  const cast = await prisma.cast.create({ data: { displayName: `久統合試験${suffix}`, normalizedName: `久統合試験${suffix}`, startedOn: new Date("2098-01-01T00:00:00Z"), primaryStoreId: storeId } });
  castId = cast.id;
  const conflict = await prisma.cast.create({ data: { displayName: `統合試験${suffix}`, normalizedName: `統合試験${suffix}`, startedOn: new Date("2098-06-01T00:00:00Z"), primaryStoreId: storeId } });
  conflictId = conflict.id;
  await prisma.castAlias.createMany({ data: [
    { mediaType: MediaType.CTI, aliasName: `久統合試験${suffix}`, normalizedAlias: `久統合試験${suffix}`, castId, storeId, reviewStatus: "MAPPED" },
    { mediaType: MediaType.TOWN, aliasName: `統合試験${suffix}`, normalizedAlias: `統合試験${suffix}`, castId, storeId, reviewStatus: "MAPPED" },
  ] });
  await prisma.mediaListing.create({ data: { castId, storeId, mediaType: MediaType.TOWN, isListed: true } });
  await prisma.ctiCastDaily.create({ data: { businessDate: new Date("2098-12-31T00:00:00Z"), storeId, castId, importBatchId: batchId, sourceSheetName: "試験", sourceRowNumber: 2, attendanceCount: 1, attendanceMinutes: 60, sameDayAbsenceCount: 0, reservationCount: 1, cancellationCount: 0, serviceCount: 1, regularNominationCount: 1, photoNominationCount: 0, freeCount: 0, contractCount: 1, salesAmount: 10000, castRewardAmount: 5000, ctiProfitAmount: 5000, payoutAfterRewardAmount: 5000, diaryCountCti: 0, paidOptionCount: 0 } });
  await prisma.townCastDaily.create({ data: { date: new Date("2098-12-31T00:00:00Z"), storeId, castId, importBatchId: batchId, sourceCastName: `統合試験${suffix}`, pv: 1, uu: 1, telTapUu: 1, sourceRowNumber: 2 } });
  await prisma.townUrlDaily.create({ data: { date: new Date("2098-12-31T00:00:00Z"), storeId, castId, importBatchId: batchId, url: `https://example.test/${suffix}`, normalizedUrl: `https://example.test/${suffix}`, sourceCastName: `統合試験${suffix}`, pageType: TownPageType.CAST_PROFILE, pv: 1, uu: 1, telTapUu: 1, sourceRowNumber: 2 } });
  await prisma.townLandingDaily.create({ data: { date: new Date("2098-12-31T00:00:00Z"), storeId, castId, importBatchId: batchId, landingUrl: `https://example.test/${suffix}`, normalizedUrl: `https://example.test/${suffix}`, sourceCastName: `統合試験${suffix}`, pageType: TownPageType.CAST_PROFILE, uu: 1, telTapUu: 1, sourceRowNumber: 2 } });
});

afterAll(async () => {
  if (batchId) {
    await prisma.townLandingDaily.deleteMany({ where: { importBatchId: batchId } });
    await prisma.townUrlDaily.deleteMany({ where: { importBatchId: batchId } });
    await prisma.townCastDaily.deleteMany({ where: { importBatchId: batchId } });
    await prisma.ctiCastDaily.deleteMany({ where: { importBatchId: batchId } });
  }
  if (castId) { await prisma.mediaListing.deleteMany({ where: { castId } }); await prisma.castAlias.deleteMany({ where: { castId } }); await prisma.castNameHistory.deleteMany({ where: { castId } }); }
  if (batchId) await prisma.importBatch.delete({ where: { id: batchId } });
  if (sourceId) await prisma.importSource.delete({ where: { id: sourceId } });
  await prisma.cast.deleteMany({ where: { id: { in: [castId, conflictId].filter(Boolean) } } });
  await prisma.$disconnect();
});

describe("cast display name history", () => {
  it("detects inclusive employment-period overlap", () => {
    expect(castPeriodsOverlap({ startedOn: new Date("2026-01-01"), endedOn: new Date("2026-01-31") }, { startedOn: new Date("2026-01-31"), endedOn: null })).toBe(true);
  });

  it("requires confirmation for an overlapping same-name cast", async () => {
    const result = await renameCast({ castId, displayName: `統合試験${suffix}`, reason: null, changedByUserId: adminId, confirmDuplicate: false });
    expect(result.status).toBe("CONFIRMATION_REQUIRED");
    expect(result.conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ id: conflictId, overlaps: true })]));
    expect((await prisma.cast.findUniqueOrThrow({ where: { id: castId } })).displayName).toBe(`久統合試験${suffix}`);
  });

  it("changes only names, writes history, and keeps every relation on the same cast id", async () => {
    const result = await renameCast({ castId, displayName: `統合試験${suffix}`, reason: "接頭辞を内部名から除去", changedByUserId: adminId, confirmDuplicate: true });
    expect(result).toMatchObject({ status: "UPDATED", changed: true, displayName: `統合試験${suffix}` });
    expect(await prisma.cast.findUnique({ where: { id: castId } })).toMatchObject({ id: castId, normalizedName: `統合試験${suffix}` });
    expect(await prisma.castAlias.count({ where: { castId } })).toBe(2);
    expect(await prisma.mediaListing.count({ where: { castId } })).toBe(1);
    expect(await prisma.ctiCastDaily.count({ where: { castId } })).toBe(1);
    expect(await prisma.townCastDaily.count({ where: { castId } })).toBe(1);
    expect(await prisma.townUrlDaily.count({ where: { castId } })).toBe(1);
    expect(await prisma.townLandingDaily.count({ where: { castId } })).toBe(1);
    expect(await prisma.castNameHistory.findFirst({ where: { castId } })).toMatchObject({ oldName: `久統合試験${suffix}`, newName: `統合試験${suffix}`, changedByUserId: adminId, reason: "接頭辞を内部名から除去" });
  });
});
