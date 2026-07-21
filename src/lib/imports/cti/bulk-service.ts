import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { ImportBatchStatus, ImportDataType, ImportMode, MediaType } from "@/generated/prisma/client";
import { confirmCtiImport } from "@/lib/imports/cti/importer";
import { sortCtiBulkFiles } from "@/lib/imports/cti/bulk-order";
import type { CtiBulkFile, CtiBulkProcessResult, CtiBulkScan } from "@/lib/imports/cti/bulk-types";
import { createCtiPreview, summarizePreview } from "@/lib/imports/cti/service";
import type { CtiPreview } from "@/lib/imports/cti/types";
import { readPreview } from "@/lib/imports/storage";
import { prisma } from "@/lib/prisma";

const COMPLETED: ImportBatchStatus[] = [ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS];
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function ctiBulkDirectory(env: NodeJS.ProcessEnv = process.env) {
  return env.CTI_BULK_DIR?.trim() || null;
}

function validCompactDate(value: string) {
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

export function classifyCtiBulkFilename(filename: string) {
  const normalized = filename.normalize("NFC");
  const match = normalized.match(/^女子別レポート_(\d{8})\.xlsx$/);
  if (!match) return { targetDate: null, error: "対象のCTI女子別レポートではありません。" };
  const targetDate = validCompactDate(match[1]);
  return targetDate ? { targetDate, error: null } : { targetDate: null, error: "ファイル名の対象日が不正です。" };
}

function fileKey(filename: string) {
  return encodeURIComponent(filename);
}

function parseFileKey(key: string) {
  const filename = decodeURIComponent(key);
  if (!filename || path.basename(filename) !== filename) throw new Error("ファイル識別子が不正です。");
  return filename;
}

export async function inspectCtiConfiguredFile(directory: string, filename: string) {
  const root = await realpath(path.resolve(directory));
  const candidate = path.join(root, filename);
  const stat = await lstat(candidate);
  if (stat.isSymbolicLink()) throw new Error("シンボリックリンクは読み取れません。");
  if (!stat.isFile()) throw new Error("通常ファイルではありません。");
  const resolved = await realpath(candidate);
  if (path.dirname(resolved) !== root || !resolved.startsWith(`${root}${path.sep}`)) throw new Error("許可フォルダ外のファイルは読み取れません。");
  const buffer = await readFile(resolved);
  return { buffer, size: stat.size, sha256: createHash("sha256").update(buffer).digest("hex") };
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
}

export function inspectCtiBulkPreviewSafety(preview: CtiPreview, correctionBatchIds: string[] = []) {
  const summary = summarizePreview(preview);
  const rows = preview.sheets.flatMap((sheet) => sheet.rows);
  const ambiguousCount = rows.filter((row) => row.resolutionStatus === "AMBIGUOUS").length;
  const unmatchedCount = rows.filter((row) => row.resolutionStatus === "UNMATCHED").length;
  const importableCount = rows.filter((row) => row.castId && row.metrics && row.resolutionStatus !== "SKIPPED" && !row.issues.some((issue) => issue.level === "ERROR")).length;
  const fatalGlobalIssue = preview.globalIssues.some((issue) => issue.level === "ERROR");
  return {
    ...summary,
    ambiguousCount,
    unmatchedCount,
    importableCount,
    autoConfirmSafe: preview.importMode === ImportMode.DAILY && preview.targetFrom === preview.targetTo
      && !fatalGlobalIssue && summary.errorCount === 0 && summary.pendingCount === 0
      && ambiguousCount === 0 && unmatchedCount === 0 && importableCount > 0 && correctionBatchIds.length === 0,
  };
}

function batchBulkCounts(batch: { metadata: unknown; pendingCount: number; warningCount: number; errorCount: number }) {
  const bulk = metadataObject(metadataObject(batch.metadata).ctiBulk);
  return {
    pendingCount: batch.pendingCount,
    warningCount: batch.warningCount,
    errorCount: batch.errorCount,
    ambiguousCount: typeof bulk.ambiguousCount === "number" ? bulk.ambiguousCount : 0,
    unmatchedCount: typeof bulk.unmatchedCount === "number" ? bulk.unmatchedCount : batch.pendingCount,
    importableCount: typeof bulk.importableCount === "number" ? bulk.importableCount : 0,
    autoConfirmSafe: bulk.autoConfirmSafe === true,
  };
}

export function selectCtiBulkExistingBatch<T extends { status: ImportBatchStatus }>(sameHash: T[]) {
  return { completedDuplicate: sameHash.find((batch) => COMPLETED.includes(batch.status)) || null, existingBatch: sameHash[0] || null };
}

async function configuredImportSource() {
  const sources = await prisma.importSource.findMany({
    where: { isActive: true, mediaType: MediaType.CTI, dataType: ImportDataType.CTI_CAST_REPORT },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  if (sources.length !== 1) return null;
  return sources[0];
}

async function listFolder(directory: string | null) {
  if (!directory) return { entries: [] as Array<{ filename: string; size: number; sha256: string | null; error: string | null }>, error: "CTI_BULK_DIRが設定されていません。" };
  try {
    const root = await realpath(path.resolve(directory));
    const dirEntries = await readdir(root, { withFileTypes: true });
    const entries = await Promise.all(dirEntries.map(async (entry) => {
      if (entry.isSymbolicLink()) return { filename: entry.name, size: 0, sha256: null, error: "シンボリックリンクは対象外です。" };
      if (!entry.isFile()) return null;
      try {
        const inspected = await inspectCtiConfiguredFile(directory, entry.name);
        return { filename: entry.name, size: inspected.size, sha256: inspected.sha256, error: null };
      } catch (error) {
        return { filename: entry.name, size: 0, sha256: null, error: error instanceof Error ? error.message : "読み取りに失敗しました。" };
      }
    }));
    return { entries: entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)), error: null };
  } catch (error) {
    return { entries: [], error: error instanceof Error ? error.message : "フォルダを読み取れません。" };
  }
}

export async function scanCtiBulkFolder(directory = ctiBulkDirectory()): Promise<CtiBulkScan> {
  const [{ entries, error: folderError }, source] = await Promise.all([listFolder(directory), configuredImportSource()]);
  const inspected = entries.map((entry) => ({ entry, classification: classifyCtiBulkFilename(entry.filename) }));
  const batches = await prisma.importBatch.findMany({
    where: { dataType: ImportDataType.CTI_CAST_REPORT }, orderBy: { createdAt: "desc" },
  });
  const files: CtiBulkFile[] = inspected.map(({ entry, classification }) => {
    const sameHash = entry.sha256 ? batches.filter((batch) => batch.fileHash === entry.sha256) : [];
    const { completedDuplicate, existingBatch } = selectCtiBulkExistingBatch(sameHash);
    const correctionBatches = classification.targetDate ? batches.filter((batch) => batch.fileHash !== entry.sha256
      && batch.targetFrom.toISOString().slice(0, 10) === classification.targetDate
      && batch.targetTo.toISOString().slice(0, 10) === classification.targetDate) : [];
    const unsupported = !classification.targetDate;
    const invalidError = entry.error || classification.error || (!source ? "有効なCTI取込元が1件だけ必要です。" : null);
    const batch = completedDuplicate || existingBatch;
    const counts = batch ? batchBulkCounts(batch) : { pendingCount: 0, warningCount: 0, errorCount: 0, ambiguousCount: 0, unmatchedCount: 0, importableCount: 0, autoConfirmSafe: false };
    const state = unsupported ? "UNSUPPORTED" : invalidError ? "INVALID" : completedDuplicate ? "SKIPPED_DUPLICATE"
      : existingBatch ? "EXISTING_BATCH" : correctionBatches.length ? "CORRECTION_CANDIDATE" : "NEW";
    return {
      key: fileKey(entry.filename), filename: entry.filename, targetDate: classification.targetDate, size: entry.size, sha256: entry.sha256,
      state, processStatus: batch?.status || "未処理", batchId: batch?.id || null, ...counts,
      correctionBatchIds: correctionBatches.map((candidate) => candidate.id), error: invalidError,
      canProcess: !unsupported && !invalidError && !completedDuplicate && (!existingBatch || existingBatch.status === ImportBatchStatus.FAILED),
    };
  });
  return {
    scannedAt: new Date().toISOString(),
    folder: { configured: Boolean(directory), fileCount: entries.length, targetFileCount: files.filter((file) => file.targetDate).length, error: folderError },
    importSource: source,
    files: sortCtiBulkFiles(files),
  };
}

async function getProcessContext(key: string) {
  const directory = ctiBulkDirectory();
  if (!directory) throw new Error("CTI_BULK_DIRが設定されていません。");
  const filename = parseFileKey(key);
  const classification = classifyCtiBulkFilename(filename);
  if (!classification.targetDate || classification.error) throw new Error(classification.error || "対象外ファイルです。");
  const [inspected, source] = await Promise.all([inspectCtiConfiguredFile(directory, filename), configuredImportSource()]);
  if (!source) throw new Error("有効なCTI取込元が1件だけ必要です。");
  const sameHash = await prisma.importBatch.findMany({ where: { fileHash: inspected.sha256, dataType: ImportDataType.CTI_CAST_REPORT }, orderBy: { createdAt: "desc" } });
  const { completedDuplicate, existingBatch } = selectCtiBulkExistingBatch(sameHash);
  const date = new Date(`${classification.targetDate}T00:00:00Z`);
  const correctionBatches = await prisma.importBatch.findMany({
    where: { fileHash: { not: inspected.sha256 }, dataType: ImportDataType.CTI_CAST_REPORT, targetFrom: date, targetTo: date }, select: { id: true },
  });
  return { key, filename, classification, inspected, source, completedDuplicate, existingBatch, correctionBatchIds: correctionBatches.map((batch) => batch.id) };
}

type ProcessCtiBulkInput = { key: string; uploadedByUserId: string; action: "VALIDATE" | "CONFIRM_SAFE"; retryFailed?: boolean };
const processLocks = new Map<string, Promise<CtiBulkProcessResult>>();

async function processCtiBulkFileUnlocked(input: ProcessCtiBulkInput): Promise<CtiBulkProcessResult> {
  const context = await getProcessContext(input.key);
  if (context.completedDuplicate) return {
    key: input.key, outcome: "SKIPPED_DUPLICATE", batchId: context.completedDuplicate.id, status: context.completedDuplicate.status,
    ...batchBulkCounts(context.completedDuplicate), message: "完了済み同一SHA-256のためスキップしました。",
  };
  if (context.existingBatch && !(context.existingBatch.status === ImportBatchStatus.FAILED && input.retryFailed)) {
    let counts = batchBulkCounts(context.existingBatch);
    if (!metadataObject(context.existingBatch.metadata).ctiBulk) {
      try { counts = inspectCtiBulkPreviewSafety(await readPreview<CtiPreview>(context.existingBatch.id), context.correctionBatchIds); } catch { /* 既存バッチ件数を表示 */ }
    }
    if (input.action === "CONFIRM_SAFE" && counts.autoConfirmSafe && context.existingBatch.status === ImportBatchStatus.PREVIEW_READY) {
      await confirmCtiImport(context.existingBatch.id, false);
      const confirmed = await prisma.importBatch.findUniqueOrThrow({ where: { id: context.existingBatch.id }, select: { status: true } });
      return { key: input.key, outcome: "CONFIRMED", batchId: context.existingBatch.id, status: confirmed.status, ...counts, message: "安全条件を満たした既存プレビューを確定しました。" };
    }
    return { key: input.key, outcome: counts.autoConfirmSafe ? "EXISTING_BATCH" : "NEEDS_REVIEW", batchId: context.existingBatch.id, status: context.existingBatch.status, ...counts, message: "同一SHA-256の既存バッチを使用します。" };
  }

  const file = new File([new Uint8Array(context.inspected.buffer)], context.filename, { type: XLSX_MIME });
  const result = await createCtiPreview({
    file, importSourceId: context.source.id, importMode: ImportMode.DAILY,
    targetFrom: context.classification.targetDate, targetTo: context.classification.targetDate,
    uploadedByUserId: input.uploadedByUserId,
    metadata: { ctiBulk: { sourceFilename: context.filename, sourceSha256: context.inspected.sha256 } },
    additionalGlobalIssues: context.correctionBatchIds.length ? [{
      code: "BULK_CORRECTION_CANDIDATE", level: "WARNING", message: "同日に別SHA-256の既存CTIバッチがあります。自動上書きせず確認が必要です。",
      rawData: { batchIds: context.correctionBatchIds },
    }] : [],
  });
  const preview = await readPreview<CtiPreview>(result.batchId);
  const safety = inspectCtiBulkPreviewSafety(preview, context.correctionBatchIds);
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: result.batchId } });
  const metadata = metadataObject(batch.metadata);
  await prisma.importBatch.update({ where: { id: result.batchId }, data: { metadata: {
    ...metadata,
    ctiBulk: { ...metadataObject(metadata.ctiBulk), ambiguousCount: safety.ambiguousCount, unmatchedCount: safety.unmatchedCount, importableCount: safety.importableCount, autoConfirmSafe: safety.autoConfirmSafe, correctionBatchIds: context.correctionBatchIds },
  } } });
  if (input.action === "CONFIRM_SAFE" && safety.autoConfirmSafe && result.status === ImportBatchStatus.PREVIEW_READY) {
    await confirmCtiImport(result.batchId, false);
    const confirmed = await prisma.importBatch.findUniqueOrThrow({ where: { id: result.batchId }, select: { status: true } });
    return { key: input.key, outcome: "CONFIRMED", batchId: result.batchId, status: confirmed.status, ...safety, message: "検証成功後、安全条件を満たしたため確定しました。" };
  }
  return {
    key: input.key, outcome: safety.autoConfirmSafe ? "VALIDATED" : "NEEDS_REVIEW", batchId: result.batchId, status: result.status,
    ...safety, message: safety.autoConfirmSafe ? "検証が完了し、自動確定可能です。" : "検証が完了しました。要確認のため確定していません。",
  };
}

export function processCtiBulkFile(input: ProcessCtiBulkInput): Promise<CtiBulkProcessResult> {
  const active = processLocks.get(input.key);
  if (active) return active;
  const pending = processCtiBulkFileUnlocked(input).finally(() => {
    if (processLocks.get(input.key) === pending) processLocks.delete(input.key);
  });
  processLocks.set(input.key, pending);
  return pending;
}
