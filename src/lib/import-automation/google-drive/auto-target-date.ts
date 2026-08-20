import { randomUUID } from "node:crypto";
import { StoreCode } from "@/generated/prisma/client";
import { parseCtiWorkbook } from "@/lib/imports/cti/parser";
import { TARGET_SHEETS, CTI_STORE_CODES } from "@/lib/imports/cti/constants";
import { parseTownCsv } from "@/lib/imports/town/parser";
import { TOWN_EXTERNAL_STORE_IDS } from "@/lib/imports/town/service";
import type { TownImportDataType } from "@/lib/imports/town/types";
import { prisma } from "@/lib/prisma";

const townNamePattern = /(?:^|[-_])(?:shop|gal)-(?<from>\d{8})_to_(?<to>\d{8})\.csv$/i;
const ctiNamePattern = /^女子別レポート_(?<date>\d{8})\.xlsx$/i;

function date8(value: string): string | null {
  const year = Number(value.slice(0, 4)); const month = Number(value.slice(4, 6)); const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : null;
}

export async function resolveTownAutoTargetDate(input: { buffer: Buffer; fileName: string; dataType: TownImportDataType; storeId: string; storeCode: StoreCode }): Promise<string> {
  const preview = parseTownCsv({ buffer: input.buffer, batchId: randomUUID(), runId: randomUUID(), dataType: input.dataType, storeId: input.storeId, storeCode: input.storeCode, storeName: input.storeCode, targetFrom: "2000-01-01", targetTo: "2999-12-31", expectedExternalStoreId: TOWN_EXTERNAL_STORE_IDS[input.storeCode] || null });
  if (!preview.sourcePeriodFrom || !preview.sourcePeriodTo) throw new Error("AUTO target date is unavailable: Town CSV period is missing.");
  if (preview.sourcePeriodFrom !== preview.sourcePeriodTo) throw new Error("AUTO target date is blocked: Town CSV is not a single-day file.");
  const match = input.fileName.match(townNamePattern);
  if (match?.groups?.from && match.groups.to) {
    const from = date8(match.groups.from); const to = date8(match.groups.to);
    if (!from || !to || from !== preview.sourcePeriodFrom || to !== preview.sourcePeriodTo) throw new Error("AUTO target date is blocked: filename period does not match the CSV period.");
  }
  return preview.sourcePeriodFrom;
}

export async function resolveCtiAutoTargetDate(input: { buffer: Buffer; fileName: string }): Promise<string> {
  const match = input.fileName.match(ctiNamePattern);
  const targetDate = match?.groups?.date ? date8(match.groups.date) : null;
  if (!targetDate) throw new Error("AUTO target date is unavailable: CTI filename must match 女子別レポート_YYYYMMDD.xlsx.");
  const stores = await prisma.store.findMany({ where: { code: { in: CTI_STORE_CODES } }, select: { id: true, code: true } });
  const storeIds = Object.fromEntries(stores.map((store) => [store.code, store.id]));
  const parsed = await parseCtiWorkbook(input.buffer, storeIds as Record<typeof CTI_STORE_CODES[number], string>);
  const expected = Object.keys(TARGET_SHEETS);
  if (parsed.missingTargetSheets.length || expected.some((name) => !parsed.workbookSheetNames.includes(name))) throw new Error("AUTO target date is blocked: CTI target store sheets are incomplete.");
  return targetDate;
}
