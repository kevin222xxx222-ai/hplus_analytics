import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import ExcelJS from "exceljs";
import { AliasReviewStatus, MediaType, StoreCode } from "../src/generated/prisma/client";
import { normalizeCastName } from "../src/lib/normalize";
import { prisma } from "../src/lib/prisma";

const testName = process.env.CTI_E2E_NAME || `画面確認${Date.now()}`;
const salesDelta = Number(process.env.CTI_E2E_SALES_DELTA || 0);
const targetDate = "2099-07-14";
const headers = ["女子名", "出勤日数", "出勤時間", "予約数", "キャンセル数", "接客数", "本指名数", "写真指名数", "フリー数", "成約数", "新規数", "リピート数", "料金", "女子報酬", "利益", "写メ日記数", "当日欠勤数", "有料オプション数"];
const sheets = [
  { name: "若妻淫乱倶楽部春日部店", code: StoreCode.KASUKABE, hours: "8:00", sales: 50_000 },
  { name: "若妻淫乱倶楽部越谷店", code: StoreCode.KOSHIGAYA, hours: "6:00", sales: 40_000 },
  { name: "若妻淫乱倶楽部野田店", code: StoreCode.NODA, hours: "4:00", sales: 30_000 },
];

async function main() {
  const [admin, source, stores] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } }),
    prisma.importSource.findFirstOrThrow({ where: { dataType: "CTI_CAST_REPORT", isActive: true } }),
    prisma.store.findMany(),
  ]);
  const storeByCode = new Map(stores.map((store) => [store.code, store]));
  let cast = await prisma.cast.findFirst({ where: { displayName: testName } });
  if (!cast) cast = await prisma.cast.create({ data: {
      displayName: testName,
      normalizedName: normalizeCastName(testName),
      startedOn: new Date("2099-01-01T00:00:00Z"),
      primaryStoreId: storeByCode.get(StoreCode.KASUKABE)!.id,
    } });
  for (const code of [StoreCode.KASUKABE, StoreCode.KOSHIGAYA]) {
    const storeId = storeByCode.get(code)!.id;
    const alias = await prisma.castAlias.findFirst({ where: { mediaType: MediaType.CTI, castId: cast.id, storeId, normalizedAlias: normalizeCastName(testName) } });
    if (!alias) await prisma.castAlias.create({ data: {
        mediaType: MediaType.CTI,
        aliasName: testName,
        normalizedAlias: normalizeCastName(testName),
        reviewStatus: AliasReviewStatus.MAPPED,
        castId: cast.id,
        storeId,
        validFrom: new Date("2099-01-01T00:00:00Z"),
      } });
  }

  const workbook = new ExcelJS.Workbook();
  for (const sheetSpec of sheets) {
    const sheet = workbook.addWorksheet(sheetSpec.name);
    sheet.addRow(["女子別レポート"]);
    sheet.addRow(headers);
    const rowName = sheetSpec.code === StoreCode.NODA ? `${testName}未登録` : testName;
    sheet.addRow([rowName, 1, sheetSpec.hours, 4, 1, 3, 1, 1, 1, 3, 1, 2, sheetSpec.sales + salesDelta, 20_000, 15_000, 2, 0, 1]);
    sheet.addRow(["合計"]);
  }
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer);
  const token = randomBytes(32).toString("hex");
  const session = await prisma.session.create({ data: {
    tokenHash: createHash("sha256").update(token).digest("hex"),
    userId: admin.id,
    expiresAt: new Date(Date.now() + 10 * 60_000),
    userAgent: "phase2-e2e-setup",
  } });
  try {
    let uploadBytes = bytes;
    const reuseBatchId = process.env.CTI_E2E_REUSE_BATCH_ID;
    if (reuseBatchId) {
      const stored = await fetch(`http://localhost:3000/api/imports/${reuseBatchId}/file`, {
        headers: { cookie: `hplus_analytics_session=${token}` },
      });
      if (!stored.ok) throw new Error(`stored file download failed: ${stored.status}`);
      uploadBytes = Buffer.from(await stored.arrayBuffer());
    }
    const form = new FormData();
    form.set("importSourceId", source.id);
    form.set("importMode", "DAILY");
    form.set("targetFrom", targetDate);
    form.set("targetTo", targetDate);
    form.set("file", new Blob([Uint8Array.from(uploadBytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "cti-phase2-anonymous.xlsx");
    const response = await fetch("http://localhost:3000/api/imports/cti/upload", {
      method: "POST",
      body: form,
      headers: { origin: "http://localhost:3000", cookie: `hplus_analytics_session=${token}` },
    });
    const result = await response.json() as { batchId?: string; status?: string; error?: string };
    if (!response.ok || !result.batchId) throw new Error(result.error || `upload failed: ${response.status}`);
    console.log(JSON.stringify({ batchId: result.batchId, castId: cast.id, castName: testName, targetDate, status: result.status }));
  } finally {
    await prisma.session.delete({ where: { id: session.id } });
  }
}

main().finally(() => prisma.$disconnect());
