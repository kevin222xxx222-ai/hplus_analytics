import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { ImportBatchStatus, ImportDataType, ImportMode, MediaType } from "@/generated/prisma/client";
import { parseDateOnly } from "@/lib/date";
import { parseCtiWorkbook } from "@/lib/imports/cti/parser";
import { CTI_STORE_CODES, type CtiStoreCode } from "@/lib/imports/cti/constants";
import { resolvePreviewRows } from "@/lib/imports/cti/resolver";
import type { CtiPreview, CtiPreviewRow, RowIssue } from "@/lib/imports/cti/types";
import { validateXlsxUpload } from "@/lib/imports/security";
import { saveWorkbook, writePreview } from "@/lib/imports/storage";
import { prisma } from "@/lib/prisma";

type CreatePreviewInput = {
  file: File;
  importSourceId: string;
  importMode: ImportMode;
  targetFrom: string;
  targetTo: string;
  uploadedByUserId: string;
  metadata?: Record<string, unknown>;
  additionalGlobalIssues?: RowIssue[];
};

function countIssues(issues: RowIssue[], level: "WARNING" | "ERROR") {
  return issues.filter((issue) => issue.level === level).length;
}

function allRows(preview: Pick<CtiPreview, "sheets">) {
  return preview.sheets.flatMap((sheet) => sheet.rows);
}

function isPending(row: CtiPreviewRow) {
  return row.resolutionStatus === "UNMATCHED" || row.resolutionStatus === "AMBIGUOUS";
}

export function summarizePreview(preview: CtiPreview) {
  const rows = allRows(preview);
  const rowIssues = rows.flatMap((row) => row.issues);
  const issues = [...preview.globalIssues, ...rowIssues];
  return {
    pendingCount: rows.filter(isPending).length,
    warningCount: countIssues(issues, "WARNING"),
    errorCount: countIssues(issues, "ERROR"),
    skippedCount: preview.sheets.reduce((sum, sheet) => sum + sheet.excludedRows, 0) + rows.filter((row) => row.resolutionStatus === "SKIPPED").length,
  };
}

export async function analyzeCtiWorkbook(input: {
  buffer: Buffer;
  batchId: string;
  runId: string;
  importMode: ImportMode;
  targetFrom: string;
  targetTo: string;
  duplicateCompletedBatchId?: string | null;
  additionalGlobalIssues?: RowIssue[];
}) {
  const targetTo = parseDateOnly(input.targetTo);
  const stores = await prisma.store.findMany({ where: { code: { in: CTI_STORE_CODES } }, select: { id: true, code: true } });
  const storeIds = Object.fromEntries(stores.map((store) => [store.code, store.id])) as Record<CtiStoreCode, string>;
  const parsed = await parseCtiWorkbook(input.buffer, storeIds);
  const resolvedSheets = [];
  for (const sheet of parsed.sheets) resolvedSheets.push({ ...sheet, rows: await resolvePreviewRows(sheet.rows, targetTo) });
  const globalIssues: RowIssue[] = [...parsed.globalIssues, ...(input.additionalGlobalIssues || [])];
  if (input.duplicateCompletedBatchId) globalIssues.push({ code: "DUPLICATE_COMPLETED_FILE", level: "WARNING", message: "同じハッシュの完了済みファイルがあります。確定には明示的な再処理指定が必要です。", rawData: { batchId: input.duplicateCompletedBatchId } });
  if (input.importMode !== ImportMode.DAILY) globalIssues.push({ code: "AGGREGATE_PREVIEW_ONLY", level: "WARNING", message: "当月累計・月次確定は日別内訳を確認できないため、Phase 2ではプレビューのみです。" });

  const preview: CtiPreview = {
    version: 1, batchId: input.batchId, runId: input.runId, importMode: input.importMode, targetFrom: input.targetFrom, targetTo: input.targetTo,
    workbookSheetNames: parsed.workbookSheetNames, missingTargetSheets: parsed.missingTargetSheets,
    sheets: resolvedSheets, globalIssues, createdAt: new Date().toISOString(),
  };
  const summary = summarizePreview(preview);
  const fatal = globalIssues.some((issue) => issue.code === "NO_TARGET_SHEETS") || resolvedSheets.every((sheet) => sheet.detectedHeaderRow === 0);
  const status = fatal ? ImportBatchStatus.FAILED : summary.pendingCount ? ImportBatchStatus.WAITING_FOR_CAST_LINK : ImportBatchStatus.PREVIEW_READY;
  const issueRecords = [
    ...globalIssues.map((issue) => {
      const raw = issue.rawData && typeof issue.rawData === "object" && !Array.isArray(issue.rawData) ? issue.rawData as Record<string, unknown> : null;
      return { issue, sheetName: typeof raw?.sheetName === "string" ? raw.sheetName : null, rowNumber: typeof raw?.rowNumber === "number" ? raw.rowNumber : null };
    }),
    ...resolvedSheets.flatMap((sheet) => sheet.rows.flatMap((row) => row.issues.map((issue) => ({ issue, sheetName: sheet.sheetName, rowNumber: row.sourceRowNumber })))),
  ];
  const detectedColumns = resolvedSheets.map((sheet) => ({ sheet: sheet.sheetName, headerRow: sheet.detectedHeaderRow, columns: sheet.detectedColumns, unknown: sheet.unknownColumns, unknownDetails: sheet.unknownColumnDetails || [] }));
  return { preview, summary, fatal, status, issueRecords, detectedColumns };
}

export async function createCtiPreview(input: CreatePreviewInput) {
  if (input.importMode === ImportMode.DAILY && input.targetFrom !== input.targetTo) throw new Error("日次取込では対象開始日と終了日を同日にしてください。");
  const targetFrom = parseDateOnly(input.targetFrom);
  const targetTo = parseDateOnly(input.targetTo);
  if (targetFrom > targetTo) throw new Error("対象期間が不正です。");

  const importSource = await prisma.importSource.findFirst({
    where: { id: input.importSourceId, isActive: true, mediaType: MediaType.CTI, dataType: ImportDataType.CTI_CAST_REPORT },
  });
  if (!importSource) throw new Error("有効なCTI女子別レポート取込元を選択してください。");

  const buffer = Buffer.from(await input.file.arrayBuffer());
  validateXlsxUpload(input.file, buffer);
  const batchId = randomUUID();
  const runId = randomUUID();
  const storedFilename = `${batchId}.xlsx`;
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const originalFilename = path.basename(input.file.name).slice(0, 255);
  await saveWorkbook(batchId, buffer);

  const duplicate = await prisma.importBatch.findFirst({
    where: { fileHash, status: { in: [ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS] } },
    orderBy: { completedAt: "desc" },
  });

  await prisma.importBatch.create({
    data: {
      id: batchId, runId, importSourceId: importSource.id, originalFilename, storedFilename, storagePath: storedFilename,
      fileHash, fileSizeBytes: BigInt(buffer.byteLength), dataType: ImportDataType.CTI_CAST_REPORT, importMode: input.importMode,
      targetFrom, targetTo, status: ImportBatchStatus.VALIDATING, uploadedByUserId: input.uploadedByUserId,
      metadata: { ...(input.metadata || {}), ...(duplicate ? { duplicateCompletedBatchId: duplicate.id } : {}) },
    },
  });

  try {
    const analysis = await analyzeCtiWorkbook({
      buffer, batchId, runId, importMode: input.importMode, targetFrom: input.targetFrom, targetTo: input.targetTo,
      duplicateCompletedBatchId: duplicate?.id, additionalGlobalIssues: input.additionalGlobalIssues,
    });
    await writePreview(batchId, analysis.preview);
    if (analysis.issueRecords.length) {
      await prisma.importError.createMany({ data: analysis.issueRecords.map(({ issue, sheetName, rowNumber }) => ({
        runId, importSourceId: importSource.id, importBatchId: batchId, fileName: originalFilename, fileHash,
        sheetName, rowNumber, columnName: issue.columnName, errorCode: issue.code, level: issue.level,
        message: issue.message, rawData: issue.rawData === undefined ? undefined : JSON.parse(JSON.stringify(issue.rawData)),
      })) });
    }
    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: analysis.status, failureMessage: analysis.fatal ? "対象シートまたは有効なヘッダーを検出できません。" : null,
        sourceSheetNames: analysis.preview.workbookSheetNames,
        detectedColumns: analysis.detectedColumns,
        pendingCount: analysis.summary.pendingCount, warningCount: analysis.summary.warningCount, errorCount: analysis.summary.errorCount, skippedCount: analysis.summary.skippedCount,
      },
    });
    return { batchId, status: analysis.status };
  } catch {
    const message = "XLSX解析に失敗しました。ファイル形式、対象シート、列構成を確認してください。";
    await prisma.$transaction([
      prisma.importError.create({ data: { runId, importSourceId: importSource.id, importBatchId: batchId, fileName: originalFilename, fileHash, errorCode: "WORKBOOK_PARSE_FAILED", message } }),
      prisma.importBatch.update({ where: { id: batchId }, data: { status: ImportBatchStatus.FAILED, failureMessage: message, errorCount: 1, completedAt: new Date() } }),
    ]);
    throw new Error("XLSXを解析できませんでした。ファイル形式と内容を確認してください。");
  }
}
