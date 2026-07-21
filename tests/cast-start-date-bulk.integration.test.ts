import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MediaType, StoreCode } from "@/generated/prisma/client";
import { buildCastStartDateBulkPreview, executeCastStartDateBulkChange } from "@/lib/casts/start-date-bulk-service";
import { prisma } from "@/lib/prisma";

const suffix = randomUUID().slice(0, 8);
const castIds: string[] = [];
const historyIds: string[] = [];
let adminId = "";
let storeId = "";

async function createCast(name: string, input?: { startedOn?: string; endedOn?: string | null }) {
  const cast = await prisma.cast.create({ data: {
    displayName: `${name}-${suffix}`,
    normalizedName: `${name}-${suffix}`,
    startedOn: new Date(`${input?.startedOn || "2098-07-13"}T00:00:00Z`),
    endedOn: input?.endedOn ? new Date(`${input.endedOn}T00:00:00Z`) : null,
    primaryStoreId: storeId,
  } });
  castIds.push(cast.id);
  return cast;
}

beforeAll(async () => {
  adminId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } })).id;
  storeId = (await prisma.store.findUniqueOrThrow({ where: { code: StoreCode.KASUKABE } })).id;
});

afterAll(async () => {
  await prisma.castStartDateBulkChangeHistory.deleteMany({ where: { OR: [{ id: { in: historyIds } }, { reason: { contains: suffix } }] } });
  await prisma.castAlias.deleteMany({ where: { castId: { in: castIds } } });
  await prisma.cast.updateMany({ where: { id: { in: castIds } }, data: { mergedIntoCastId: null, mergedAt: null } });
  await prisma.cast.deleteMany({ where: { id: { in: castIds } } });
  await prisma.$disconnect();
});

describe("cast/Alias start date bulk change", () => {
  it("backdates only earlier values in the selected media and preserves IDs, validTo, and other media", async () => {
    const cast = await createCast("一括A");
    const validTo = new Date("2098-12-31T00:00:00Z");
    const cti = await prisma.castAlias.create({ data: { mediaType: MediaType.CTI, aliasName: `一括A-${suffix}`, normalizedAlias: `一括A-${suffix}`, castId: cast.id, storeId, reviewStatus: "MAPPED", validFrom: new Date("2098-07-13T00:00:00Z"), validTo } });
    const town = await prisma.castAlias.create({ data: { mediaType: MediaType.TOWN, aliasName: `一括A-${suffix}`, normalizedAlias: `一括A-${suffix}`, castId: cast.id, storeId, reviewStatus: "MAPPED", validFrom: new Date("2098-07-13T00:00:00Z") } });
    const preview = await buildCastStartDateBulkPreview({ castIds: [cast.id], targetDate: "2098-04-01", mediaScope: MediaType.CTI });
    expect(preview.canExecute).toBe(true);
    expect(preview.castChanges).toHaveLength(1);
    expect(preview.aliasChanges).toHaveLength(1);
    expect(preview.conflicts).toHaveLength(0);
    const result = await executeCastStartDateBulkChange({ castIds: [cast.id], targetDate: "2098-04-01", mediaScope: MediaType.CTI, expectedFingerprint: preview.fingerprint, changedByUserId: adminId, reason: `一括試験-${suffix}` });
    historyIds.push(result.historyId);
    expect(await prisma.cast.findUniqueOrThrow({ where: { id: cast.id } })).toMatchObject({ id: cast.id, startedOn: new Date("2098-04-01T00:00:00Z") });
    expect(await prisma.castAlias.findUniqueOrThrow({ where: { id: cti.id } })).toMatchObject({ id: cti.id, validFrom: new Date("2098-04-01T00:00:00Z"), validTo });
    expect(await prisma.castAlias.findUniqueOrThrow({ where: { id: town.id } })).toMatchObject({ validFrom: new Date("2098-07-13T00:00:00Z") });
    const history = await prisma.castStartDateBulkChangeHistory.findUniqueOrThrow({ where: { id: result.historyId } });
    expect(history).toMatchObject({ castCount: 1, aliasCount: 1, changedByUserId: adminId, mediaScope: "CTI" });

    const laterPreview = await buildCastStartDateBulkPreview({ castIds: [cast.id], targetDate: "2098-05-01", mediaScope: MediaType.CTI });
    expect(laterPreview.castChanges).toHaveLength(0);
    expect(laterPreview.aliasChanges).toHaveLength(0);
    expect(laterPreview.canExecute).toBe(false);
  });

  it("blocks a different Cast using the same Alias during the proposed extension", async () => {
    const selected = await createCast("期間衝突B");
    const other = await createCast("別人B", { startedOn: "2098-01-01" });
    const normalizedAlias = `共通名B-${suffix}`;
    const selectedAlias = await prisma.castAlias.create({ data: { mediaType: MediaType.CTI, aliasName: normalizedAlias, normalizedAlias, castId: selected.id, storeId, reviewStatus: "MAPPED", validFrom: new Date("2098-07-13T00:00:00Z") } });
    await prisma.castAlias.create({ data: { mediaType: MediaType.CTI, aliasName: normalizedAlias, normalizedAlias, castId: other.id, storeId, reviewStatus: "MAPPED", validFrom: new Date("2098-04-01T00:00:00Z"), validTo: new Date("2098-06-30T00:00:00Z") } });
    const preview = await buildCastStartDateBulkPreview({ castIds: [selected.id], targetDate: "2098-04-01", mediaScope: MediaType.CTI });
    expect(preview.canExecute).toBe(false);
    expect(preview.conflicts.some((conflict) => conflict.code === "UNIQUE_KEY_COLLISION")).toBe(true);
    expect(preview.conflicts.some((conflict) => conflict.code === "DIFFERENT_CAST_PERIOD_OVERLAP")).toBe(true);
    await expect(executeCastStartDateBulkChange({ castIds: [selected.id], targetDate: "2098-04-01", mediaScope: MediaType.CTI, expectedFingerprint: preview.fingerprint, changedByUserId: adminId, reason: `衝突試験-${suffix}` })).rejects.toThrow();
    expect(await prisma.castAlias.findUniqueOrThrow({ where: { id: selectedAlias.id } })).toMatchObject({ validFrom: new Date("2098-07-13T00:00:00Z") });
  });

  it("rejects merged sources and a target date after endedOn", async () => {
    const target = await createCast("統合先C");
    const merged = await createCast("統合元C");
    await prisma.cast.update({ where: { id: merged.id }, data: { mergedIntoCastId: target.id, mergedAt: new Date() } });
    const mergedPreview = await buildCastStartDateBulkPreview({ castIds: [merged.id], targetDate: "2098-04-01", mediaScope: "ALL" });
    expect(mergedPreview.conflicts.some((conflict) => conflict.code === "MERGED_CAST")).toBe(true);

    const ended = await createCast("退店D", { endedOn: "2098-03-31" });
    const endedPreview = await buildCastStartDateBulkPreview({ castIds: [ended.id], targetDate: "2098-04-01", mediaScope: "ALL" });
    expect(endedPreview.conflicts.some((conflict) => conflict.code === "AFTER_ENDED_ON")).toBe(true);
  });

  it("rolls every update back when audit history creation fails", async () => {
    const cast = await createCast("取消E");
    const alias = await prisma.castAlias.create({ data: { mediaType: MediaType.CTI, aliasName: `取消E-${suffix}`, normalizedAlias: `取消E-${suffix}`, castId: cast.id, storeId, reviewStatus: "MAPPED", validFrom: new Date("2098-07-13T00:00:00Z") } });
    const preview = await buildCastStartDateBulkPreview({ castIds: [cast.id], targetDate: "2098-04-01", mediaScope: "ALL" });
    await expect(executeCastStartDateBulkChange({ castIds: [cast.id], targetDate: "2098-04-01", mediaScope: "ALL", expectedFingerprint: preview.fingerprint, changedByUserId: randomUUID(), reason: `取消試験-${suffix}` })).rejects.toThrow();
    expect(await prisma.cast.findUniqueOrThrow({ where: { id: cast.id } })).toMatchObject({ startedOn: new Date("2098-07-13T00:00:00Z") });
    expect(await prisma.castAlias.findUniqueOrThrow({ where: { id: alias.id } })).toMatchObject({ validFrom: new Date("2098-07-13T00:00:00Z") });
  });
});
