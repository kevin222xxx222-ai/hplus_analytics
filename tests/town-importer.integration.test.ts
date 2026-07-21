import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImportBatchStatus, ImportDataType, ImportMode, StoreCode } from "@/generated/prisma/client";
import { confirmTownImport } from "@/lib/imports/town/importer";
import { resolveTownPreviewRow } from "@/lib/imports/town/resolution-service";
import type { TownCastPreviewRow, TownPreview } from "@/lib/imports/town/types";
import { getPreviewPath, readPreview, writePreview } from "@/lib/imports/storage";
import { prisma } from "@/lib/prisma";

const batchIds: string[] = [];
let castId = ""; let storeId = ""; let sourceId = ""; let userId = "";

function row(rowNumber: number, targetCastId: string | null, pv = 100, name = targetCastId ? "Town統合試験" : "Town未紐付け"): TownCastPreviewRow {
  return { kind: "CAST", rowKey: `CAST:${rowNumber}`, sourceRowNumber: rowNumber, date: "2099-02-01", originalCastName: name, normalizedCastName: name,
    castId: targetCastId, castDisplayName: targetCastId ? "Town統合試験" : null, resolutionStatus: targetCastId ? "EXACT_ALIAS" : "UNMATCHED", isListed: true,
    pv, uu: 20, averagePv: pv / 20, sourceAveragePv: pv / 20, telTapUu: 1, conversionRate: 0.05, sourceConversionRate: 0.05, issues: targetCastId ? [] : [{ code: "UNMATCHED_CAST", level: "WARNING", message: "未紐付け" }] };
}

async function createBatch(rows: TownCastPreviewRow[], hash: string, metadata: object = {}) {
  const id = randomUUID(); const runId = randomUUID(); batchIds.push(id);
  await prisma.importBatch.create({ data: { id, runId, importSourceId: sourceId, originalFilename: `${id}.csv`, storedFilename: `${id}.csv`, storagePath: `${id}.csv`, fileHash: hash.padEnd(64, "0").slice(0, 64), fileSizeBytes: BigInt(100), dataType: ImportDataType.TOWN_CAST, importMode: ImportMode.DAILY, targetFrom: new Date("2099-02-01T00:00:00Z"), targetTo: new Date("2099-02-01T00:00:00Z"), status: rows.some((item) => !item.castId) ? ImportBatchStatus.WAITING_FOR_CAST_LINK : ImportBatchStatus.PREVIEW_READY, uploadedByUserId: userId, pendingCount: rows.filter((item) => !item.castId).length, metadata } });
  const preview: TownPreview = { version: 1, batchId: id, runId, dataType: ImportDataType.TOWN_CAST, storeId, storeCode: StoreCode.KASUKABE, storeName: "春日部", targetFrom: "2099-02-01", targetTo: "2099-02-01", sourcePeriodFrom: "2099-02-01", sourcePeriodTo: "2099-02-01", encoding: "UTF-8", delimiter: ",", headerRow: 4, detectedColumns: [], unknownColumns: [], rows, globalIssues: [], createdAt: new Date().toISOString() };
  const unresolved = rows.filter((item) => !item.castId);
  if (unresolved.length) await prisma.importError.createMany({ data: unresolved.map((item) => ({ runId, importSourceId: sourceId, importBatchId: id, fileName: `${id}.csv`, fileHash: hash.padEnd(64, "0").slice(0, 64), rowNumber: item.sourceRowNumber, errorCode: "UNMATCHED_CAST", level: "WARNING", message: "未紐付け" })) });
  await writePreview(id, preview); return id;
}

beforeAll(async () => {
  const [store, source, user] = await Promise.all([prisma.store.findUniqueOrThrow({ where: { code: StoreCode.KASUKABE } }), prisma.importSource.findFirstOrThrow({ where: { dataType: ImportDataType.TOWN_CAST, store: { code: StoreCode.KASUKABE } } }), prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } })]);
  storeId = store.id; sourceId = source.id; userId = user.id;
  const cast = await prisma.cast.create({ data: { displayName: "Town統合試験", normalizedName: "Town統合試験", startedOn: new Date("2099-01-01T00:00:00Z"), primaryStoreId: storeId } }); castId = cast.id;
});

afterAll(async () => {
  await prisma.importError.deleteMany({ where: { importBatchId: { in: batchIds } } });
  if (castId) { await prisma.townCastDaily.deleteMany({ where: { castId } }); await prisma.mediaListing.deleteMany({ where: { castId } }); await prisma.castAlias.deleteMany({ where: { castId } }); }
  await prisma.importBatch.deleteMany({ where: { id: { in: batchIds } } });
  if (castId) await prisma.cast.delete({ where: { id: castId } });
  await Promise.all(batchIds.map((id) => unlink(getPreviewPath(id)).catch(() => undefined)));
  await prisma.$disconnect();
});

describe("Town importer integration", () => {
  it("adds a TOWN alias by linking only to an existing cast", async () => {
    const batch = await createBatch([row(5, null, 100, "Town別名"), row(6, null, 80, "Town別名")], "town-alias");
    const result = await resolveTownPreviewRow(batch, "CAST:5", { action: "EXISTING", castId });
    expect(result.row).toMatchObject({ castId, resolutionStatus: "EXACT_ALIAS" });
    expect(result.summary.pendingCount).toBe(0);
    expect((await readPreview<TownPreview>(batch)).rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowKey: "CAST:5", castId }),
      expect.objectContaining({ rowKey: "CAST:6", castId }),
    ]));
    expect(await prisma.castAlias.findFirst({ where: { castId, mediaType: "TOWN", aliasName: "Town別名", storeId } })).toBeTruthy();
  });

  it("inserts, updates, blocks duplicate confirmation and allows partial import", async () => {
    const first = await createBatch([row(5, castId, 100)], "town-first");
    await expect(confirmTownImport(first, false)).resolves.toMatchObject({ insertedCount: 1, updatedCount: 0 });
    expect(await prisma.mediaListing.findUnique({ where: { castId_storeId_mediaType: { castId, storeId, mediaType: "TOWN" } } })).toMatchObject({ isListed: true });
    const second = await createBatch([row(5, castId, 140)], "town-second");
    await expect(confirmTownImport(second, false)).resolves.toMatchObject({ insertedCount: 0, updatedCount: 1 });
    expect((await prisma.townCastDaily.findUniqueOrThrow({ where: { date_storeId_castId: { date: new Date("2099-02-01T00:00:00Z"), storeId, castId } } })).pv).toBe(140);
    const duplicate = await createBatch([row(5, castId)], "town-duplicate", { duplicateCompletedBatchId: first });
    await expect(confirmTownImport(duplicate, false)).rejects.toThrow("再処理を明示");
    const partial = await createBatch([row(5, castId), row(6, null)], "town-partial");
    await expect(confirmTownImport(partial, false)).resolves.toMatchObject({ pendingCount: 1 });
  });
});
