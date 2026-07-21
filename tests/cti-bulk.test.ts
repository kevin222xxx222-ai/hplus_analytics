import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ImportBatchStatus, StoreCode } from "@/generated/prisma/client";
import { runCtiBulkSequentially, sortCtiBulkFiles } from "@/lib/imports/cti/bulk-order";
import { selectCtiBulkPendingFiles, selectCtiBulkRetryFiles, summarizeCtiBulkProgress } from "@/lib/imports/cti/bulk-progress";
import { classifyCtiBulkFilename, inspectCtiBulkPreviewSafety, inspectCtiConfiguredFile, selectCtiBulkExistingBatch } from "@/lib/imports/cti/bulk-service";
import type { CtiBulkFile } from "@/lib/imports/cti/bulk-types";
import type { CtiPreview, CtiPreviewRow } from "@/lib/imports/cti/types";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

function previewWith(status: CtiPreviewRow["resolutionStatus"], hasCast = false): CtiPreview {
  const row = {
    rowKey: "KASUKABE:2", storeCode: StoreCode.KASUKABE, storeId: "store", sourceSheetName: "春日部", sourceRowNumber: 2,
    originalCastName: "あい", normalizedCastName: "あい", castId: hasCast ? "cast" : null, castDisplayName: hasCast ? "あい" : null,
    resolutionStatus: status, exclusionReason: null, metrics: hasCast ? {} : null, issues: [],
  } as CtiPreviewRow;
  return { version: 1, batchId: "batch", runId: "run", importMode: "DAILY", targetFrom: "2026-04-01", targetTo: "2026-04-01", workbookSheetNames: [], missingTargetSheets: [], sheets: [{ sheetName: "春日部", storeCode: StoreCode.KASUKABE, detectedHeaderRow: 1, detectedColumns: [], unknownColumns: [], totalRows: 1, excludedRows: 0, rows: [row] }], globalIssues: [], createdAt: new Date().toISOString() };
}

function bulkFile(index: number, overrides: Partial<CtiBulkFile> = {}): CtiBulkFile {
  return {
    key: `file-${index}`, filename: `女子別レポート_2026${String(index).padStart(4, "0")}.xlsx`, targetDate: "2026-04-01",
    size: 1, sha256: `sha-${index}`, state: "NEW", processStatus: "未処理", batchId: null,
    pendingCount: 0, warningCount: 0, errorCount: 0, ambiguousCount: 0, unmatchedCount: 0, importableCount: 0,
    autoConfirmSafe: false, correctionBatchIds: [], error: null, canProcess: true, ...overrides,
  };
}

describe("CTI local bulk import", () => {
  it("extracts a valid date from the exact filename, including decomposed Unicode", () => {
    expect(classifyCtiBulkFilename("女子別レポート_20260401.xlsx")).toEqual({ targetDate: "2026-04-01", error: null });
    expect(classifyCtiBulkFilename("女子別レポート_20260401.xlsx".normalize("NFD"))).toEqual({ targetDate: "2026-04-01", error: null });
  });

  it.each([".DS_Store", "~$女子別レポート_20260401.xlsx", "女子別レポート_20260401.xls", "女子別レポート_20260401.csv", "売上_20260401.xlsx"])("rejects unsupported file: %s", (filename) => {
    expect(classifyCtiBulkFilename(filename).targetDate).toBeNull();
  });

  it("sorts files by target date", () => {
    expect(sortCtiBulkFiles([
      { targetDate: "2026-04-03", filename: "c" }, { targetDate: "2026-04-01", filename: "a" }, { targetDate: "2026-04-02", filename: "b" },
    ]).map((file) => file.targetDate)).toEqual(["2026-04-01", "2026-04-02", "2026-04-03"]);
  });

  it("marks completed identical SHA as duplicate and keeps same-day correction unsafe", () => {
    const completed = { id: "done", status: ImportBatchStatus.COMPLETED };
    const waiting = { id: "waiting", status: ImportBatchStatus.WAITING_FOR_CAST_LINK };
    expect(selectCtiBulkExistingBatch([waiting, completed])).toEqual({ completedDuplicate: completed, existingBatch: waiting });
    expect(inspectCtiBulkPreviewSafety(previewWith("EXACT_ALIAS", true), ["different-sha"]).autoConfirmSafe).toBe(false);
  });

  it("stops unresolved/ambiguous previews and accepts a resolved daily preview", () => {
    expect(inspectCtiBulkPreviewSafety(previewWith("UNMATCHED")).autoConfirmSafe).toBe(false);
    expect(inspectCtiBulkPreviewSafety(previewWith("AMBIGUOUS")).ambiguousCount).toBe(1);
    expect(inspectCtiBulkPreviewSafety(previewWith("EXACT_ALIAS", true))).toMatchObject({ autoConfirmSafe: true, importableCount: 1 });
  });

  it("continues after one file fails", async () => {
    const visited: number[] = [];
    const result = await runCtiBulkSequentially([1, 2, 3], async (value) => { visited.push(value); if (value === 2) throw new Error("broken"); return value; });
    expect(visited).toEqual([1, 2, 3]);
    expect(result).toMatchObject([{ result: 1 }, { error: "broken" }, { result: 3 }]);
  });

  it("processes 108 files sequentially with concurrency one", async () => {
    let concurrent = 0; let maximumConcurrent = 0;
    const values = Array.from({ length: 108 }, (_, index) => index + 1);
    const result = await runCtiBulkSequentially(values, async (value) => {
      concurrent += 1; maximumConcurrent = Math.max(maximumConcurrent, concurrent);
      await Promise.resolve(); concurrent -= 1; return value;
    });
    expect(maximumConcurrent).toBe(1);
    expect(result).toHaveLength(108);
    expect(result.at(-1)).toMatchObject({ item: 108, result: 108 });
  });

  it("keeps the denominator at 108 after 15 duplicates and resumes the remaining 91", () => {
    const files = [
      ...Array.from({ length: 15 }, (_, index) => bulkFile(index, { state: "SKIPPED_DUPLICATE", processStatus: "COMPLETED", canProcess: false })),
      ...Array.from({ length: 2 }, (_, index) => bulkFile(index + 15, { state: "EXISTING_BATCH", processStatus: "PREVIEW_READY", batchId: `batch-${index}`, canProcess: false, importableCount: 1 })),
      ...Array.from({ length: 91 }, (_, index) => bulkFile(index + 17)),
    ];
    expect(summarizeCtiBulkProgress(files)).toMatchObject({ total: 108, processed: 17, duplicates: 15, completed: 2, remaining: 91, percent: 15 });
    expect(selectCtiBulkPendingFiles(files)).toHaveLength(91);
  });

  it("does not show 100 percent until every target has a terminal validation state", () => {
    const partial = Array.from({ length: 108 }, (_, index) => bulkFile(index, index < 15
      ? { state: "SKIPPED_DUPLICATE", processStatus: "COMPLETED", canProcess: false }
      : {}));
    expect(summarizeCtiBulkProgress(partial)).toMatchObject({ processed: 15, percent: 13 });
    const complete = partial.map((file) => file.canProcess ? { ...file, state: "EXISTING_BATCH" as const, processStatus: "PREVIEW_READY", batchId: `batch-${file.key}`, canProcess: false } : file);
    expect(summarizeCtiBulkProgress(complete)).toMatchObject({ processed: 108, remaining: 0, percent: 100 });
  });

  it("continues after a 504-equivalent failure and retries only failed files", async () => {
    const visited: number[] = [];
    const result = await runCtiBulkSequentially(Array.from({ length: 108 }, (_, index) => index + 1), async (value) => {
      visited.push(value); if (value === 16) throw new Error("HTTP 504"); return value;
    });
    expect(visited).toHaveLength(108);
    expect(result[15]).toMatchObject({ error: "HTTP 504" });
    const files = Array.from({ length: 108 }, (_, index) => bulkFile(index, index === 15 ? { processStatus: "FAILED", canProcess: true } : { state: "EXISTING_BATCH", processStatus: "PREVIEW_READY", canProcess: false }));
    expect(selectCtiBulkRetryFiles(files, {})).toEqual([files[15]]);
  });

  it("rejects symbolic links even when their target is xlsx", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cti-bulk-")); temporaryDirectories.push(directory);
    const outside = path.join(os.tmpdir(), `cti-bulk-outside-${Date.now()}.xlsx`);
    await writeFile(outside, "test");
    await symlink(outside, path.join(directory, "女子別レポート_20260401.xlsx"));
    try { await expect(inspectCtiConfiguredFile(directory, "女子別レポート_20260401.xlsx")).rejects.toThrow("シンボリックリンク"); }
    finally { await rm(outside, { force: true }); }
  });
});
