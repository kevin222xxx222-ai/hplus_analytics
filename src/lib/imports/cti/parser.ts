import ExcelJS, { type Row, type Worksheet } from "exceljs";
import { CTI_COLUMN_CATALOG, type CtiColumnCatalogEntry } from "@/lib/imports/cti/column-catalog";
import { COLUMN_DEFINITIONS, HEADER_REQUIRED_COLUMNS, HEADER_REQUIRED_MIN_MATCHES, OPTIONAL_BREAKDOWN_COLUMNS, REQUIRED_COLUMNS, TARGET_SHEETS, type CtiColumnKey, type CtiStoreCode } from "@/lib/imports/cti/constants";
import { getExclusionReason } from "@/lib/imports/cti/exclusions";
import type { CtiMetrics, CtiPreviewRow, HeaderCandidateDiagnostic, RowIssue, SheetHeaderDiagnostics, SheetPreview, UnknownColumnDiagnostic } from "@/lib/imports/cti/types";
import { normalizeCastName } from "@/lib/normalize";
import { cellScalar, normalizeHeader, normalizeSourceName, parseDurationMinutes, parseInteger } from "@/lib/imports/cti/values";

const headerAliasToKey = new Map<string, CtiColumnKey>();
for (const [key, aliases] of Object.entries(COLUMN_DEFINITIONS) as Array<[CtiColumnKey, readonly string[]]>) {
  for (const alias of aliases) headerAliasToKey.set(normalizeHeader(alias), key);
}

const catalogByHeader = new Map(CTI_COLUMN_CATALOG.flatMap((definition) =>
  definition.sourceName ? [[normalizeHeader(definition.sourceName), definition] as const] : [],
));

type ColumnMap = Partial<Record<CtiColumnKey, number>>;
type KnownValidationColumn = { definition: CtiColumnCatalogEntry; columnNumber: number; originalName: string };
type RawUnknownColumn = { originalName: string; columnNumber: number };
type RowContext = { storeCode: CtiStoreCode; sheetName: string; rowNumber: number; castName: string };

const STORE_NAMES: Record<CtiStoreCode, string> = { KASUKABE: "春日部", KOSHIGAYA: "越谷", NODA: "野田" };

function cellDisplayValue(row: Row, columnNumber: number) {
  const scalar = cellScalar(row.getCell(columnNumber).value);
  if (scalar === null || scalar === undefined) return "";
  if (scalar instanceof Date) return scalar.toISOString();
  return String(scalar);
}

function safelyInferCastNameColumn(worksheet: Worksheet, headerRowNumber: number, map: ColumnMap) {
  const headerA = normalizeSourceName(worksheet.getRow(headerRowNumber).getCell(1).value);
  const requiredMatchCount = HEADER_REQUIRED_COLUMNS.filter((key) => map[key]).length;
  if (headerA || requiredMatchCount < HEADER_REQUIRED_MIN_MATCHES) return false;
  const end = Math.min(worksheet.rowCount, headerRowNumber + 50);
  let nameCount = 0;
  let numericCount = 0;
  let meaningfulCount = 0;
  for (let rowNumber = headerRowNumber + 1; rowNumber <= end; rowNumber += 1) {
    const raw = cellScalar(worksheet.getRow(rowNumber).getCell(1).value);
    const text = normalizeSourceName(raw);
    if (!text) continue;
    meaningfulCount += 1;
    if (parseInteger(raw) !== null || typeof raw === "number") {
      numericCount += 1;
      continue;
    }
    if (typeof raw === "string" && !getExclusionReason(text)) nameCount += 1;
  }
  return nameCount >= 2 && nameCount > numericCount && nameCount / Math.max(meaningfulCount, 1) >= 0.5;
}

function inspectHeaderRows(worksheet: Worksheet) {
  let best: { rowNumber: number; map: ColumnMap; detected: string[]; unknown: RawUnknownColumn[]; validationColumns: KnownValidationColumn[]; score: number } | null = null;
  const candidates: Array<Omit<HeaderCandidateDiagnostic, "selected"> & { map: ColumnMap; detected: string[]; unknown: RawUnknownColumn[]; validationColumns: KnownValidationColumn[] }> = [];
  const limit = Math.min(worksheet.rowCount, 50);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const map: ColumnMap = {};
    const detected: string[] = [];
    const unknown: RawUnknownColumn[] = [];
    const validationColumns: KnownValidationColumn[] = [];
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const original = String(cellScalar(cell.value) ?? "").trim();
      if (!original) return;
      const key = headerAliasToKey.get(normalizeHeader(original));
      const definition = catalogByHeader.get(normalizeHeader(original));
      if (key && !map[key]) {
        map[key] = columnNumber;
        detected.push(original);
      } else if (definition || key) {
        detected.push(original);
      } else {
        unknown.push({ originalName: original, columnNumber });
      }
      if (definition && definition.classification !== "ADOPTED") validationColumns.push({ definition, columnNumber, originalName: original });
    });
    const castNameInferred = !map.castName && safelyInferCastNameColumn(worksheet, rowNumber, map);
    if (castNameInferred) {
      map.castName = 1;
      detected.unshift("A列（仮想:女子名）");
    }
    const score = Object.keys(map).length;
    const matchedKeys = Object.keys(map) as CtiColumnKey[];
    const requiredMatchCount = HEADER_REQUIRED_COLUMNS.filter((key) => map[key]).length;
    const eligible = Boolean(map.castName && requiredMatchCount >= HEADER_REQUIRED_MIN_MATCHES);
    if (score > 0) candidates.push({
      rowNumber,
      matchCount: score,
      matchedColumns: matchedKeys.map((key) => COLUMN_DEFINITIONS[key][0]),
      missingRequiredColumns: REQUIRED_COLUMNS.filter((key) => !map[key]).map((key) => COLUMN_DEFINITIONS[key][0]),
      hasCastName: Boolean(map.castName),
      eligible,
      castNameInferred,
      map, detected, unknown, validationColumns,
    });
    if (eligible && (!best || score > best.score)) best = { rowNumber, map, detected, unknown, validationColumns, score };
  }
  const diagnostics: SheetHeaderDiagnostics = {
    sheetName: worksheet.name,
    scannedRowCount: limit,
    rows: Array.from({ length: limit }, (_, index) => ({
      rowNumber: index + 1,
      values: Array.from({ length: 26 }, (__, columnIndex) => cellDisplayValue(worksheet.getRow(index + 1), columnIndex + 1)),
    })),
    candidates: candidates.map((candidate) => ({
      rowNumber: candidate.rowNumber,
      matchCount: candidate.matchCount,
      matchedColumns: candidate.matchedColumns,
      missingRequiredColumns: candidate.missingRequiredColumns,
      hasCastName: candidate.hasCastName,
      eligible: candidate.eligible,
      selected: best?.rowNumber === candidate.rowNumber,
      castNameInferred: candidate.castNameInferred,
    })),
  };
  return { best, diagnostics };
}

function valueAt(row: Row, map: ColumnMap, key: CtiColumnKey) {
  const column = map[key];
  return column ? row.getCell(column).value : null;
}

function issueContext(context: RowContext, columnName: string, rawValue: unknown, negativeAllowed: boolean, reason: string) {
  return {
    store: STORE_NAMES[context.storeCode], storeCode: context.storeCode, castName: context.castName,
    sheetName: context.sheetName, rowNumber: context.rowNumber, columnName, rawValue,
    negativeAllowed, reason,
  };
}

function negativeValueIssue(context: RowContext, columnName: string, value: number, negativeAllowed: boolean): RowIssue | null {
  if (value >= 0 || negativeAllowed) return null;
  const reason = "件数・出勤時間として負数を許可していないため。";
  return {
    code: "NEGATIVE_VALUE", level: "ERROR", columnName,
    message: `${STORE_NAMES[context.storeCode]} / ${context.castName} / ${context.sheetName} / 行${context.rowNumber} / ${columnName}: 元の値=${value}、負数許可=いいえ。${reason}`,
    rawData: issueContext(context, columnName, value, false, reason),
  };
}

function requiredInteger(row: Row, map: ColumnMap, key: CtiColumnKey, label: string, issues: RowIssue[], context: RowContext, negativeAllowed = false) {
  const raw = valueAt(row, map, key);
  const value = parseInteger(raw);
  if (value === null) {
    const scalar = cellScalar(raw);
    issues.push({ code: "INVALID_INTEGER", level: "ERROR", message: `${STORE_NAMES[context.storeCode]} / ${context.castName} / ${context.sheetName} / 行${context.rowNumber} / ${label}: 整数へ変換できません。`, columnName: label, rawData: issueContext(context, label, scalar, negativeAllowed, "整数への重大な値変換失敗。") });
    return null;
  }
  const negativeIssue = negativeValueIssue(context, label, value, negativeAllowed);
  if (negativeIssue) issues.push(negativeIssue);
  if ((key.endsWith("Count") && Math.abs(value) > 1000) || (key.endsWith("Amount") && Math.abs(value) > 10_000_000)) {
    issues.push({ code: "OUTLIER_VALUE", level: "WARNING", message: `${label}が確認基準を超えています。`, columnName: label, rawData: value });
  }
  return value;
}

function optionalInteger(row: Row, map: ColumnMap, key: CtiColumnKey, label: string, issues: RowIssue[], context: RowContext) {
  if (!map[key]) return null;
  const raw = valueAt(row, map, key);
  const scalar = cellScalar(raw);
  if (scalar === null || scalar === undefined || scalar === "") return null;
  const value = parseInteger(raw);
  if (value === null) issues.push({ code: "INVALID_INTEGER", level: "ERROR", message: `${STORE_NAMES[context.storeCode]} / ${context.castName} / ${context.sheetName} / 行${context.rowNumber} / ${label}: 整数へ変換できません。`, columnName: label, rawData: issueContext(context, label, scalar, false, "整数への重大な値変換失敗。") });
  if (value !== null) {
    const negativeIssue = negativeValueIssue(context, label, value, false);
    if (negativeIssue) issues.push(negativeIssue);
  }
  return value;
}

function validateKnownUnusedColumns(row: Row, columns: KnownValidationColumn[], issues: RowIssue[], context: RowContext) {
  for (const { definition, columnNumber, originalName } of columns) {
    const raw = row.getCell(columnNumber).value;
    const scalar = cellScalar(raw);
    if (scalar === null || scalar === undefined || scalar === "" || definition.dataType === "TEXT") continue;
    const value = definition.dataType === "DECIMAL_HOURS"
      ? parseDurationMinutes(raw, row.getCell(columnNumber).numFmt)
      : parseInteger(raw);
    if (value === null) {
      const reason = "既知列の重大な値変換失敗。未採用列のため保存はしません。";
      issues.push({
        code: "INVALID_KNOWN_COLUMN_VALUE", level: "ERROR", columnName: originalName,
        message: `${STORE_NAMES[context.storeCode]} / ${context.castName} / ${context.sheetName} / 行${context.rowNumber} / ${originalName}: 値を${definition.dataType === "DECIMAL_HOURS" ? "時間" : "整数"}へ変換できません。`,
        rawData: issueContext(context, originalName, scalar, definition.negativeAllowed, reason),
      });
      continue;
    }
    const negativeIssue = negativeValueIssue(context, originalName, value, definition.negativeAllowed);
    if (negativeIssue) issues.push(negativeIssue);
  }
}

function parseMetrics(row: Row, map: ColumnMap, issues: RowIssue[], context: RowContext): CtiMetrics | null {
  const attendanceMinutesRaw = valueAt(row, map, "attendanceMinutes");
  const attendanceColumn = map.attendanceMinutes;
  const attendanceScalar = cellScalar(attendanceMinutesRaw);
  const numericAttendance = typeof attendanceScalar === "number" ? attendanceScalar : Number(String(attendanceScalar ?? "").trim());
  if (Number.isFinite(numericAttendance) && numericAttendance < 0) {
    const issue = negativeValueIssue(context, "出勤時間", numericAttendance, false);
    if (issue) issues.push(issue);
  }
  const attendanceMinutes = parseDurationMinutes(attendanceMinutesRaw, attendanceColumn ? row.getCell(attendanceColumn).numFmt : undefined);
  if (attendanceMinutes === null && !(Number.isFinite(numericAttendance) && numericAttendance < 0)) {
    issues.push({ code: "INVALID_DURATION", level: "ERROR", message: `${STORE_NAMES[context.storeCode]} / ${context.castName} / ${context.sheetName} / 行${context.rowNumber} / 出勤時間: 分へ変換できません。`, columnName: "出勤時間", rawData: issueContext(context, "出勤時間", attendanceScalar, false, "時間への重大な値変換失敗。") });
  }

  const values = {
    attendanceCount: requiredInteger(row, map, "attendanceCount", "出勤数", issues, context),
    sameDayAbsenceCount: requiredInteger(row, map, "sameDayAbsenceCount", "当日欠勤数", issues, context),
    reservationCount: requiredInteger(row, map, "reservationCount", "予約数", issues, context),
    cancellationCount: requiredInteger(row, map, "cancellationCount", "キャンセル数", issues, context),
    regularNominationCount: requiredInteger(row, map, "regularNominationCount", "本指名数", issues, context),
    photoNominationCount: requiredInteger(row, map, "photoNominationCount", "写真指名数", issues, context),
    freeCount: requiredInteger(row, map, "freeCount", "フリー数", issues, context),
    salesAmount: requiredInteger(row, map, "salesAmount", "料金", issues, context, true),
    castRewardAmount: requiredInteger(row, map, "castRewardAmount", "女子報酬", issues, context, true),
    ctiProfitAmount: requiredInteger(row, map, "ctiProfitAmount", "利益", issues, context, true),
    diaryCountCti: requiredInteger(row, map, "diaryCountCti", "写メ日記数", issues, context),
    paidOptionCount: requiredInteger(row, map, "paidOptionCount", "有料オプション数", issues, context),
  };
  if (attendanceMinutes === null || Object.values(values).some((value) => value === null)) return null;

  const reservationCount = values.reservationCount!;
  const cancellationCount = values.cancellationCount!;
  const regularNominationCount = values.regularNominationCount!;
  const photoNominationCount = values.photoNominationCount!;
  const freeCount = values.freeCount!;
  const serviceCount = reservationCount - cancellationCount;
  const contractCount = regularNominationCount + photoNominationCount + freeCount;
  const sourceServiceCount = optionalInteger(row, map, "sourceServiceCount", "接客数", issues, context);
  const sourceContractCount = optionalInteger(row, map, "sourceContractCount", "成約数", issues, context);
  const newCount = optionalInteger(row, map, "newCount", "新規成約数", issues, context);
  const repeatCount = optionalInteger(row, map, "repeatCount", "リピート成約数", issues, context);

  if (cancellationCount > reservationCount) issues.push({ code: "CANCELLATION_EXCEEDS_RESERVATION", level: "WARNING", message: "キャンセル数が予約数を超えています。" });
  if (sourceServiceCount !== null && sourceServiceCount !== serviceCount) issues.push({ code: "SERVICE_COUNT_MISMATCH", level: "WARNING", message: `CTI接客数(${sourceServiceCount})と予約−キャンセル(${serviceCount})が一致しません。` });
  if (sourceContractCount !== null && sourceContractCount !== contractCount) issues.push({ code: "CONTRACT_COUNT_MISMATCH", level: "WARNING", message: `CTI成約数(${sourceContractCount})と指名内訳合計(${contractCount})が一致しません。` });

  return {
    attendanceCount: values.attendanceCount!, attendanceMinutes, sameDayAbsenceCount: values.sameDayAbsenceCount!,
    reservationCount, cancellationCount, serviceCount, sourceServiceCount,
    regularNominationCount, photoNominationCount, freeCount, contractCount, sourceContractCount,
    newCount, repeatCount, salesAmount: values.salesAmount!,
    castRewardAmount: values.castRewardAmount!, ctiProfitAmount: values.ctiProfitAmount!,
    payoutAfterRewardAmount: values.salesAmount! - values.castRewardAmount!, diaryCountCti: values.diaryCountCti!, paidOptionCount: values.paidOptionCount!,
  };
}

function parseSheet(worksheet: Worksheet, storeCode: CtiStoreCode, storeId: string): { preview: SheetPreview; issues: RowIssue[] } {
  const { best: header, diagnostics } = inspectHeaderRows(worksheet);
  if (!header) {
    return { preview: { sheetName: worksheet.name, storeCode, detectedHeaderRow: 0, detectedColumns: [], unknownColumns: [], totalRows: 0, excludedRows: 0, rows: [], headerDiagnostics: diagnostics }, issues: [{ code: "HEADER_NOT_FOUND", level: "ERROR", message: `${worksheet.name}: ヘッダー行を検出できません。` }] };
  }
  const missing = REQUIRED_COLUMNS.filter((key) => !header.map[key]);
  const sheetIssues: RowIssue[] = missing.map((key) => ({ code: "REQUIRED_COLUMN_MISSING", level: "ERROR", message: `${worksheet.name}: 必須列「${COLUMN_DEFINITIONS[key][0]}」がありません。`, columnName: COLUMN_DEFINITIONS[key][0] }));
  for (const key of OPTIONAL_BREAKDOWN_COLUMNS.filter((key) => !header.map[key])) {
    sheetIssues.push({ code: "OPTIONAL_BREAKDOWN_COLUMN_MISSING", level: "WARNING", message: `${worksheet.name}: 任意列「${COLUMN_DEFINITIONS[key][0]}」がないため、この項目はnullで保存します。`, columnName: COLUMN_DEFINITIONS[key][0] });
  }
  const unknownColumnDetails: UnknownColumnDiagnostic[] = header.unknown.map((column) => ({
    storeCode, sheetName: worksheet.name, originalName: column.originalName,
    columnNumber: column.columnNumber, headerRowNumber: header.rowNumber,
  }));
  for (const column of unknownColumnDetails) {
    sheetIssues.push({
      code: "UNKNOWN_COLUMNS", level: "WARNING", columnName: column.originalName,
      message: `${STORE_NAMES[storeCode]} / ${column.sheetName}: 未定義列「${column.originalName}」を列${column.columnNumber}、ヘッダー行${column.headerRowNumber}で検出しました。`,
      rawData: column,
    });
  }

  const rows: CtiPreviewRow[] = [];
  let excludedRows = 0;
  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const originalCastName = normalizeSourceName(valueAt(row, header.map, "castName"));
    const exclusionReason = getExclusionReason(originalCastName);
    if (exclusionReason) {
      excludedRows += 1;
      continue;
    }
    const issues: RowIssue[] = [...sheetIssues.filter((issue) => issue.level === "ERROR")];
    const context: RowContext = { storeCode, sheetName: worksheet.name, rowNumber, castName: originalCastName };
    validateKnownUnusedColumns(row, header.validationColumns, issues, context);
    const metrics = missing.length ? null : parseMetrics(row, header.map, issues, context);
    rows.push({
      rowKey: `${storeCode}:${rowNumber}`, storeCode, storeId, sourceSheetName: worksheet.name, sourceRowNumber: rowNumber,
      originalCastName, normalizedCastName: normalizeCastName(originalCastName), castId: null, castDisplayName: null,
      resolutionStatus: "UNMATCHED", exclusionReason: null, metrics, issues,
    });
  }
  return {
    preview: { sheetName: worksheet.name, storeCode, detectedHeaderRow: header.rowNumber, detectedColumns: header.detected, unknownColumns: header.unknown.map((column) => column.originalName), unknownColumnDetails, totalRows: rows.length + excludedRows, excludedRows, rows, headerDiagnostics: diagnostics },
    issues: sheetIssues,
  };
}

export async function inspectCtiWorkbookHeaders(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);
  return Object.keys(TARGET_SHEETS).flatMap((sheetName) => {
    const sheet = workbook.getWorksheet(sheetName);
    return sheet ? [inspectHeaderRows(sheet).diagnostics] : [];
  });
}

export async function parseCtiWorkbook(buffer: Buffer, storeIds: Record<CtiStoreCode, string>) {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);
  const workbookSheetNames = workbook.worksheets.map((sheet) => sheet.name);
  const targetNames = Object.keys(TARGET_SHEETS);
  const presentTargetNames = targetNames.filter((name) => workbook.getWorksheet(name));
  const missingTargetSheets = targetNames.filter((name) => !workbook.getWorksheet(name));
  const globalIssues: RowIssue[] = missingTargetSheets.map((name) => ({ code: "TARGET_SHEET_MISSING", level: "WARNING", message: `対象シート「${name}」がありません。` }));
  if (!presentTargetNames.length) globalIssues.push({ code: "NO_TARGET_SHEETS", level: "ERROR", message: "対象3店舗のシートが1つもありません。" });

  const sheets: SheetPreview[] = [];
  for (const sheetName of presentTargetNames) {
    const storeCode = TARGET_SHEETS[sheetName];
    const result = parseSheet(workbook.getWorksheet(sheetName)!, storeCode, storeIds[storeCode]);
    sheets.push(result.preview);
    globalIssues.push(...result.issues);
  }
  return { workbookSheetNames, missingTargetSheets, sheets, globalIssues };
}
