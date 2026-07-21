import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { ImportBatchStatus, ImportMode, MediaType, StoreCode } from "@/generated/prisma/client";
import { parseDateOnly } from "@/lib/date";
import { validateCsvUpload } from "@/lib/imports/security";
import { saveImportFile, writePreview } from "@/lib/imports/storage";
import { TOWN_DATA_TYPES } from "@/lib/imports/town/columns";
import { parseTownCsv } from "@/lib/imports/town/parser";
import { resolveTownPreviewRows } from "@/lib/imports/town/resolver";
import type { TownImportDataType, TownIssue, TownPreview } from "@/lib/imports/town/types";
import { prisma } from "@/lib/prisma";

export const TOWN_EXTERNAL_STORE_IDS: Partial<Record<StoreCode, string>> = {
  KASUKABE: "16829",
  KOSHIGAYA: "32782",
};

type CreateTownPreviewInput = {
  file: File;
  importSourceId: string;
  dataType: TownImportDataType;
  storeId: string;
  targetFrom: string;
  targetTo: string;
  uploadedByUserId: string;
  metadata?: Record<string, unknown>;
  additionalGlobalIssues?: TownIssue[];
};

function allIssues(preview: TownPreview) {
  return [...preview.globalIssues, ...preview.rows.flatMap((row) => row.issues)];
}

export function summarizeTownPreview(preview: TownPreview) {
  const issues = allIssues(preview);
  return {
    pendingCount: preview.rows.filter((row) => row.kind === "CAST" && (row.resolutionStatus === "UNMATCHED" || row.resolutionStatus === "AMBIGUOUS")).length,
    skippedCount: preview.rows.filter((row) => row.resolutionStatus === "SKIPPED").length,
    warningCount: issues.filter((issue) => issue.level === "WARNING").length,
    errorCount: issues.filter((issue) => issue.level === "ERROR").length,
  };
}

function issueRow(issue: TownIssue) {
  if (!issue.rawData || typeof issue.rawData !== "object" || Array.isArray(issue.rawData)) return null;
  const value = issue.rawData as Record<string, unknown>;
  return typeof value.rowNumber === "number" ? value.rowNumber : null;
}

export async function createTownPreview(input: CreateTownPreviewInput) {
  if (!TOWN_DATA_TYPES.includes(input.dataType)) throw new Error("タウン取込種別が不正です。");
  const targetFromDate = parseDateOnly(input.targetFrom);
  const targetToDate = parseDateOnly(input.targetTo);
  if (targetFromDate > targetToDate) throw new Error("対象期間が不正です。");

  const importSource = await prisma.importSource.findFirst({
    where: { id: input.importSourceId, isActive: true, mediaType: MediaType.TOWN, dataType: input.dataType, storeId: input.storeId },
    include: { store: true },
  });
  if (!importSource?.store || !importSource.store.hasAcquisitionMetrics || importSource.store.code === StoreCode.NODA) {
    throw new Error("選択店舗・種別に一致する有効なタウン取込元を選択してください。");
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  validateCsvUpload(input.file, buffer);
  const batchId = randomUUID();
  const runId = randomUUID();
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const originalFilename = path.basename(input.file.name).slice(0, 255);
  const { storedFilename } = await saveImportFile(batchId, ".csv", buffer);
  const duplicate = await prisma.importBatch.findFirst({
    where: { fileHash, dataType: input.dataType, status: { in: [ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS] } },
    orderBy: { completedAt: "desc" },
  });

  await prisma.importBatch.create({ data: {
    id: batchId, runId, importSourceId: importSource.id, originalFilename, storedFilename, storagePath: storedFilename,
    fileHash, fileSizeBytes: BigInt(buffer.byteLength), dataType: input.dataType, importMode: ImportMode.DAILY,
    targetFrom: targetFromDate, targetTo: targetToDate, status: ImportBatchStatus.VALIDATING, uploadedByUserId: input.uploadedByUserId,
    metadata: { ...input.metadata, selectedStoreId: importSource.store.id, selectedStoreCode: importSource.store.code, expectedExternalStoreId: TOWN_EXTERNAL_STORE_IDS[importSource.store.code] || null, duplicateCompletedBatchId: duplicate?.id || null },
  } });

  try {
    let preview = parseTownCsv({
      buffer, batchId, runId, dataType: input.dataType, storeId: importSource.store.id,
      storeCode: importSource.store.code, storeName: importSource.store.shortName,
      targetFrom: input.targetFrom, targetTo: input.targetTo,
      expectedExternalStoreId: TOWN_EXTERNAL_STORE_IDS[importSource.store.code] || null,
    });
    preview = { ...preview, rows: await resolveTownPreviewRows(preview.rows, importSource.store.id, targetToDate) };
    if (input.additionalGlobalIssues?.length) preview.globalIssues.push(...input.additionalGlobalIssues);
    if (duplicate) preview.globalIssues.push({ code: "DUPLICATE_COMPLETED_FILE", level: "WARNING", message: "同じハッシュ・種別の完了済みファイルがあります。確定には明示的な再処理指定が必要です。", rawData: { batchId: duplicate.id } });
    const summary = summarizeTownPreview(preview);
    const fatalCodes = new Set(["HEADER_NOT_FOUND", "FILE_TYPE_MISMATCH", "TARGET_PERIOD_MISMATCH", "MULTI_DAY_WITHOUT_DATE_COLUMN"]);
    const fatal = preview.globalIssues.some((issue) => issue.level === "ERROR" && fatalCodes.has(issue.code));
    const status = fatal ? ImportBatchStatus.FAILED : summary.pendingCount ? ImportBatchStatus.WAITING_FOR_CAST_LINK : ImportBatchStatus.PREVIEW_READY;
    await writePreview(batchId, preview);

    const issueRecords = [
      ...preview.globalIssues.map((issue) => ({ issue, rowNumber: issueRow(issue) })),
      ...preview.rows.flatMap((row) => row.issues.map((issue) => ({ issue, rowNumber: row.sourceRowNumber }))),
    ];
    if (issueRecords.length) await prisma.importError.createMany({ data: issueRecords.map(({ issue, rowNumber }) => ({
      runId, importSourceId: importSource.id, importBatchId: batchId, fileName: originalFilename, fileHash,
      rowNumber, columnName: issue.columnName, errorCode: issue.code, level: issue.level, message: issue.message,
      rawData: issue.rawData === undefined ? undefined : JSON.parse(JSON.stringify(issue.rawData)),
    })) });
    await prisma.importBatch.update({ where: { id: batchId }, data: {
      status, failureMessage: fatal ? "選択内容とCSV構造または対象期間が一致しません。" : null,
      sourceSheetNames: [], detectedColumns: { headerRow: preview.headerRow, encoding: preview.encoding, delimiter: preview.delimiter, columns: preview.detectedColumns, unknown: preview.unknownColumns },
      pendingCount: summary.pendingCount, skippedCount: summary.skippedCount, warningCount: summary.warningCount, errorCount: summary.errorCount,
      metadata: { ...input.metadata, selectedStoreId: importSource.store.id, selectedStoreCode: importSource.store.code, expectedExternalStoreId: TOWN_EXTERNAL_STORE_IDS[importSource.store.code] || null, duplicateCompletedBatchId: duplicate?.id || null, sourcePeriodFrom: preview.sourcePeriodFrom, sourcePeriodTo: preview.sourcePeriodTo },
    } });
    return { batchId, status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "CSV解析に失敗しました。";
    await prisma.$transaction([
      prisma.importError.create({ data: { runId, importSourceId: importSource.id, importBatchId: batchId, fileName: originalFilename, fileHash, errorCode: "CSV_PARSE_FAILED", message } }),
      prisma.importBatch.update({ where: { id: batchId }, data: { status: ImportBatchStatus.FAILED, failureMessage: message, errorCount: 1, completedAt: new Date() } }),
    ]);
    throw new Error(message);
  }
}
