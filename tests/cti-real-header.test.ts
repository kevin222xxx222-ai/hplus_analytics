import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { StoreCode } from "@/generated/prisma/client";
import { parseCtiWorkbook } from "@/lib/imports/cti/parser";

const targetSheets = ["若妻淫乱倶楽部春日部店", "若妻淫乱倶楽部越谷店", "若妻淫乱倶楽部野田店"];
const storeIds = { [StoreCode.KASUKABE]: "kasukabe", [StoreCode.KOSHIGAYA]: "koshigaya", [StoreCode.NODA]: "noda" };

type FixtureOptions = {
  attendanceHeader?: "出勤数" | "出勤日数";
  numericNames?: boolean;
  includeNew?: boolean;
  includeRepeat?: boolean;
  sourceContractCount?: number;
  sheets?: string[];
  extraColumns?: Array<{ header: string; value: number | string }>;
  valueOverrides?: Record<string, number | string>;
};

async function realHeaderWorkbook(options: FixtureOptions = {}) {
  const headers: Array<string | null> = [
    null,
    options.attendanceHeader || "出勤数",
    "本指名数",
    "写真指名数",
    "フリー数",
    "予約数",
    "リピート数",
    "成約数",
    "キャンセル数",
    "女子報酬",
    "有料オプション数",
    "利益",
    "出勤時間",
    "料金",
    "写メ日記数",
    "当日欠勤数",
    ...(options.includeNew === false ? [] : ["新規成約数"]),
    ...(options.includeRepeat === false ? [] : ["リピート成約数"]),
    ...(options.extraColumns || []).map((column) => column.header),
  ];
  const values: Record<string, string | number> = {
    出勤数: 1, 出勤日数: 1, 本指名数: 1, 写真指名数: 1, フリー数: 1, 予約数: 4,
    リピート数: 99, 成約数: options.sourceContractCount ?? 3, キャンセル数: 1, 女子報酬: 25000,
    有料オプション数: 1, 利益: 20000, 出勤時間: "8:30", 料金: 50000, 写メ日記数: 2,
    当日欠勤数: 0, 新規成約数: 1, リピート成約数: 2,
    ...Object.fromEntries((options.extraColumns || []).map((column) => [column.header, column.value])),
    ...options.valueOverrides,
  };
  const workbook = new ExcelJS.Workbook();
  for (const sheetName of options.sheets || [targetSheets[0]]) {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(headers);
    for (const name of options.numericNames ? [101, 102] : ["あい", "みお"]) {
      sheet.addRow([name, ...headers.slice(1).map((header) => values[header!])]);
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer);
}

describe("CTI operational header", () => {
  it("infers a blank A1 as the cast-name column only from safe string data", async () => {
    const result = await parseCtiWorkbook(await realHeaderWorkbook(), storeIds);
    expect(result.sheets[0].detectedHeaderRow).toBe(1);
    expect(result.sheets[0].detectedColumns).toContain("A列（仮想:女子名）");
    expect(result.sheets[0].headerDiagnostics?.candidates[0]).toMatchObject({ castNameInferred: true, eligible: true, selected: true });
    expect(result.sheets[0].rows.map((row) => row.originalCastName)).toEqual(["あい", "みお"]);
  });

  it("does not infer a blank A1 when column A is numeric-centered", async () => {
    const result = await parseCtiWorkbook(await realHeaderWorkbook({ numericNames: true }), storeIds);
    expect(result.globalIssues).toContainEqual(expect.objectContaining({ code: "HEADER_NOT_FOUND" }));
    expect(result.sheets[0].headerDiagnostics?.candidates[0]).toMatchObject({ castNameInferred: false, eligible: false });
  });

  it.each(["出勤数", "出勤日数"] as const)("maps %s to attendance_count", async (attendanceHeader) => {
    const result = await parseCtiWorkbook(await realHeaderWorkbook({ attendanceHeader }), storeIds);
    expect(result.sheets[0].rows[0].metrics?.attendanceCount).toBe(1);
    expect(result.sheets[0].detectedColumns).toContain(attendanceHeader);
  });

  it("maps 新規成約数 to new_count", async () => {
    const result = await parseCtiWorkbook(await realHeaderWorkbook(), storeIds);
    expect(result.sheets[0].rows[0].metrics?.newCount).toBe(1);
  });

  it("maps リピート成約数 to repeat_count", async () => {
    const result = await parseCtiWorkbook(await realHeaderWorkbook(), storeIds);
    expect(result.sheets[0].rows[0].metrics?.repeatCount).toBe(2);
  });

  it("never maps リピート数 to repeat_count", async () => {
    const result = await parseCtiWorkbook(await realHeaderWorkbook({ includeRepeat: false }), storeIds);
    expect(result.sheets[0].rows[0].metrics?.repeatCount).toBeNull();
    expect(result.sheets[0].detectedColumns).toContain("リピート数");
    expect(result.sheets[0].unknownColumns).not.toContain("リピート数");
  });

  it("does not warn for known future/unused columns", async () => {
    const result = await parseCtiWorkbook(await realHeaderWorkbook({ extraColumns: [{ header: "報酬補正", value: -500 }] }), storeIds);
    expect(result.sheets[0].unknownColumns).toEqual([]);
    expect(result.globalIssues.some((issue) => issue.code === "UNKNOWN_COLUMNS")).toBe(false);
    expect(result.sheets[0].rows.flatMap((row) => row.issues).some((issue) => issue.code === "NEGATIVE_VALUE")).toBe(false);
  });

  it("reports a truly undefined column with store, sheet, name, number and header row", async () => {
    const result = await parseCtiWorkbook(await realHeaderWorkbook({ extraColumns: [{ header: "新しい未定義列", value: 1 }] }), storeIds);
    expect(result.sheets[0].unknownColumns).toEqual(["新しい未定義列"]);
    expect(result.globalIssues).toContainEqual(expect.objectContaining({
      code: "UNKNOWN_COLUMNS", columnName: "新しい未定義列",
      rawData: expect.objectContaining({ storeCode: "KASUKABE", sheetName: targetSheets[0], originalName: "新しい未定義列", columnNumber: 19, headerRowNumber: 1 }),
    }));
  });

  it("allows negative adopted money values without NEGATIVE_VALUE", async () => {
    const result = await parseCtiWorkbook(await realHeaderWorkbook({ valueOverrides: { 利益: -500, 料金: -1000, 女子報酬: -200 } }), storeIds);
    expect(result.sheets[0].rows.flatMap((row) => row.issues).some((issue) => issue.code === "NEGATIVE_VALUE")).toBe(false);
  });

  it("rejects a negative known count and includes complete diagnostic context", async () => {
    const result = await parseCtiWorkbook(await realHeaderWorkbook({ extraColumns: [{ header: "事前予約数", value: -1 }] }), storeIds);
    expect(result.sheets[0].rows[0].issues).toContainEqual(expect.objectContaining({
      code: "NEGATIVE_VALUE", level: "ERROR", columnName: "事前予約数",
      rawData: expect.objectContaining({ store: "春日部", castName: "あい", sheetName: targetSheets[0], rowNumber: 2, rawValue: -1, negativeAllowed: false }),
    }));
  });

  it("accepts a header without new/repeat contract columns and stores null with warnings", async () => {
    const result = await parseCtiWorkbook(await realHeaderWorkbook({ includeNew: false, includeRepeat: false }), storeIds);
    expect(result.sheets[0].detectedHeaderRow).toBe(1);
    expect(result.sheets[0].rows[0].metrics).toMatchObject({ newCount: null, repeatCount: null });
    expect(result.globalIssues.filter((issue) => issue.code === "OPTIONAL_BREAKDOWN_COLUMN_MISSING")).toHaveLength(2);
  });

  it("warns when source and calculated contract counts differ", async () => {
    const result = await parseCtiWorkbook(await realHeaderWorkbook({ sourceContractCount: 9 }), storeIds);
    expect(result.sheets[0].rows[0].metrics).toMatchObject({ sourceContractCount: 9, contractCount: 3 });
    expect(result.sheets[0].rows[0].issues).toContainEqual(expect.objectContaining({ code: "CONTRACT_COUNT_MISMATCH", level: "WARNING" }));
  });

  it("previews all three operational target sheets", async () => {
    const result = await parseCtiWorkbook(await realHeaderWorkbook({ sheets: targetSheets }), storeIds);
    expect(result.sheets).toHaveLength(3);
    expect(result.sheets.every((sheet) => sheet.detectedHeaderRow === 1 && sheet.rows.length === 2)).toBe(true);
    expect(result.globalIssues.some((issue) => issue.code === "HEADER_NOT_FOUND")).toBe(false);
  });
});
