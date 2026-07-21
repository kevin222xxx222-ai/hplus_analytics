import { createHash, randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImportDataType, ImportMode, ImportBatchStatus, MediaType, StoreCode } from "@/generated/prisma/client";
import { reparseCtiBatch } from "@/lib/imports/cti/reparse-service";
import type { CtiPreview } from "@/lib/imports/cti/types";
import { getPreviewPath, getStoredImportPath, readPreview, saveImportFile } from "@/lib/imports/storage";
import { prisma } from "@/lib/prisma";

const batchId = randomUUID();
const suffix = batchId.slice(0, 8);
let sourceId = "";
let castId = "";
const aliasIds: string[] = [];

async function workbookBuffer() {
  const workbook = new ExcelJS.Workbook();
  const sheets = [
    ["若妻淫乱倶楽部春日部店", StoreCode.KASUKABE],
    ["若妻淫乱倶楽部越谷店", StoreCode.KOSHIGAYA],
    ["若妻淫乱倶楽部野田店", StoreCode.NODA],
  ] as const;
  for (const [name] of sheets) {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(["女子名", "出勤数", "本指名数", "写真指名数", "フリー数", "予約数", "成約数", "キャンセル数", "女子報酬", "利益", "出勤時間", "料金", "写メ日記数", "当日欠勤数", "有料オプション数", "新規成約数", "リピート成約数"]);
    sheet.addRow([`再解析-${suffix}`, 1, 1, 0, 0, 1, 1, 0, 5000, 5000, "1:00", 10000, 0, 0, 0, 1, 0]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer);
}

beforeAll(async () => {
  const stores = await prisma.store.findMany({ where: { code: { in: [StoreCode.KASUKABE, StoreCode.KOSHIGAYA, StoreCode.NODA] } } });
  const primary = stores.find((store) => store.code === StoreCode.KASUKABE)!;
  const source = await prisma.importSource.create({ data: { name: `再解析試験-${suffix}`, mediaType: MediaType.CTI, dataType: ImportDataType.CTI_CAST_REPORT, storeId: primary.id } });
  sourceId = source.id;
  const cast = await prisma.cast.create({ data: { displayName: `再解析-${suffix}`, normalizedName: `再解析-${suffix}`, startedOn: new Date("2096-07-13T00:00:00Z"), primaryStoreId: primary.id } });
  castId = cast.id;
  for (const store of stores) {
    const alias = await prisma.castAlias.create({ data: { mediaType: MediaType.CTI, aliasName: cast.displayName, normalizedAlias: cast.normalizedName, castId, storeId: store.id, reviewStatus: "MAPPED", validFrom: new Date("2096-07-13T00:00:00Z") } });
    aliasIds.push(alias.id);
  }
  const buffer = await workbookBuffer();
  const stored = await saveImportFile(batchId, ".xlsx", buffer);
  await prisma.importBatch.create({ data: {
    id: batchId, importSourceId: sourceId, originalFilename: `reparse-${suffix}.xlsx`, storedFilename: stored.storedFilename, storagePath: stored.storedFilename,
    fileHash: createHash("sha256").update(buffer).digest("hex"), fileSizeBytes: BigInt(buffer.length), dataType: ImportDataType.CTI_CAST_REPORT,
    importMode: ImportMode.DAILY, targetFrom: new Date("2096-07-01T00:00:00Z"), targetTo: new Date("2096-07-01T00:00:00Z"), status: ImportBatchStatus.WAITING_FOR_CAST_LINK,
  } });
});

afterAll(async () => {
  await prisma.importBatch.deleteMany({ where: { id: batchId } });
  await prisma.castAlias.deleteMany({ where: { id: { in: aliasIds } } });
  if (castId) await prisma.cast.deleteMany({ where: { id: castId } });
  if (sourceId) await prisma.importSource.deleteMany({ where: { id: sourceId } });
  await Promise.allSettled([unlink(getStoredImportPath(`${batchId}.xlsx`)), unlink(getPreviewPath(batchId))]);
  await prisma.$disconnect();
});

describe("CTI existing-batch reparse", () => {
  it("reuses the same batch and re-evaluates current Cast/Alias periods without writing facts", async () => {
    const first = await reparseCtiBatch(batchId);
    expect(first.batchId).toBe(batchId);
    expect(first.after.pendingCount).toBe(3);
    expect(first.after.importableCount).toBe(0);
    expect(await prisma.importError.count({ where: { importBatchId: batchId, errorCode: "UNMATCHED_CAST", status: "OPEN" } })).toBe(3);
    expect(await prisma.ctiCastDaily.count({ where: { importBatchId: batchId } })).toBe(0);

    await prisma.$transaction([
      prisma.cast.update({ where: { id: castId }, data: { startedOn: new Date("2096-07-01T00:00:00Z") } }),
      prisma.castAlias.updateMany({ where: { id: { in: aliasIds } }, data: { validFrom: new Date("2096-07-01T00:00:00Z") } }),
    ]);
    const second = await reparseCtiBatch(batchId);
    expect(second).toMatchObject({ batchId, before: { pendingCount: 3, importableCount: 0 }, after: { pendingCount: 0, warningCount: 0, importableCount: 3 }, status: ImportBatchStatus.PREVIEW_READY });
    expect(await prisma.importBatch.count({ where: { id: batchId } })).toBe(1);
    expect(await prisma.importError.count({ where: { importBatchId: batchId } })).toBe(0);
    expect(await prisma.ctiCastDaily.count({ where: { importBatchId: batchId } })).toBe(0);
    const preview = await readPreview<CtiPreview>(batchId);
    expect(preview.sheets.flatMap((sheet) => sheet.rows).every((row) => row.castId === castId)).toBe(true);
  });
});
