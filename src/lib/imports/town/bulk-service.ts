import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { ImportBatchStatus, ImportDataType, MediaType, StoreCode } from "@/generated/prisma/client";
import { readPreview } from "@/lib/imports/storage";
import { confirmTownImport } from "@/lib/imports/town/importer";
import { sortTownBulkFiles } from "@/lib/imports/town/bulk-order";
import type { TownBulkFile, TownBulkProcessResult, TownBulkScan, TownBulkStoreKey } from "@/lib/imports/town/bulk-types";
import { createTownPreview, summarizeTownPreview } from "@/lib/imports/town/service";
import type { TownImportDataType, TownPreview } from "@/lib/imports/town/types";
import { prisma } from "@/lib/prisma";

export type FolderConfig = { folderKey: TownBulkStoreKey; storeCode: StoreCode; storeName: string; directory: string | null };

const COMPLETED: ImportBatchStatus[] = [ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS];
const DATA_TYPE_PREFIXES: Array<[string, TownImportDataType]> = [
  ["dto.jp-shop-", ImportDataType.TOWN_STORE],
  ["dto.jp-gal-", ImportDataType.TOWN_CAST],
  ["dto.jp-url-", ImportDataType.TOWN_URL],
  ["dto.jp-lp-", ImportDataType.TOWN_LANDING],
];

export function townBulkFolders(env: NodeJS.ProcessEnv = process.env): FolderConfig[] {
  return [
    { folderKey: "KASUKABE", storeCode: StoreCode.KASUKABE, storeName: "春日部", directory: env.TOWN_BULK_KASUKABE_DIR?.trim() || null },
    { folderKey: "KOSHIGAYA", storeCode: StoreCode.KOSHIGAYA, storeName: "越谷", directory: env.TOWN_BULK_KOSHIGAYA_DIR?.trim() || null },
  ];
}

function validCompactDate(value: string) {
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

export function classifyTownBulkFilename(filename: string) {
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".csv")) return { dataType: null, targetFrom: null, targetTo: null, error: "CSV以外は対象外です。" };
  const dataType = DATA_TYPE_PREFIXES.find(([prefix]) => lower.startsWith(prefix))?.[1] || null;
  if (!dataType) return { dataType: null, targetFrom: null, targetTo: null, error: "対応するTownファイル種別ではありません。" };
  const period = filename.match(/(\d{8})_to_(\d{8})/i);
  if (!period) return { dataType, targetFrom: null, targetTo: null, error: "ファイル名から対象期間を判定できません。" };
  const targetFrom = validCompactDate(period[1]);
  const targetTo = validCompactDate(period[2]);
  if (!targetFrom || !targetTo || targetFrom > targetTo) return { dataType, targetFrom, targetTo, error: "ファイル名の対象期間が不正です。" };
  if (dataType !== ImportDataType.TOWN_STORE && targetFrom !== targetTo) {
    return { dataType, targetFrom, targetTo, error: "女子・URL・LPの複数日ファイルは一括取込できません。" };
  }
  return { dataType, targetFrom, targetTo, error: null };
}

function fileKey(folderKey: TownBulkStoreKey, filename: string) {
  return `${folderKey}:${encodeURIComponent(filename)}`;
}

function parseFileKey(key: string) {
  const separator = key.indexOf(":");
  if (separator < 1) throw new Error("ファイル識別子が不正です。");
  const folderKey = key.slice(0, separator) as TownBulkStoreKey;
  const filename = decodeURIComponent(key.slice(separator + 1));
  if (!(["KASUKABE", "KOSHIGAYA"] as string[]).includes(folderKey) || !filename || path.basename(filename) !== filename) {
    throw new Error("ファイル識別子が不正です。");
  }
  return { folderKey, filename };
}

async function hashBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function inspectConfiguredFile(config: FolderConfig, filename: string) {
  if (!config.directory) throw new Error(`${config.storeName}の一括取込フォルダが設定されていません。`);
  const configuredRoot = path.resolve(config.directory);
  const root = await realpath(configuredRoot);
  const candidate = path.join(root, filename);
  const stat = await lstat(candidate);
  if (stat.isSymbolicLink()) throw new Error("シンボリックリンクは読み取れません。");
  if (!stat.isFile()) throw new Error("通常ファイルではありません。");
  const resolved = await realpath(candidate);
  if (path.dirname(resolved) !== root || !resolved.startsWith(`${root}${path.sep}`)) throw new Error("許可フォルダ外のファイルは読み取れません。");
  const buffer = await readFile(resolved);
  return { buffer, size: stat.size, sha256: await hashBuffer(buffer) };
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
}

export function inspectTownBulkPreviewSafety(preview: TownPreview, correctionBatchIds: string[] = []) {
  const summary = summarizeTownPreview(preview);
  const unresolvedRows = preview.rows.filter((row) => row.kind !== "STORE" && (row.resolutionStatus === "UNMATCHED" || row.resolutionStatus === "AMBIGUOUS"));
  const ambiguousCount = unresolvedRows.filter((row) => row.resolutionStatus === "AMBIGUOUS").length;
  const unmatchedCount = unresolvedRows.filter((row) => row.resolutionStatus === "UNMATCHED").length;
  const fatalGlobalIssue = preview.globalIssues.some((issue) => issue.level === "ERROR");
  return {
    ...summary,
    ambiguousCount,
    unmatchedCount,
    autoConfirmSafe: !fatalGlobalIssue && summary.errorCount === 0 && ambiguousCount === 0 && unmatchedCount === 0 && correctionBatchIds.length === 0,
  };
}

function batchBulkCounts(batch: { metadata: unknown; pendingCount: number; warningCount: number; errorCount: number }) {
  const bulk = metadataObject(metadataObject(batch.metadata).townBulk);
  return {
    pendingCount: batch.pendingCount,
    warningCount: batch.warningCount,
    errorCount: batch.errorCount,
    ambiguousCount: typeof bulk.ambiguousCount === "number" ? bulk.ambiguousCount : 0,
    unmatchedCount: typeof bulk.unmatchedCount === "number" ? bulk.unmatchedCount : batch.pendingCount,
    autoConfirmSafe: bulk.autoConfirmSafe === true,
  };
}

export function selectTownBulkExistingBatch<T extends { status: ImportBatchStatus }>(sameHash: T[]) {
  return {
    completedDuplicate: sameHash.find((batch) => COMPLETED.includes(batch.status)) || null,
    existingBatch: sameHash[0] || null,
  };
}

async function listFolder(config: FolderConfig) {
  if (!config.directory) return { config, entries: [] as Array<{ filename: string; size: number; sha256: string | null; error: string | null }>, error: "環境変数が未設定です。" };
  try {
    const root = await realpath(path.resolve(config.directory));
    const dirEntries = await readdir(root, { withFileTypes: true });
    const entries = await Promise.all(dirEntries.map(async (entry) => {
      if (entry.isSymbolicLink()) return { filename: entry.name, size: 0, sha256: null, error: "シンボリックリンクは対象外です。" };
      if (!entry.isFile()) return null;
      try {
        const inspected = await inspectConfiguredFile(config, entry.name);
        return { filename: entry.name, size: inspected.size, sha256: inspected.sha256, error: null };
      } catch (error) {
        return { filename: entry.name, size: 0, sha256: null, error: error instanceof Error ? error.message : "読み取りに失敗しました。" };
      }
    }));
    return { config, entries: entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)), error: null };
  } catch (error) {
    return { config, entries: [], error: error instanceof Error ? error.message : "フォルダを読み取れません。" };
  }
}

export async function scanTownBulkFolders(configs: FolderConfig[] = townBulkFolders()): Promise<TownBulkScan> {
  const folders = await Promise.all(configs.map(listFolder));
  const inspected = folders.flatMap(({ config, entries }) => entries.map((entry) => ({ config, entry, classification: classifyTownBulkFilename(entry.filename) })));
  const hashes = inspected.flatMap(({ entry }) => entry.sha256 ? [entry.sha256] : []);
  const supportedTypes = DATA_TYPE_PREFIXES.map(([, type]) => type);
  const [batches, sources] = await Promise.all([
    hashes.length ? prisma.importBatch.findMany({
      where: { dataType: { in: supportedTypes } },
      include: { importSource: { include: { store: true } } },
      orderBy: { createdAt: "desc" },
    }) : [],
    prisma.importSource.findMany({
      where: { isActive: true, mediaType: MediaType.TOWN, dataType: { in: supportedTypes }, store: { code: { in: configs.map((config) => config.storeCode) } } },
      include: { store: true },
    }),
  ]);
  const sourceKeys = new Set(sources.flatMap((source) => source.store ? [`${source.store.code}:${source.dataType}`] : []));

  const files: TownBulkFile[] = inspected.map(({ config, entry, classification }) => {
    const sameHash = entry.sha256 ? batches.filter((batch) => batch.fileHash === entry.sha256) : [];
    const { completedDuplicate, existingBatch } = selectTownBulkExistingBatch(sameHash);
    const correctionBatches = classification.dataType && classification.targetFrom && classification.targetTo
      ? batches.filter((batch) => batch.fileHash !== entry.sha256 && batch.dataType === classification.dataType
        && batch.importSource.store?.code === config.storeCode
        && batch.targetFrom.toISOString().slice(0, 10) === classification.targetFrom
        && batch.targetTo.toISOString().slice(0, 10) === classification.targetTo)
      : [];
    const unsupported = !classification.dataType;
    const missingSource = classification.dataType && !sourceKeys.has(`${config.storeCode}:${classification.dataType}`);
    const invalidError = entry.error || classification.error || (missingSource ? "店舗・種別に対応する有効な取込元がありません。" : null);
    const batch = completedDuplicate || existingBatch;
    const counts = batch ? batchBulkCounts(batch) : { pendingCount: 0, warningCount: 0, errorCount: 0, ambiguousCount: 0, unmatchedCount: 0, autoConfirmSafe: false };
    const state = unsupported ? "UNSUPPORTED"
      : invalidError ? "INVALID"
      : completedDuplicate ? "SKIPPED_DUPLICATE"
      : existingBatch ? "EXISTING_BATCH"
      : correctionBatches.length ? "CORRECTION_CANDIDATE"
      : "NEW";
    return {
      key: fileKey(config.folderKey, entry.filename), folderKey: config.folderKey, storeName: config.storeName,
      filename: entry.filename, dataType: classification.dataType, targetFrom: classification.targetFrom, targetTo: classification.targetTo,
      size: entry.size, sha256: entry.sha256, state, processStatus: batch?.status || "未処理", batchId: batch?.id || null,
      ...counts, correctionBatchIds: correctionBatches.map((candidate) => candidate.id), error: invalidError,
      canProcess: !unsupported && !invalidError && !completedDuplicate && (!existingBatch || existingBatch.status === ImportBatchStatus.FAILED),
    };
  });

  return {
    scannedAt: new Date().toISOString(),
    folders: folders.map(({ config, entries, error }) => ({ folderKey: config.folderKey, storeName: config.storeName, configured: Boolean(config.directory), fileCount: entries.length, error })),
    files: sortTownBulkFiles(files),
  };
}

async function getProcessContext(key: string) {
  const parsed = parseFileKey(key);
  const config = townBulkFolders().find((folder) => folder.folderKey === parsed.folderKey);
  if (!config) throw new Error("許可フォルダではありません。");
  const classification = classifyTownBulkFilename(parsed.filename);
  if (!classification.dataType || classification.error || !classification.targetFrom || !classification.targetTo) throw new Error(classification.error || "対象外ファイルです。");
  const inspected = await inspectConfiguredFile(config, parsed.filename);
  const source = await prisma.importSource.findFirst({
    where: { isActive: true, mediaType: MediaType.TOWN, dataType: classification.dataType, store: { code: config.storeCode } },
    include: { store: true },
  });
  if (!source?.store) throw new Error("店舗・種別に対応する有効な取込元がありません。");
  const sameHash = await prisma.importBatch.findMany({ where: { fileHash: inspected.sha256, dataType: classification.dataType }, orderBy: { createdAt: "desc" } });
  const { completedDuplicate, existingBatch } = selectTownBulkExistingBatch(sameHash);
  const correctionBatches = await prisma.importBatch.findMany({
    where: {
      fileHash: { not: inspected.sha256 }, dataType: classification.dataType, importSource: { is: { storeId: source.store.id } },
      targetFrom: new Date(`${classification.targetFrom}T00:00:00Z`), targetTo: new Date(`${classification.targetTo}T00:00:00Z`),
    },
    select: { id: true },
  });
  return { key, filename: parsed.filename, config, classification, inspected, source, completedDuplicate, existingBatch, correctionBatchIds: correctionBatches.map((batch) => batch.id) };
}

export async function processTownBulkFile(input: { key: string; uploadedByUserId: string; action: "VALIDATE" | "CONFIRM_SAFE"; retryFailed?: boolean }): Promise<TownBulkProcessResult> {
  const context = await getProcessContext(input.key);
  if (context.completedDuplicate) return {
    key: input.key, outcome: "SKIPPED_DUPLICATE", batchId: context.completedDuplicate.id, status: context.completedDuplicate.status,
    pendingCount: context.completedDuplicate.pendingCount, warningCount: context.completedDuplicate.warningCount, errorCount: context.completedDuplicate.errorCount,
    ambiguousCount: 0, unmatchedCount: context.completedDuplicate.pendingCount, autoConfirmSafe: false, message: "完了済み同一SHA-256のためスキップしました。",
  };

  let batchId = context.existingBatch?.id || null;
  if (context.existingBatch && !(context.existingBatch.status === ImportBatchStatus.FAILED && input.retryFailed)) {
    const counts = batchBulkCounts(context.existingBatch);
    if (input.action === "CONFIRM_SAFE" && counts.autoConfirmSafe && context.existingBatch.status === ImportBatchStatus.PREVIEW_READY) {
      await confirmTownImport(context.existingBatch.id, false);
      const confirmed = await prisma.importBatch.findUniqueOrThrow({ where: { id: context.existingBatch.id }, select: { status: true } });
      return { key: input.key, outcome: "CONFIRMED", batchId: context.existingBatch.id, status: confirmed.status, ...counts, message: "安全条件を満たした既存プレビューを確定しました。" };
    }
    return { key: input.key, outcome: counts.autoConfirmSafe ? "EXISTING_BATCH" : "NEEDS_REVIEW", batchId, status: context.existingBatch.status, ...counts, message: "同一SHA-256の既存バッチを使用します。" };
  }

  const bytes = new Uint8Array(context.inspected.buffer);
  const file = new File([bytes], context.filename, { type: "text/csv" });
  const previewResult = await createTownPreview({
    file, importSourceId: context.source.id, storeId: context.source.store!.id, dataType: context.classification.dataType!,
    targetFrom: context.classification.targetFrom!, targetTo: context.classification.targetTo!, uploadedByUserId: input.uploadedByUserId,
    metadata: { townBulk: { folderKey: context.config.folderKey, sourceFilename: file.name, sourceSha256: context.inspected.sha256 } },
    additionalGlobalIssues: context.correctionBatchIds.length ? [{
      code: "BULK_CORRECTION_CANDIDATE", level: "WARNING", message: "同日・店舗・種別に別SHA-256の既存バッチがあります。自動上書きせず確認が必要です。",
      rawData: { batchIds: context.correctionBatchIds },
    }] : [],
  });
  batchId = previewResult.batchId;
  const preview = await readPreview<TownPreview>(batchId);
  const safety = inspectTownBulkPreviewSafety(preview, context.correctionBatchIds);
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  const metadata = metadataObject(batch.metadata);
  await prisma.importBatch.update({ where: { id: batchId }, data: { metadata: {
    ...metadata,
    townBulk: { ...metadataObject(metadata.townBulk), ambiguousCount: safety.ambiguousCount, unmatchedCount: safety.unmatchedCount, autoConfirmSafe: safety.autoConfirmSafe, correctionBatchIds: context.correctionBatchIds },
  } } });

  if (input.action === "CONFIRM_SAFE" && safety.autoConfirmSafe && previewResult.status === ImportBatchStatus.PREVIEW_READY) {
    await confirmTownImport(batchId, false);
    const confirmed = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, select: { status: true } });
    return { key: input.key, outcome: "CONFIRMED", batchId, status: confirmed.status, ...safety, message: "検証成功後、安全条件を満たしたため確定しました。" };
  }
  return {
    key: input.key, outcome: safety.autoConfirmSafe ? "VALIDATED" : "NEEDS_REVIEW", batchId, status: previewResult.status,
    ...safety, message: safety.autoConfirmSafe ? "検証が完了し、自動確定可能です。" : "検証が完了しました。要確認のため確定していません。",
  };
}
