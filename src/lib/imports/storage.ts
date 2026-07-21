import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function getUploadRoot() {
  const configured = process.env.UPLOAD_DIR;
  return configured ? path.resolve(/* turbopackIgnore: true */ configured) : path.join(process.cwd(), "data", "uploads");
}

function safePath(filename: string) {
  const root = getUploadRoot();
  const target = path.resolve(root, filename);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid storage path");
  return target;
}

export function getStoredWorkbookPath(batchId: string) {
  return safePath(`${batchId}.xlsx`);
}

export function getStoredImportPath(storagePath: string) {
  return safePath(storagePath);
}

export function getPreviewPath(batchId: string) {
  return safePath(`${batchId}.preview.json`);
}

export async function ensureUploadRoot() {
  await mkdir(getUploadRoot(), { recursive: true, mode: 0o700 });
}

export async function saveWorkbook(batchId: string, buffer: Buffer) {
  await ensureUploadRoot();
  const target = getStoredWorkbookPath(batchId);
  await writeFile(target, buffer, { flag: "wx", mode: 0o600 });
  return target;
}

export async function saveImportFile(batchId: string, extension: ".csv" | ".xlsx", buffer: Buffer) {
  await ensureUploadRoot();
  const storedFilename = `${batchId}${extension}`;
  const target = safePath(storedFilename);
  await writeFile(target, buffer, { flag: "wx", mode: 0o600 });
  return { target, storedFilename };
}

export async function writePreview<T>(batchId: string, preview: T) {
  await ensureUploadRoot();
  const target = getPreviewPath(batchId);
  const temporary = safePath(`${batchId}.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(preview), { mode: 0o600 });
  await rename(temporary, target);
}

export async function readPreview<T>(batchId: string): Promise<T> {
  return JSON.parse(await readFile(getPreviewPath(batchId), "utf8")) as T;
}

export async function readWorkbook(batchId: string) {
  return readFile(getStoredWorkbookPath(batchId));
}


export async function readImportFile(storagePath: string) {
  return readFile(getStoredImportPath(storagePath));
}
