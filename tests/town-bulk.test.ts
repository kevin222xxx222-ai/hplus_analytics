import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ImportBatchStatus, ImportDataType, StoreCode } from "@/generated/prisma/client";
import { formatScanTimestamp } from "@/components/town-bulk-import";
import { runTownBulkSequentially, selectTownBulkReparseCandidates, sortTownBulkFiles } from "@/lib/imports/town/bulk-order";
import { classifyTownBulkFilename, inspectConfiguredFile, inspectTownBulkPreviewSafety, inspectTownCastOnlyHoldPartial, inspectTownIdNoSourceUrlPartial, selectTownBulkExistingBatch } from "@/lib/imports/town/bulk-service";
import type { TownPreview } from "@/lib/imports/town/types";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("Town local bulk import", () => {
  it("formats the initial scan timestamp deterministically for SSR and the browser", () => {
    expect(formatScanTimestamp("2026-07-21T10:00:00.000Z")).toBe("2026-07-21 10:00:00Z");
    expect(formatScanTimestamp("not-a-date")).toBe("not-a-date");
  });

  it.each([
    ["dto.jp-shop-20260601_to_20260601.csv", ImportDataType.TOWN_STORE],
    ["dto.jp-gal-20260601_to_20260601.csv", ImportDataType.TOWN_CAST],
    ["dto.jp-url-20260601_to_20260601.csv", ImportDataType.TOWN_URL],
    ["dto.jp-lp-20260601_to_20260601.csv", ImportDataType.TOWN_LANDING],
  ])("detects all four data types: %s", (filename, dataType) => {
    expect(classifyTownBulkFilename(filename)).toMatchObject({ dataType, targetFrom: "2026-06-01", targetTo: "2026-06-01", error: null });
  });

  it("extracts dates with (1) and leaves store selection to the configured folder", () => {
    const result = classifyTownBulkFilename("dto.jp-gal-20260601_to_20260601 (1).csv");
    expect(result).toMatchObject({ dataType: ImportDataType.TOWN_CAST, targetFrom: "2026-06-01", targetTo: "2026-06-01" });
    expect(result).not.toHaveProperty("storeCode");
  });

  it("rejects unsupported files and multi-day cast/url/lp files", () => {
    expect(classifyTownBulkFilename("memo.txt").dataType).toBeNull();
    expect(classifyTownBulkFilename("other-20260601_to_20260601.csv").dataType).toBeNull();
    expect(classifyTownBulkFilename("dto.jp-gal-20260601_to_20260602.csv").error).toContain("複数日");
    expect(classifyTownBulkFilename("dto.jp-shop-20260601_to_20260602.csv").error).toBeNull();
  });

  it("sorts by date and then store, cast, URL, LP", () => {
    const base = { folderKey: "KASUKABE", filename: "x" } as const;
    const files = [
      { ...base, targetFrom: "2026-06-02", dataType: ImportDataType.TOWN_STORE },
      { ...base, targetFrom: "2026-06-01", dataType: ImportDataType.TOWN_LANDING },
      { ...base, targetFrom: "2026-06-01", dataType: ImportDataType.TOWN_URL },
      { ...base, targetFrom: "2026-06-01", dataType: ImportDataType.TOWN_CAST },
      { ...base, targetFrom: "2026-06-01", dataType: ImportDataType.TOWN_STORE },
    ];
    expect(sortTownBulkFiles(files).map((file) => file.dataType)).toEqual(["TOWN_STORE", "TOWN_CAST", "TOWN_URL", "TOWN_LANDING", "TOWN_STORE"]);
  });

  it("marks a completed identical SHA as a duplicate skip", () => {
    const completed = { id: "done", status: ImportBatchStatus.COMPLETED };
    const waiting = { id: "waiting", status: ImportBatchStatus.WAITING_FOR_CAST_LINK };
    expect(selectTownBulkExistingBatch([waiting, completed])).toEqual({ completedDuplicate: completed, existingBatch: waiting });
  });

  it("does not auto-confirm unresolved or ambiguous previews and allows a clean preview", () => {
    const preview = { globalIssues: [], rows: [{ kind: "CAST", resolutionStatus: "UNMATCHED", issues: [] }] } as unknown as TownPreview;
    expect(inspectTownBulkPreviewSafety(preview).autoConfirmSafe).toBe(false);
    preview.rows[0].resolutionStatus = "AMBIGUOUS";
    expect(inspectTownBulkPreviewSafety(preview).ambiguousCount).toBe(1);
    preview.rows = [];
    expect(inspectTownBulkPreviewSafety(preview).autoConfirmSafe).toBe(true);
    expect(inspectTownBulkPreviewSafety(preview, ["different-hash"]).autoConfirmSafe).toBe(false);
  });

  it("allows partial confirmation only when unmatched rows are URL/LP", () => {
    const preview = {
      rows: [
        { kind: "URL", resolutionStatus: "UNMATCHED", castId: null, issues: [{ code: "UNMATCHED_CAST", level: "WARNING" }] },
        { kind: "LANDING", resolutionStatus: "UNMATCHED", castId: null, issues: [{ code: "UNMATCHED_CAST", level: "WARNING" }] },
        { kind: "CAST", resolutionStatus: "NORMALIZED_CAST", castId: "cast-1", issues: [] },
      ],
    } as unknown as TownPreview;
    const eligible = inspectTownCastOnlyHoldPartial(preview, { status: ImportBatchStatus.PREVIEW_READY, errorCount: 0, metadata: { townBulk: { correctionBatchIds: [] } } });
    expect(eligible).toMatchObject({ eligible: true, unmatchedRows: 2, unmatchedUrlRows: 1, unmatchedLandingRows: 1, saveRows: 3 });
    preview.rows[2].resolutionStatus = "UNMATCHED";
    expect(inspectTownCastOnlyHoldPartial(preview, { status: ImportBatchStatus.PREVIEW_READY, errorCount: 0, metadata: { townBulk: { correctionBatchIds: [] } } }).eligible).toBe(false);
  });

  it("allows ID_NO_SOURCE_URL partial confirmation only for D-only TOWN_CAST batches", () => {
    const preview = {
      dataType: ImportDataType.TOWN_CAST,
      rows: [
        { kind: "CAST", date: "2026-07-01", normalizedCastName: "ID:5297063", castId: null, resolutionStatus: "UNMATCHED", issues: [{ code: "UNMATCHED_CAST", level: "WARNING" }] },
        { kind: "CAST", date: "2026-07-01", normalizedCastName: "あずさ", castId: "cast-1", resolutionStatus: "NORMALIZED_ALIAS", issues: [] },
      ],
    } as unknown as TownPreview;
    const eligible = inspectTownIdNoSourceUrlPartial(preview, { status: ImportBatchStatus.WAITING_FOR_CAST_LINK, errorCount: 0, metadata: { townBulk: { correctionBatchIds: [] } } }, new Set());
    expect(eligible).toMatchObject({ eligible: true, saveRows: 1, heldRows: 1, newRows: 1, updatedRows: 0 });
    preview.rows.push({ kind: "CAST", date: "2026-07-01", normalizedCastName: "いぶき", castId: null, resolutionStatus: "UNMATCHED", issues: [{ code: "UNMATCHED_CAST", level: "WARNING" }] } as never);
    expect(inspectTownIdNoSourceUrlPartial(preview, { status: ImportBatchStatus.WAITING_FOR_CAST_LINK, errorCount: 0, metadata: { townBulk: { correctionBatchIds: [] } } }).eligible).toBe(false);
  });

  it("continues after one file fails", async () => {
    const visited: number[] = [];
    const results = await runTownBulkSequentially([1, 2, 3], async (value) => {
      visited.push(value);
      if (value === 2) throw new Error("broken");
      return value * 10;
    });
    expect(visited).toEqual([1, 2, 3]);
    expect(results).toMatchObject([{ result: 10 }, { error: "broken" }, { result: 30 }]);
  });

  it("selects all four Town types only while unconfirmed", () => {
    const base = {
      key: "x", folderKey: "KASUKABE", storeName: "春日部", filename: "x.csv", targetFrom: "2026-06-01", targetTo: "2026-06-01",
      size: 1, sha256: "sha", state: "EXISTING_BATCH", processStatus: "PREVIEW_READY", batchId: "batch",
      pendingCount: 0, warningCount: 0, errorCount: 0, ambiguousCount: 0, unmatchedCount: 0, autoConfirmSafe: true,
      correctionBatchIds: [], error: null, canProcess: false,
    } as const;
    const eligible = [ImportDataType.TOWN_STORE, ImportDataType.TOWN_CAST, ImportDataType.TOWN_URL, ImportDataType.TOWN_LANDING]
      .map((dataType, index) => ({ ...base, key: String(index), batchId: `batch-${index}`, dataType }));
    const completed = { ...base, key: "done", dataType: ImportDataType.TOWN_CAST, processStatus: "COMPLETED" };
    const completedWithWarnings = { ...base, key: "warnings", dataType: ImportDataType.TOWN_CAST, processStatus: "COMPLETED_WITH_WARNINGS" };
    const duplicate = { ...base, key: "duplicate", dataType: ImportDataType.TOWN_URL, state: "SKIPPED_DUPLICATE" as const };
    expect(selectTownBulkReparseCandidates([...eligible, completed, completedWithWarnings, duplicate])).toEqual([...eligible, completedWithWarnings]);
  });

  it("rejects symbolic links even when their target is a CSV", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "town-bulk-"));
    temporaryDirectories.push(directory);
    const outside = path.join(os.tmpdir(), `town-bulk-outside-${Date.now()}.csv`);
    await writeFile(outside, "test");
    await symlink(outside, path.join(directory, "dto.jp-shop-20260601_to_20260601.csv"));
    try {
      await expect(inspectConfiguredFile({ folderKey: "KASUKABE", storeCode: StoreCode.KASUKABE, storeName: "春日部", directory }, "dto.jp-shop-20260601_to_20260601.csv")).rejects.toThrow("シンボリックリンク");
    } finally {
      await rm(outside, { force: true });
    }
  });
});
