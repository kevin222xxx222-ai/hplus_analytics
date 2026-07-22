import { normalizeCastName } from "@/lib/normalize";

export type HeavenFileKind =
  | "HEAVEN_SHOP"
  | "PAGE_ACCESS"
  | "DIARY_POSTS"
  | "MY_GIRL"
  | "MITENE_SENT"
  | "OKINI_TALK_SENT"
  | "DIARY_NOTICE"
  | "UNKNOWN";

export type HeavenValueKind = "DAILY_EVENT" | "SNAPSHOT" | "UNKNOWN";
export type HeavenRawValueStatus = "VALUE" | "BLANK" | "NOT_APPLICABLE";
export type HeavenMetricType = "PAGE_ACCESS" | "DIARY_POSTS" | "MY_GIRL" | "MITENE_SENT" | "OKINI_TALK_SENT" | "ATTENDANCE_NOTICE" | "DIARY_NOTICE" | "UNKNOWN";

export const HEAVEN_METRIC_VALUE_KIND: Record<Exclude<HeavenMetricType, "UNKNOWN">, Exclude<HeavenValueKind, "UNKNOWN">> = {
  PAGE_ACCESS: "DAILY_EVENT",
  DIARY_POSTS: "DAILY_EVENT",
  MY_GIRL: "SNAPSHOT",
  MITENE_SENT: "DAILY_EVENT",
  OKINI_TALK_SENT: "DAILY_EVENT",
  ATTENDANCE_NOTICE: "SNAPSHOT",
  DIARY_NOTICE: "SNAPSHOT",
};

export type HeavenParsedShopRow = {
  date: string;
  metricKey: string;
  rawValue: number | null;
  valueKind: HeavenValueKind;
  rawValueStatus: HeavenRawValueStatus;
  sourceColumn: string;
  sourceRowNumber: number;
};

export type HeavenParsedCastRow = {
  date: string;
  sourceCastName: string;
  normalizedSourceCastName: string;
  metricKey: string;
  rawValue: number | null;
  valueKind: HeavenValueKind;
  rawValueStatus: HeavenRawValueStatus;
  sourceColumn: string;
  sourceRowNumber: number;
};

export type HeavenParseOptions = {
  metricKeyHint?: string;
  metricHint?: HeavenMetricType;
  valueKindHint?: Exclude<HeavenValueKind, "UNKNOWN">;
};

export type HeavenParseResult = {
  kind: HeavenFileKind;
  classificationReason: string;
  encoding: "UTF-8-BOM" | "UTF-8";
  delimiter: ",";
  sourcePeriodFrom: string | null;
  sourcePeriodTo: string | null;
  metricType: HeavenMetricType;
  headers: string[];
  shopRows: HeavenParsedShopRow[];
  castRows: HeavenParsedCastRow[];
  summaryRows: Array<{ label: string; values: string[]; sourceRowNumber: number }>;
};

type CsvRow = string[];

export const SNAPSHOT_METRIC_KEYS = new Set(["my_girl", "diary_notice"]);

export function parseHeavenCsvText(text: string, options: HeavenParseOptions = {}): HeavenParseResult {
  const encoding = text.startsWith("\uFEFF") ? "UTF-8-BOM" : "UTF-8";
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const headers = rows[0] || [];
  const kind = detectHeavenFileKind(rows);
  const dateRows = rows.slice(1, 31).filter((row) => parseHeavenDate(row[0], monthFromHeader(headers[0] || "")) !== null);
  const period = dateRows.map((row) => parseHeavenDate(row[0], monthFromHeader(headers[0] || ""))).filter((value): value is string => value !== null);
  const summaryRows = rows.slice(1).flatMap((row, index) => isSummaryLabel(row[0]) ? [{ label: row[0], values: row.slice(1), sourceRowNumber: index + 2 }] : []);
  const metricType = options.metricHint || "UNKNOWN";
  const valueKind = options.valueKindHint || (metricType !== "UNKNOWN" ? HEAVEN_METRIC_VALUE_KIND[metricType] : options.metricKeyHint && SNAPSHOT_METRIC_KEYS.has(options.metricKeyHint) ? "SNAPSHOT" : "UNKNOWN");
  const metricKey = options.metricKeyHint || (metricType !== "UNKNOWN" ? metricType.toLowerCase() : "unknown");

  if (kind === "HEAVEN_SHOP") {
    return {
      kind,
      classificationReason: "店舗指標ヘッダー（アクセス総数等）を内容から検出しました。",
      encoding,
      delimiter: ",",
      sourcePeriodFrom: period[0] || null,
      sourcePeriodTo: period.at(-1) || null,
      metricType: "UNKNOWN",
      headers,
      summaryRows,
      shopRows: rows.slice(1, 31).flatMap((row, index) => {
        const date = parseHeavenDate(row[0], monthFromHeader(headers[0] || ""));
        if (!date) return [];
        return row.slice(1).flatMap((raw, columnIndex) => {
          const sourceColumn = headers[columnIndex + 1] || `COLUMN_${columnIndex + 1}`;
          return [{ date, metricKey: metricKeyFromColumn(sourceColumn), ...parseRawValue(raw), valueKind: "DAILY_EVENT" as const, sourceColumn, sourceRowNumber: index + 2 }];
        });
      }),
      castRows: [],
    };
  }

  const castShape = isCastMatrix(rows);
  return {
    kind: kind === "UNKNOWN" && castShape ? "UNKNOWN" : kind,
    classificationReason: castShape
      ? "女子横持ち構造は検出しましたが、列名がキャスト名だけで指標名を含まないため、内容だけでは指標種別を安全に判定できません。"
      : "既知のHeaven CSV構造を検出できませんでした。",
    encoding,
    delimiter: ",",
    sourcePeriodFrom: period[0] || null,
    sourcePeriodTo: period.at(-1) || null,
    metricType,
    headers,
    summaryRows,
    shopRows: [],
    castRows: rows.slice(1, 31).flatMap((row, index) => {
      const date = parseHeavenDate(row[0], monthFromHeader(headers[0] || ""));
      if (!date) return [];
      return row.slice(1).flatMap((raw, columnIndex) => {
        const sourceCastName = headers[columnIndex + 1] || `COLUMN_${columnIndex + 1}`;
        return [{ date, sourceCastName, normalizedSourceCastName: normalizeCastName(sourceCastName), metricKey, ...parseRawValue(raw), valueKind, sourceColumn: sourceCastName, sourceRowNumber: index + 2 }];
      });
    }),
  };
}

export function detectHeavenFileKind(rows: CsvRow[]): HeavenFileKind {
  const headers = rows[0] || [];
  if (headers.includes("アクセス総数") && headers.includes("アクション数_総数")) return "HEAVEN_SHOP";
  // All supplied girl files have the same month/name-only header. Returning
  // UNKNOWN is intentional: filenames are not a valid content discriminator.
  return "UNKNOWN";
}

function isCastMatrix(rows: CsvRow[]) {
  const headers = rows[0] || [];
  const monthHeader = monthFromHeader(headers[0] || "") !== null;
  const dateCount = rows.slice(1, 31).filter((row) => parseHeavenDate(row[0], monthFromHeader(headers[0] || "")) !== null).length;
  return monthHeader && headers.length >= 100 && dateCount >= 1 && headers.slice(1).every(Boolean);
}

function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === "\"") {
        if (text[index + 1] === "\"") { field += "\""; index += 1; } else quoted = false;
      } else field += char;
    } else if (char === "\"") quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function monthFromHeader(value: string) {
  const match = value.replace(/\n/g, "").match(/(\d{4})年\s*(\d{1,2})月/);
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

function parseHeavenDate(value: string | undefined, month: { year: number; month: number } | null) {
  if (!value || !month || !/^\d{1,2}\/\d{1,2}/.test(value)) return null;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(month.year, Number(match[1]) - 1, Number(match[2])));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseRawValue(raw: string) {
  if (raw === "---") return { rawValue: null, rawValueStatus: "NOT_APPLICABLE" as const };
  if (raw.trim() === "") return { rawValue: null, rawValueStatus: "BLANK" as const };
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? { rawValue: value, rawValueStatus: "VALUE" as const } : { rawValue: null, rawValueStatus: "BLANK" as const };
}

function metricKeyFromColumn(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_]+/gu, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function isSummaryLabel(value: string | undefined) {
  return value === "合計" || value === "今月" || value === "先月" || value === "前月" || value === "増減";
}
