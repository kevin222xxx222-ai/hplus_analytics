import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { StoreCode } from "@/generated/prisma/client";
import { parseCtiWorkbook } from "@/lib/imports/cti/parser";

const headers = ["女子名", "出勤日数", "出勤時間", "予約数", "キャンセル数", "接客数", "本指名数", "写真指名数", "フリー数", "成約数", "新規成約数", "リピート成約数", "料金", "女子報酬", "利益", "写メ日記数", "当日欠勤数", "有料オプション数"];
const row = ["あい", 1, "8:30", 4, 1, 3, 1, 1, 1, 3, 1, 2, "50,000円", 25000, 20000, 2, 0, 1];
const storeIds = { [StoreCode.KASUKABE]: "kasukabe", [StoreCode.KOSHIGAYA]: "koshigaya", [StoreCode.NODA]: "noda" };

async function workbookBuffer(sheetNames: string[]) {
  const workbook = new ExcelJS.Workbook();
  for (const name of sheetNames) {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(["女子別レポート"]);
    sheet.addRow(headers);
    sheet.addRow([" 本日の周知＆引継ぎ事項(春日部店) "]);
    sheet.addRow(row);
    sheet.addRow(["合計"]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer);
}

describe("CTI workbook parser", () => {
  it("detects target sheets, headers, exclusions and calculated metrics", async () => {
    const buffer = await workbookBuffer(["若妻淫乱倶楽部春日部店", "若妻淫乱倶楽部越谷店", "全店舗"]);
    const result = await parseCtiWorkbook(buffer, storeIds);
    expect(result.sheets).toHaveLength(2);
    expect(result.missingTargetSheets).toEqual(["若妻淫乱倶楽部野田店"]);
    expect(result.sheets[0].detectedHeaderRow).toBe(2);
    expect(result.sheets[0].headerDiagnostics?.candidates).toContainEqual(expect.objectContaining({ rowNumber: 2, matchCount: 18, eligible: true, selected: true }));
    expect(result.sheets[0].headerDiagnostics?.rows[1].values.slice(0, 3)).toEqual(["女子名", "出勤日数", "出勤時間"]);
    expect(result.sheets[0].excludedRows).toBe(2);
    expect(result.sheets[0].rows[0].metrics).toMatchObject({ attendanceMinutes: 510, serviceCount: 3, contractCount: 3, salesAmount: 50000, payoutAfterRewardAmount: 25000 });
  });

  it("marks a workbook with no target sheets as not importable", async () => {
    const result = await parseCtiWorkbook(await workbookBuffer(["全店舗"]), storeIds);
    expect(result.sheets).toHaveLength(0);
    expect(result.globalIssues.some((issue) => issue.code === "NO_TARGET_SHEETS")).toBe(true);
  });

  it("rejects invalid XLSX bytes", async () => {
    await expect(parseCtiWorkbook(Buffer.from("not-xlsx"), storeIds)).rejects.toThrow();
  });

  it("records an error when a required column is missing", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("若妻淫乱倶楽部春日部店");
    sheet.addRow(["女子別レポート"]);
    sheet.addRow(headers.filter((header) => header !== "料金"));
    sheet.addRow(row);
    const result = await parseCtiWorkbook(Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer), storeIds);
    expect(result.sheets[0].rows[0].issues).toContainEqual(expect.objectContaining({ code: "REQUIRED_COLUMN_MISSING", columnName: "料金", level: "ERROR" }));
  });

  it("keeps row and column diagnostics when the header is not found", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("若妻淫乱倶楽部春日部店");
    sheet.addRow(["女子別レポート"]);
    sheet.addRow(["出勤時間", "予約数", "女子報酬"]);
    const result = await parseCtiWorkbook(Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer), storeIds);
    expect(result.globalIssues).toContainEqual(expect.objectContaining({ code: "HEADER_NOT_FOUND" }));
    expect(result.sheets[0].headerDiagnostics?.candidates).toContainEqual(expect.objectContaining({
      rowNumber: 2,
      matchCount: 3,
      matchedColumns: ["出勤時間", "予約数", "女子報酬"],
      eligible: false,
      selected: false,
    }));
    expect(result.sheets[0].headerDiagnostics?.rows[1].values.slice(0, 3)).toEqual(["出勤時間", "予約数", "女子報酬"]);
  });
});
