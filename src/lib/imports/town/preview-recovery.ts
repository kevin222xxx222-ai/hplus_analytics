import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { ImportBatchStatus, ImportErrorLevel, StoreCode } from "@/generated/prisma/client";
import { formatDateOnly } from "@/lib/date";
import { getPreviewPath, getStoredImportPath, readImportFile, writePreview } from "@/lib/imports/storage";
import { parseTownCsv } from "@/lib/imports/town/parser";
import { resolveTownPreviewRows } from "@/lib/imports/town/resolver";
import { summarizeTownPreview, TOWN_EXTERNAL_STORE_IDS } from "@/lib/imports/town/service";
import type { TownImportDataType, TownPreview } from "@/lib/imports/town/types";
import { prisma } from "@/lib/prisma";

const TOWN_TYPES: TownImportDataType[] = ["TOWN_STORE", "TOWN_CAST", "TOWN_URL", "TOWN_LANDING"];

type RecoveryIssue = { issue: { code: string; level: ImportErrorLevel; message: string; columnName?: string; rawData?: unknown }; rowNumber: number | null };

function issueRecords(preview: TownPreview): RecoveryIssue[] {
  return [
    ...preview.globalIssues.map((issue) => ({ issue, rowNumber: null })),
    ...preview.rows.flatMap((row) => row.issues.map((issue) => ({ issue, rowNumber: row.sourceRowNumber }))),
  ];
}

async function exists(path: string) {
  try { await access(path); return true; } catch { return false; }
}

export type MissingTownPreviewReport = {
  batchId: string;
  dataType: string;
  storeName: string | null;
  originalFilename: string;
  status: string;
  sourceExists: boolean;
  previewExists: boolean;
  shaMatches: boolean;
  recoverable: boolean;
  reason?: string;
};

export async function listMissingTownPreviews(db = prisma): Promise<MissingTownPreviewReport[]> {
  const batches = await db.importBatch.findMany({
    where: { dataType: { in: TOWN_TYPES } },
    include: { importSource: { include: { store: true } } },
    orderBy: { createdAt: "asc" },
  });
  const reports: MissingTownPreviewReport[] = [];
  for (const batch of batches) {
    const sourcePath = getStoredImportPath(batch.storagePath);
    const previewPath = getPreviewPath(batch.id);
    const sourceExists = await exists(sourcePath);
    const previewExists = await exists(previewPath);
    if (previewExists) continue;
    let shaMatches = false;
    if (sourceExists) {
      const buffer = await readImportFile(batch.storagePath);
      shaMatches = createHash("sha256").update(buffer).digest("hex") === batch.fileHash;
    }
    const reason = !sourceExists ? "元ファイルがありません。" : !shaMatches ? "元ファイルのSHA-256がImportBatchと一致しません。" : undefined;
    reports.push({ batchId: batch.id, dataType: batch.dataType, storeName: batch.importSource.store?.shortName || null, originalFilename: batch.originalFilename, status: batch.status, sourceExists, previewExists, shaMatches, recoverable: sourceExists && shaMatches, reason });
  }
  return reports;
}

export type PreviewRecoveryResult = {
  batchId: string;
  before: { pendingCount: number; skippedCount: number; warningCount: number; errorCount: number; status: ImportBatchStatus; insertedCount: number; updatedCount: number };
  after: { pendingCount: number; skippedCount: number; warningCount: number; errorCount: number; status: ImportBatchStatus; insertedCount: number; updatedCount: number };
  sourceSha256: string;
  previewPath: string;
  existingFacts: { store: number; cast: number; url: number; landing: number };
};

export async function recoverTownPreview(batchId: string, db = prisma): Promise<PreviewRecoveryResult> {
  const batch = await db.importBatch.findUnique({ where: { id: batchId }, include: { importSource: { include: { store: true } }, errors: true } });
  if (!batch || !TOWN_TYPES.includes(batch.dataType as TownImportDataType)) throw new Error("対象Town ImportBatchが見つかりません。");
  const sourcePath = getStoredImportPath(batch.storagePath);
  if (await exists(getPreviewPath(batch.id))) throw new Error("preview.jsonは既に存在します。復旧処理は実行しません。");
  if (!await exists(sourcePath)) throw new Error("元CSVが存在しません。復旧を停止しました。");
  const buffer = await readImportFile(batch.storagePath);
  const sourceSha256 = createHash("sha256").update(buffer).digest("hex");
  if (sourceSha256 !== batch.fileHash) throw new Error("元CSVのSHA-256がImportBatch記録と一致しません。復旧を停止しました。");
  if (!batch.importSource.store) throw new Error("ImportSourceの店舗がありません。復旧を停止しました。");
  const recordedMetadata = batch.metadata && typeof batch.metadata === "object" && !Array.isArray(batch.metadata) ? batch.metadata as Record<string, unknown> : {};
  if (recordedMetadata.selectedStoreId && recordedMetadata.selectedStoreId !== batch.importSource.store.id) throw new Error("ImportBatchの記録店舗とImportSource店舗が一致しません。復旧を停止しました。");
  const targetFrom = formatDateOnly(batch.targetFrom); const targetTo = formatDateOnly(batch.targetTo);
  let preview = parseTownCsv({
    buffer, batchId: batch.id, runId: batch.runId, dataType: batch.dataType as TownImportDataType,
    storeId: batch.importSource.store.id, storeCode: batch.importSource.store.code as StoreCode, storeName: batch.importSource.store.shortName,
    targetFrom, targetTo, expectedExternalStoreId: TOWN_EXTERNAL_STORE_IDS[batch.importSource.store.code as StoreCode] || null,
  });
  const fatalCodes = new Set(["HEADER_NOT_FOUND", "FILE_TYPE_MISMATCH", "TARGET_PERIOD_MISMATCH", "MULTI_DAY_WITHOUT_DATE_COLUMN"]);
  const fatal = preview.globalIssues.find((issue) => fatalCodes.has(issue.code));
  if (fatal) throw new Error(`保存ファイルの検証に失敗しました: ${fatal.code}`);
  preview = { ...preview, rows: await resolveTownPreviewRows(preview.rows, batch.importSource.store.id, batch.targetTo) };
  const summary = summarizeTownPreview(preview);
  const before = { pendingCount: batch.pendingCount, skippedCount: batch.skippedCount, warningCount: batch.warningCount, errorCount: batch.errorCount, status: batch.status, insertedCount: batch.insertedCount, updatedCount: batch.updatedCount };
  const factsBefore = await Promise.all([
    db.townStoreDaily.count({ where: { importBatchId: batch.id } }),
    db.townCastDaily.count({ where: { importBatchId: batch.id } }),
    db.townUrlDaily.count({ where: { importBatchId: batch.id } }),
    db.townLandingDaily.count({ where: { importBatchId: batch.id } }),
  ]);
  const metadata = batch.metadata && typeof batch.metadata === "object" && !Array.isArray(batch.metadata) ? JSON.parse(JSON.stringify(batch.metadata)) as Record<string, unknown> : {};
  const events = Array.isArray(metadata.importEvents) ? metadata.importEvents : [];
  // The completed state is deliberately preserved; recovery only refreshes diagnostics.
  const after = { pendingCount: summary.pendingCount, skippedCount: summary.skippedCount, warningCount: summary.warningCount, errorCount: summary.errorCount, status: batch.status, insertedCount: batch.insertedCount, updatedCount: batch.updatedCount };
  await writePreview(batch.id, preview);
  try {
    await db.$transaction(async (tx) => {
      await tx.importError.deleteMany({ where: { importBatchId: batch.id } });
      const records = issueRecords(preview);
      if (records.length) await tx.importError.createMany({ data: records.map(({ issue, rowNumber }) => ({ runId: batch.runId, importSourceId: batch.importSourceId, importBatchId: batch.id, fileName: batch.originalFilename, fileHash: batch.fileHash, rowNumber, columnName: issue.columnName, errorCode: issue.code, level: issue.level, message: issue.message, rawData: issue.rawData === undefined ? undefined : JSON.parse(JSON.stringify(issue.rawData)) })) });
      await tx.importBatch.update({ where: { id: batch.id }, data: { status: batch.status, pendingCount: summary.pendingCount, skippedCount: summary.skippedCount, warningCount: summary.warningCount, errorCount: summary.errorCount, metadata: { ...metadata, importEvents: [...events, { type: "PREVIEW_RECOVERY", at: new Date().toISOString(), batchId: batch.id, sourceSha256 }] } } });
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 });
  } catch (error) {
    // The batch had no preview before recovery. Remove the newly staged diagnostic on DB failure.
    try { const { unlink } = await import("node:fs/promises"); await unlink(getPreviewPath(batch.id)); } catch { /* best effort */ }
    throw error;
  }
  return { batchId: batch.id, before, after, sourceSha256, previewPath: getPreviewPath(batch.id), existingFacts: { store: factsBefore[0], cast: factsBefore[1], url: factsBefore[2], landing: factsBefore[3] } };
}
