import path from "node:path";

const ACCEPTED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
  "application/zip",
]);

const ACCEPTED_CSV_MIME_TYPES = new Set([
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "application/octet-stream",
]);

export function validateXlsxUpload(file: File, buffer: Buffer) {
  const maxMb = Number(process.env.MAX_UPLOAD_SIZE_MB || 20);
  if (!Number.isFinite(maxMb) || maxMb < 1 || maxMb > 200) throw new Error("MAX_UPLOAD_SIZE_MB must be between 1 and 200");
  if (file.size <= 0 || file.size > maxMb * 1024 * 1024) throw new Error(`ファイルサイズは${maxMb}MB以下にしてください。`);
  if (path.extname(path.basename(file.name)).toLowerCase() !== ".xlsx") throw new Error("XLSXファイルだけをアップロードできます。");
  if (file.type && !ACCEPTED_MIME_TYPES.has(file.type)) throw new Error("XLSXとして認識できないMIMEタイプです。");
  const zipMagic = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03, 0x05, 0x07].includes(buffer[2]) && [0x04, 0x06, 0x08].includes(buffer[3]);
  if (!zipMagic) throw new Error("ファイル実体が有効なXLSXではありません。");
}

export function validateCsvUpload(file: File, buffer: Buffer) {
  const maxMb = Number(process.env.MAX_UPLOAD_SIZE_MB || 20);
  if (!Number.isFinite(maxMb) || maxMb < 1 || maxMb > 200) throw new Error("MAX_UPLOAD_SIZE_MB must be between 1 and 200");
  if (file.size <= 0 || file.size > maxMb * 1024 * 1024) throw new Error(`ファイルサイズは${maxMb}MB以下にしてください。`);
  if (path.extname(path.basename(file.name)).toLowerCase() !== ".csv") throw new Error("CSVファイルだけをアップロードできます。");
  if (file.type && !ACCEPTED_CSV_MIME_TYPES.has(file.type)) throw new Error("CSVとして認識できないMIMEタイプです。");
  if (buffer.includes(0)) throw new Error("CSVにバイナリデータが含まれています。");
}

export function normalizeAppOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("APP_ORIGIN must be a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("APP_ORIGIN must use http or https.");
  return parsed.origin;
}

export function assertSameOrigin(request: Request, env: { APP_ORIGIN?: string } = process.env as { APP_ORIGIN?: string }) {
  const origin = request.headers.get("origin");
  const configuredOrigin = env.APP_ORIGIN?.trim();
  const expected = configuredOrigin ? normalizeAppOrigin(configuredOrigin) : new URL(request.url).origin;
  if (!origin) return;
  if (origin !== expected) throw new Error("Invalid request origin");
}
