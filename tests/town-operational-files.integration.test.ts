import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ImportDataType, StoreCode } from "@/generated/prisma/client";
import { parseTownCsv } from "@/lib/imports/town/parser";
import type { TownImportDataType } from "@/lib/imports/town/types";

const roots = {
  KASUKABE: "/Users/matsu/Documents/Codex/kasukabe",
  KOSHIGAYA: "/Users/matsu/Documents/Codex/koshigaya",
};
const cases: Array<{ storeCode: StoreCode; file: string; dataType: TownImportDataType; rows: number; externalStoreId: string }> = [
  { storeCode: StoreCode.KASUKABE, file: "dto.jp-shop-20260713_to_20260713.csv", dataType: ImportDataType.TOWN_STORE, rows: 1, externalStoreId: "16829" },
  { storeCode: StoreCode.KASUKABE, file: "dto.jp-gal-20260713_to_20260713.csv", dataType: ImportDataType.TOWN_CAST, rows: 105, externalStoreId: "16829" },
  { storeCode: StoreCode.KASUKABE, file: "dto.jp-url-20260713_to_20260713.csv", dataType: ImportDataType.TOWN_URL, rows: 364, externalStoreId: "16829" },
  { storeCode: StoreCode.KASUKABE, file: "dto.jp-lp-20260713_to_20260713.csv", dataType: ImportDataType.TOWN_LANDING, rows: 147, externalStoreId: "16829" },
  { storeCode: StoreCode.KOSHIGAYA, file: "dto.jp-shop-20260713_to_20260713(1).csv", dataType: ImportDataType.TOWN_STORE, rows: 1, externalStoreId: "32782" },
  { storeCode: StoreCode.KOSHIGAYA, file: "dto.jp-gal-20260713_to_20260713(1).csv", dataType: ImportDataType.TOWN_CAST, rows: 63, externalStoreId: "32782" },
  { storeCode: StoreCode.KOSHIGAYA, file: "dto.jp-url-20260713_to_20260713(1).csv", dataType: ImportDataType.TOWN_URL, rows: 197, externalStoreId: "32782" },
  { storeCode: StoreCode.KOSHIGAYA, file: "dto.jp-lp-20260713_to_20260713(1).csv", dataType: ImportDataType.TOWN_LANDING, rows: 69, externalStoreId: "32782" },
];
const available = cases.every((testCase) => existsSync(`${roots[testCase.storeCode]}/${testCase.file}`));

describe("Town operational CSV files", () => {
  it.skipIf(!available)("parses all eight local files without committing them", async () => {
    for (const testCase of cases) {
      const preview = parseTownCsv({
        buffer: await readFile(`${roots[testCase.storeCode]}/${testCase.file}`), batchId: "real", runId: "real",
        dataType: testCase.dataType, storeId: testCase.storeCode, storeCode: testCase.storeCode, storeName: testCase.storeCode,
        targetFrom: "2026-07-13", targetTo: "2026-07-13", expectedExternalStoreId: testCase.externalStoreId,
      });
      expect(preview.encoding).toBe("CP932");
      expect(preview.unknownColumns).toEqual([]);
      expect(preview.rows, testCase.file).toHaveLength(testCase.rows);
      expect([...preview.globalIssues, ...preview.rows.flatMap((row) => row.issues)].filter((issue) => issue.level === "ERROR"), testCase.file).toEqual([]);
    }
  });
});

