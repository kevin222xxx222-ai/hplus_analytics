import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StoreCode } from "@/generated/prisma/client";
import { parseCtiWorkbook } from "@/lib/imports/cti/parser";

const operationalFile = process.env.CTI_REAL_FILE || "";
const storeIds = {
  [StoreCode.KASUKABE]: "11111111-1111-1111-1111-111111111111",
  [StoreCode.KOSHIGAYA]: "22222222-2222-2222-2222-222222222222",
  [StoreCode.NODA]: "33333333-3333-3333-3333-333333333333",
};

describe.skipIf(!operationalFile || !existsSync(operationalFile))("CTI operational XLSX", () => {
  it("previews all three stores with row-1 headers and inferred column A", async () => {
    const result = await parseCtiWorkbook(readFileSync(operationalFile), storeIds);
    expect(result.sheets).toHaveLength(3);
    expect(result.sheets.every((sheet) => sheet.detectedHeaderRow === 1)).toBe(true);
    expect(result.sheets.every((sheet) => sheet.detectedColumns.includes("A列（仮想:女子名）"))).toBe(true);
    expect(result.sheets.every((sheet) => sheet.detectedColumns.length === 74)).toBe(true);
    expect(result.sheets.every((sheet) => sheet.unknownColumns.length === 0)).toBe(true);
    expect(result.sheets.map((sheet) => sheet.rows.length)).toEqual([26, 20, 14]);
    expect(result.sheets.flatMap((sheet) => sheet.rows).every((row) => row.metrics)).toBe(true);
    expect(result.globalIssues.some((issue) => issue.code === "HEADER_NOT_FOUND")).toBe(false);
    expect(result.globalIssues.some((issue) => issue.code === "UNKNOWN_COLUMNS")).toBe(false);
    expect(result.sheets.flatMap((sheet) => sheet.rows).flatMap((row) => row.issues).some((issue) => issue.code === "NEGATIVE_VALUE")).toBe(false);
  });
});
