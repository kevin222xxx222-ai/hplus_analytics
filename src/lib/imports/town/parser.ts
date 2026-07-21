import type { StoreCode } from "@/generated/prisma/client";
import { detectTownDataType, normalizeHeader, requiredHeaders, TOWN_COLUMNS } from "@/lib/imports/town/columns";
import { decodeTownCsv, parseCsv } from "@/lib/imports/town/csv";
import type {
  TownCastPreviewRow,
  TownImportDataType,
  TownIssue,
  TownLandingPreviewRow,
  TownPreview,
  TownPreviewRow,
  TownRatioMetrics,
  TownStorePreviewRow,
  TownUrlPreviewRow,
} from "@/lib/imports/town/types";
import { parseTownUrl } from "@/lib/imports/town/url";
import { parseJapaneseDate, parsePeriodTitle, parseTownDecimal, parseTownInteger, parseTownPercent, ratio } from "@/lib/imports/town/values";
import { normalizeCastName } from "@/lib/normalize";

type ParseInput = {
  buffer: Buffer;
  batchId: string;
  runId: string;
  dataType: TownImportDataType;
  storeId: string;
  storeCode: StoreCode;
  storeName: string;
  targetFrom: string;
  targetTo: string;
  expectedExternalStoreId?: string | null;
};

function mapColumns(headers: string[]) {
  return new Map(headers.map((header, index) => [normalizeHeader(header), index]));
}

function column(row: string[], columns: Map<string, number>, name: string) {
  const index = columns.get(normalizeHeader(name));
  return index === undefined ? "" : row[index] || "";
}

function rowError(globalIssues: TownIssue[], rowNumber: number, columnName: string, rawValue: string, message: string) {
  globalIssues.push({
    code: "INVALID_VALUE",
    level: "ERROR",
    columnName,
    message: `行${rowNumber} / ${columnName}: ${message}`,
    rawData: { rowNumber, columnName, rawValue },
  });
}

function requiredInteger(globalIssues: TownIssue[], row: string[], columns: Map<string, number>, name: string, rowNumber: number) {
  const raw = column(row, columns, name);
  const value = parseTownInteger(raw);
  if (value === null) rowError(globalIssues, rowNumber, name, raw, "整数へ変換できません。");
  else if (value < 0) rowError(globalIssues, rowNumber, name, raw, "負数は使用できません。");
  return value !== null && value >= 0 ? value : null;
}

function requiredDecimal(globalIssues: TownIssue[], row: string[], columns: Map<string, number>, name: string, rowNumber: number) {
  const raw = column(row, columns, name);
  const value = parseTownDecimal(raw);
  if (value === null) rowError(globalIssues, rowNumber, name, raw, "小数へ変換できません。");
  else if (value < 0) rowError(globalIssues, rowNumber, name, raw, "負数は使用できません。");
  return value !== null && value >= 0 ? value : null;
}

function requiredPercent(globalIssues: TownIssue[], row: string[], columns: Map<string, number>, name: string, rowNumber: number) {
  const raw = column(row, columns, name);
  const value = parseTownPercent(raw);
  if (value === null) rowError(globalIssues, rowNumber, name, raw, "割合へ変換できません。");
  else if (value < 0) rowError(globalIssues, rowNumber, name, raw, "負数は使用できません。");
  return value !== null && value >= 0 ? value : null;
}

function ratioIssues(sourceAveragePv: number, sourceConversionRate: number, metrics: Pick<TownRatioMetrics, "averagePv" | "conversionRate">) {
  const issues: TownIssue[] = [];
  if (metrics.averagePv !== null && Math.abs(sourceAveragePv - metrics.averagePv) > 0.0051) {
    issues.push({ code: "AVERAGE_PV_MISMATCH", level: "WARNING", message: `CSV平均PV(${sourceAveragePv})とPV÷UU(${metrics.averagePv.toFixed(6)})が丸め差を超えて一致しません。` });
  }
  if (metrics.conversionRate !== null && Math.abs(sourceConversionRate - metrics.conversionRate) > 0.000051) {
    issues.push({ code: "CONVERSION_RATE_MISMATCH", level: "WARNING", message: `CSV CVR(${(sourceConversionRate * 100).toFixed(2)}%)とTEL÷UU(${(metrics.conversionRate * 100).toFixed(4)}%)が丸め差を超えて一致しません。` });
  }
  return issues;
}

function parseRatioMetrics(
  globalIssues: TownIssue[],
  row: string[],
  columns: Map<string, number>,
  names: { pv: string; uu: string; averagePv: string; telTapUu: string; conversionRate: string },
  rowNumber: number,
) {
  const pv = requiredInteger(globalIssues, row, columns, names.pv, rowNumber);
  const uu = requiredInteger(globalIssues, row, columns, names.uu, rowNumber);
  const sourceAveragePv = requiredDecimal(globalIssues, row, columns, names.averagePv, rowNumber);
  const telTapUu = requiredInteger(globalIssues, row, columns, names.telTapUu, rowNumber);
  const sourceConversionRate = requiredPercent(globalIssues, row, columns, names.conversionRate, rowNumber);
  if (pv === null || uu === null || sourceAveragePv === null || telTapUu === null || sourceConversionRate === null) return null;
  const metrics: TownRatioMetrics = {
    pv,
    uu,
    averagePv: ratio(pv, uu),
    sourceAveragePv,
    telTapUu,
    conversionRate: ratio(telTapUu, uu),
    sourceConversionRate,
  };
  return { metrics, issues: ratioIssues(sourceAveragePv, sourceConversionRate, metrics) };
}

export function parseTownCsv(input: ParseInput): TownPreview {
  const decoded = decodeTownCsv(input.buffer);
  const csvRows = parseCsv(decoded.text);
  const globalIssues: TownIssue[] = [];
  const actualType = detectTownDataType(csvRows.slice(0, 50));
  const period = parsePeriodTitle(csvRows[0]?.[0] || "");
  if (!actualType) {
    globalIssues.push({ code: "HEADER_NOT_FOUND", level: "ERROR", message: "既知のタウンCSVヘッダーを先頭50行から検出できません。" });
  } else if (actualType !== input.dataType) {
    globalIssues.push({ code: "FILE_TYPE_MISMATCH", level: "ERROR", message: `選択種別${input.dataType}に対し、実ファイルは${actualType}として検出されました。` });
  }
  if (!period) globalIssues.push({ code: "PERIOD_NOT_FOUND", level: "WARNING", message: "CSV先頭行から対象期間を検出できません。アップロード指定期間を使用します。" });
  else if (period.from !== input.targetFrom || period.to !== input.targetTo) {
    globalIssues.push({ code: "TARGET_PERIOD_MISMATCH", level: "ERROR", message: `CSV期間${period.from}〜${period.to}と指定期間${input.targetFrom}〜${input.targetTo}が一致しません。` });
  }
  if (input.dataType !== "TOWN_STORE" && input.targetFrom !== input.targetTo) {
    globalIssues.push({ code: "MULTI_DAY_WITHOUT_DATE_COLUMN", level: "ERROR", message: "このCSVには行別日付がないため、複数日を日次へ配賦できません。対象開始日と終了日を同日にしてください。" });
  }

  const expected = requiredHeaders(input.dataType);
  const headerIndex = csvRows.findIndex((row) => expected.every((header) => row.map(normalizeHeader).includes(normalizeHeader(header))));
  const header = headerIndex >= 0 ? csvRows[headerIndex] : [];
  const known = new Set(expected.map(normalizeHeader));
  const unknownColumns = header.filter((value) => value.trim() && !known.has(normalizeHeader(value)));
  for (const unknown of unknownColumns) globalIssues.push({ code: "UNKNOWN_COLUMNS", level: "WARNING", columnName: unknown, message: `未定義列「${unknown}」を検出しました。` });
  if (headerIndex < 0 || actualType !== input.dataType) {
    return {
      version: 1, batchId: input.batchId, runId: input.runId, dataType: input.dataType,
      storeId: input.storeId, storeCode: input.storeCode, storeName: input.storeName,
      targetFrom: input.targetFrom, targetTo: input.targetTo,
      sourcePeriodFrom: period?.from || null, sourcePeriodTo: period?.to || null,
      encoding: decoded.encoding, delimiter: ",", headerRow: Math.max(0, headerIndex + 1),
      detectedColumns: header, unknownColumns, rows: [], globalIssues, createdAt: new Date().toISOString(),
    };
  }

  const columns = mapColumns(header);
  const rows: TownPreviewRow[] = [];
  const seenUrls = new Set<string>();
  for (let index = headerIndex + 1; index < csvRows.length; index += 1) {
    const source = csvRows[index];
    if (!source.some((value) => value.trim())) continue;
    const sourceRowNumber = index + 1;
    const date = input.dataType === "TOWN_STORE"
      ? parseJapaneseDate(column(source, columns, TOWN_COLUMNS.TOWN_STORE.date))
      : input.targetFrom;
    if (!date) {
      rowError(globalIssues, sourceRowNumber, "日付", column(source, columns, "日付"), "日付へ変換できません。");
      continue;
    }
    if (date < input.targetFrom || date > input.targetTo) {
      globalIssues.push({ code: "DATE_OUT_OF_RANGE", level: "ERROR", message: `行${sourceRowNumber}の日付${date}が指定期間外です。`, rawData: { rowNumber: sourceRowNumber, date } });
      continue;
    }

    if (input.dataType === "TOWN_STORE") {
      const names = TOWN_COLUMNS.TOWN_STORE;
      const parsed = parseRatioMetrics(globalIssues, source, columns, names, sourceRowNumber);
      const bounceRate = requiredPercent(globalIssues, source, columns, names.bounceRate, sourceRowNumber);
      if (!parsed || bounceRate === null) continue;
      const result: TownStorePreviewRow = { kind: "STORE", rowKey: `STORE:${sourceRowNumber}`, sourceRowNumber, date, bounceRate, castId: null, castDisplayName: null, resolutionStatus: "NOT_APPLICABLE", ...parsed.metrics, issues: parsed.issues };
      rows.push(result);
      continue;
    }

    if (input.dataType === "TOWN_CAST") {
      const names = TOWN_COLUMNS.TOWN_CAST;
      const castName = column(source, columns, names.castName).trim();
      const parsed = parseRatioMetrics(globalIssues, source, columns, names, sourceRowNumber);
      if (!castName) rowError(globalIssues, sourceRowNumber, names.castName, "", "キャスト名が空です。");
      if (!parsed || !castName) continue;
      const result: TownCastPreviewRow = {
        kind: "CAST", rowKey: `CAST:${sourceRowNumber}`, sourceRowNumber, date,
        originalCastName: castName, normalizedCastName: normalizeCastName(castName),
        castId: null, castDisplayName: null, resolutionStatus: "UNMATCHED", isListed: true,
        ...parsed.metrics, issues: parsed.issues,
      };
      rows.push(result);
      continue;
    }

    if (input.dataType === "TOWN_URL") {
      const names = TOWN_COLUMNS.TOWN_URL;
      const rawUrl = column(source, columns, names.url).trim();
      const parsedUrl = parseTownUrl(rawUrl);
      const parsed = parseRatioMetrics(globalIssues, source, columns, names, sourceRowNumber);
      if (!rawUrl) rowError(globalIssues, sourceRowNumber, names.url, rawUrl, "URLが空です。");
      if (!parsed || !rawUrl) continue;
      const issues = [...parsed.issues];
      if (!parsedUrl.valid) issues.push({ code: "URL_PARSE_FAILED", level: "WARNING", message: "URLをタウンURLとして解析できないためOTHERで保存します。" });
      if (input.expectedExternalStoreId && parsedUrl.externalStoreId && parsedUrl.externalStoreId !== input.expectedExternalStoreId) {
        issues.push({ code: "EXTERNAL_STORE_ID_MISMATCH", level: "ERROR", message: `選択店舗のタウン店舗ID(${input.expectedExternalStoreId})とURL内店舗ID(${parsedUrl.externalStoreId})が一致しません。` });
      }
      if (seenUrls.has(parsedUrl.normalizedUrl)) issues.push({ code: "DUPLICATE_NORMALIZED_URL", level: "ERROR", message: "同一CSV内に正規化後のURLが重複しています。" });
      seenUrls.add(parsedUrl.normalizedUrl);
      const castName = column(source, columns, names.castName).trim() || null;
      const result: TownUrlPreviewRow = {
        kind: "URL", rowKey: `URL:${sourceRowNumber}`, sourceRowNumber, date, url: rawUrl,
        ...parsedUrl, sourceCastName: castName, normalizedCastName: castName ? normalizeCastName(castName) : null,
        castId: null, castDisplayName: null, resolutionStatus: castName ? "UNMATCHED" : "NOT_APPLICABLE",
        ...parsed.metrics, issues,
      };
      rows.push(result);
      continue;
    }

    const names = TOWN_COLUMNS.TOWN_LANDING;
    const rawUrl = column(source, columns, names.landingUrl).trim();
    const parsedUrl = parseTownUrl(rawUrl);
    const uu = requiredInteger(globalIssues, source, columns, names.uu, sourceRowNumber);
    const bounceRate = requiredPercent(globalIssues, source, columns, names.bounceRate, sourceRowNumber);
    const telTapUu = requiredInteger(globalIssues, source, columns, names.telTapUu, sourceRowNumber);
    const sourceConversionRate = requiredPercent(globalIssues, source, columns, names.conversionRate, sourceRowNumber);
    if (!rawUrl) rowError(globalIssues, sourceRowNumber, names.landingUrl, rawUrl, "URLが空です。");
    if (uu === null || bounceRate === null || telTapUu === null || sourceConversionRate === null || !rawUrl) continue;
    const conversionRate = ratio(telTapUu, uu);
    const issues = ratioIssues(0, sourceConversionRate, { averagePv: null, conversionRate });
    if (!parsedUrl.valid) issues.push({ code: "URL_PARSE_FAILED", level: "WARNING", message: "URLをタウンURLとして解析できないためOTHERで保存します。" });
    if (input.expectedExternalStoreId && parsedUrl.externalStoreId && parsedUrl.externalStoreId !== input.expectedExternalStoreId) {
      issues.push({ code: "EXTERNAL_STORE_ID_MISMATCH", level: "ERROR", message: `選択店舗のタウン店舗ID(${input.expectedExternalStoreId})とURL内店舗ID(${parsedUrl.externalStoreId})が一致しません。` });
    }
    if (seenUrls.has(parsedUrl.normalizedUrl)) issues.push({ code: "DUPLICATE_NORMALIZED_URL", level: "ERROR", message: "同一CSV内に正規化後のURLが重複しています。" });
    seenUrls.add(parsedUrl.normalizedUrl);
    const castName = column(source, columns, names.castName).trim() || null;
    const result: TownLandingPreviewRow = {
      kind: "LANDING", rowKey: `LANDING:${sourceRowNumber}`, sourceRowNumber, date, landingUrl: rawUrl,
      ...parsedUrl, sourceCastName: castName, normalizedCastName: castName ? normalizeCastName(castName) : null,
      castId: null, castDisplayName: null, resolutionStatus: castName ? "UNMATCHED" : "NOT_APPLICABLE",
      uu, bounceRate, telTapUu, conversionRate, sourceConversionRate, issues,
    };
    rows.push(result);
  }

  return {
    version: 1, batchId: input.batchId, runId: input.runId, dataType: input.dataType,
    storeId: input.storeId, storeCode: input.storeCode, storeName: input.storeName,
    targetFrom: input.targetFrom, targetTo: input.targetTo,
    sourcePeriodFrom: period?.from || null, sourcePeriodTo: period?.to || null,
    encoding: decoded.encoding, delimiter: ",", headerRow: headerIndex + 1,
    detectedColumns: header, unknownColumns, rows, globalIssues, createdAt: new Date().toISOString(),
  };
}
