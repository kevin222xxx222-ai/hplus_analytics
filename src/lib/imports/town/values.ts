export function parseTownInteger(value: string): number | null {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || ["-", "―", "—"].includes(normalized)) return null;
  if (!/^[+-]?[\d,]+$/.test(normalized)) return null;
  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseTownDecimal(value: string): number | null {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || ["-", "―", "—"].includes(normalized)) return null;
  if (!/^[+-]?[\d,]+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseTownPercent(value: string): number | null {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || ["-", "―", "—"].includes(normalized)) return null;
  if (!/^[+-]?[\d,]+(?:\.\d+)?%$/.test(normalized)) return null;
  const parsed = Number(normalized.slice(0, -1).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed / 100 : null;
}

export function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

export function parseJapaneseDate(value: string): string | null {
  const normalized = value.normalize("NFKC").trim();
  const match = normalized.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\([^)]*\))?$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

export function parsePeriodTitle(value: string) {
  const match = value.normalize("NFKC").trim().match(/^(\d{4}年\d{1,2}月\d{1,2}日)\s*[~〜～]\s*(\d{4}年\d{1,2}月\d{1,2}日)$/);
  if (!match) return null;
  const from = parseJapaneseDate(match[1]);
  const to = parseJapaneseDate(match[2]);
  return from && to ? { from, to } : null;
}

