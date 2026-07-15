export function cellScalar(value: unknown): unknown {
  if (value && typeof value === "object") {
    if ("result" in value) return cellScalar((value as { result?: unknown }).result);
    if ("text" in value) return (value as { text?: unknown }).text;
    if ("richText" in value) return (value as { richText?: Array<{ text?: string }> }).richText?.map((part) => part.text || "").join("");
  }
  return value;
}

export function normalizeHeader(value: unknown) {
  return String(cellScalar(value) ?? "")
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, "")
    .replace(/[()（）]/g, "")
    .trim();
}

export function normalizeSourceName(value: unknown) {
  return String(cellScalar(value) ?? "").normalize("NFKC").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
}

export function exclusionComparisonName(value: string) {
  return value.normalize("NFKC").replace(/[\s\u3000]+/g, "").replace(/＆/g, "&").trim();
}

export function parseInteger(value: unknown): number | null {
  const scalar = cellScalar(value);
  if (scalar === null || scalar === undefined || scalar === "") return null;
  if (typeof scalar === "number") return Number.isFinite(scalar) && Number.isInteger(scalar) ? scalar : null;
  const text = String(scalar).normalize("NFKC").trim();
  if (!text || /^[-―—ー]+$/.test(text)) return null;
  const cleaned = text.replace(/[￥¥円,\s]/g, "").replace(/%$/, "");
  if (!/^-?\d+$/.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isSafeInteger(number) ? number : null;
}

export function parseDurationMinutes(value: unknown, numberFormat?: string): number | null {
  const scalar = cellScalar(value);
  if (scalar === null || scalar === undefined || scalar === "") return null;
  if (scalar instanceof Date) return scalar.getUTCHours() * 60 + scalar.getUTCMinutes();
  if (typeof scalar === "number") {
    if (!Number.isFinite(scalar) || scalar < 0) return null;
    const formattedAsTime = Boolean(numberFormat && /[hms]/i.test(numberFormat.replace(/\[[^\]]*]/g, "")));
    if (formattedAsTime) return scalar <= 1 ? Math.round(scalar * 24 * 60) : null;
    // Operational CTI exports decimal hours in General-formatted numeric cells.
    return scalar <= 168 ? Math.round(scalar * 60) : null;
  }
  const text = String(scalar).normalize("NFKC").trim();
  if (!text || /^[-―—ー]+$/.test(text)) return null;
  const colon = text.match(/^(\d{1,3}):([0-5]\d)$/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const japanese = text.match(/^(?:(\d+)時間)?(?:(\d+)分)?$/);
  if (japanese && (japanese[1] || japanese[2])) return Number(japanese[1] || 0) * 60 + Number(japanese[2] || 0);
  const minutes = text.match(/^(\d+)分$/);
  return minutes ? Number(minutes[1]) : null;
}
