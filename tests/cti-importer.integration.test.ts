import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImportBatchStatus, ImportDataType, ImportMode, StoreCode } from "@/generated/prisma/client";
import { confirmCtiImport } from "@/lib/imports/cti/importer";
import { resolveCtiPreviewRow } from "@/lib/imports/cti/resolution-service";
import type { CtiMetrics, CtiPreview, CtiPreviewRow } from "@/lib/imports/cti/types";
import { getPreviewPath, writePreview } from "@/lib/imports/storage";
import { prisma } from "@/lib/prisma";

const batchIds: string[] = [];
let castId = "";
let storeId = "";
let sourceId = "";
let userId = "";

const baseMetrics: CtiMetrics = {
  attendanceCount: 1, attendanceMinutes: 480, sameDayAbsenceCount: 0,
  reservationCount: 4, cancellationCount: 1, serviceCount: 3, sourceServiceCount: 3,
  regularNominationCount: 1, photoNominationCount: 1, freeCount: 1, contractCount: 3, sourceContractCount: 3,
  newCount: 1, repeatCount: 2, salesAmount: 50000, castRewardAmount: 25000, ctiProfitAmount: 20000,
  payoutAfterRewardAmount: 25000, diaryCountCti: 2, paidOptionCount: 1,
};

function previewRow(rowKey: string, targetCastId: string | null, metrics: CtiMetrics | null = baseMetrics, originalName = targetCastId ? "統合試験" : "未紐付け"): CtiPreviewRow {
  return { rowKey, storeCode: StoreCode.KASUKABE, storeId, sourceSheetName: "若妻淫乱倶楽部春日部店", sourceRowNumber: Number(rowKey.split(":")[1]), originalCastName: originalName, normalizedCastName: originalName, castId: targetCastId, castDisplayName: targetCastId ? "統合試験" : null, resolutionStatus: targetCastId ? "EXACT_ALIAS" : "UNMATCHED", exclusionReason: null, metrics, issues: [] };
}

async function createBatch(date: string, rows: CtiPreviewRow[], hash: string, metadata: Record<string, unknown> = {}) {
  const id = randomUUID(); batchIds.push(id);
  const runId = randomUUID();
  await prisma.importBatch.create({ data: {
    id, runId, importSourceId: sourceId, originalFilename: `${id}.xlsx`, storedFilename: `${id}.xlsx`, storagePath: `${id}.xlsx`,
    fileHash: hash.padEnd(64, "0").slice(0, 64), fileSizeBytes: 100n, dataType: ImportDataType.CTI_CAST_REPORT,
    importMode: ImportMode.DAILY, targetFrom: new Date(`${date}T00:00:00Z`), targetTo: new Date(`${date}T00:00:00Z`),
    status: rows.some((row) => !row.castId) ? ImportBatchStatus.WAITING_FOR_CAST_LINK : ImportBatchStatus.PREVIEW_READY,
    uploadedByUserId: userId, pendingCount: rows.filter((row) => !row.castId).length, metadata,
  } });
  const preview: CtiPreview = { version: 1, batchId: id, runId, importMode: "DAILY", targetFrom: date, targetTo: date, workbookSheetNames: ["若妻淫乱倶楽部春日部店"], missingTargetSheets: ["若妻淫乱倶楽部越谷店", "若妻淫乱倶楽部野田店"], sheets: [{ sheetName: "若妻淫乱倶楽部春日部店", storeCode: StoreCode.KASUKABE, detectedHeaderRow: 2, detectedColumns: [], unknownColumns: [], totalRows: rows.length, excludedRows: 0, rows }], globalIssues: [], createdAt: new Date().toISOString() };
  await writePreview(id, preview);
  return id;
}

beforeAll(async () => {
  const [store, source, user] = await Promise.all([
    prisma.store.findUniqueOrThrow({ where: { code: StoreCode.KASUKABE } }),
    prisma.importSource.findFirstOrThrow({ where: { dataType: ImportDataType.CTI_CAST_REPORT } }),
    prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } }),
  ]);
  storeId = store.id; sourceId = source.id; userId = user.id;
  const cast = await prisma.cast.create({ data: { displayName: "統合試験", normalizedName: "統合試験", startedOn: new Date("2099-01-01T00:00:00Z"), primaryStoreId: storeId } });
  castId = cast.id;
});

afterAll(async () => {
  if (castId) await prisma.ctiCastDaily.deleteMany({ where: { castId } });
  if (batchIds.length) await prisma.importBatch.deleteMany({ where: { id: { in: batchIds } } });
  if (castId) await prisma.cast.deleteMany({ where: { id: castId } });
  await Promise.all(batchIds.map((id) => unlink(getPreviewPath(id)).catch(() => undefined)));
  await prisma.$disconnect();
});

describe("CTI importer integration", () => {
  it("creates a cast and CTI alias and links the preview row in one action", async () => {
    const originalName = `一括作成${randomUUID().slice(0, 8)}`;
    const batch = await createBatch("2099-01-05", [previewRow("KASUKABE:3", null, baseMetrics, originalName)], "create-link");
    let createdCastId: string | null = null;
    try {
      const result = await resolveCtiPreviewRow(batch, "KASUKABE:3", { action: "NEW", displayName: originalName, startedOn: "2099-01-05" });
      createdCastId = result.row.castId;
      expect(result.row).toMatchObject({ castDisplayName: originalName, resolutionStatus: "EXACT_ALIAS" });
      expect(result.summary.pendingCount).toBe(0);
      expect(createdCastId).toBeTruthy();
      expect(await prisma.castAlias.findFirst({ where: { castId: createdCastId!, aliasName: originalName, storeId } })).toMatchObject({ reviewStatus: "MAPPED" });
    } finally {
      if (createdCastId) {
        await prisma.castAlias.deleteMany({ where: { castId: createdCastId } });
        await prisma.cast.deleteMany({ where: { id: createdCastId } });
      }
    }
  });

  it("inserts, upserts corrected values, blocks duplicates and allows partial import", async () => {
    const first = await createBatch("2099-01-02", [previewRow("KASUKABE:3", castId)], "first");
    await expect(confirmCtiImport(first, false)).resolves.toMatchObject({ insertedCount: 1, updatedCount: 0 });

    const corrected = { ...baseMetrics, salesAmount: 60000, payoutAfterRewardAmount: 35000 };
    const second = await createBatch("2099-01-02", [previewRow("KASUKABE:3", castId, corrected)], "second");
    await expect(confirmCtiImport(second, false)).resolves.toMatchObject({ insertedCount: 0, updatedCount: 1 });
    const updated = await prisma.ctiCastDaily.findUniqueOrThrow({ where: { businessDate_storeId_castId: { businessDate: new Date("2099-01-02T00:00:00Z"), storeId, castId } } });
    expect(updated.salesAmount).toBe(60000);
    expect(updated.importBatchId).toBe(second);

    const duplicate = await createBatch("2099-01-03", [previewRow("KASUKABE:3", castId)], "duplicate", { duplicateCompletedBatchId: first });
    await expect(confirmCtiImport(duplicate, false)).rejects.toThrow("再処理を明示");

    const partial = await createBatch("2099-01-04", [previewRow("KASUKABE:3", castId), previewRow("KASUKABE:4", null)], "partial");
    await expect(confirmCtiImport(partial, false)).resolves.toMatchObject({ insertedCount: 1, pendingCount: 1 });
    expect(await prisma.importError.count({ where: { importBatchId: partial, errorCode: "PARTIAL_IMPORT" } })).toBe(1);
  });
});
