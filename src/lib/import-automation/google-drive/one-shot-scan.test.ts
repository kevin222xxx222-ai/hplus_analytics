import { describe, expect, it, vi } from "vitest";
import { DriveFileStatus, ImportDataType } from "@/generated/prisma/client";
import { runManualOneShotScan } from "./one-shot-scan";
import type { ResolvedDriveFolderMapping } from "./dispatcher";
import type { DriveFileMetadata, DriveImportFile, GoogleDriveClient } from "./types";

const mapping: ResolvedDriveFolderMapping = {
  id: "mapping-1", driveFolderId: "folder-1", displayName: "CTI", importDataType: ImportDataType.CTI_CAST_REPORT,
  metricHint: null, isActive: true, isFuture: false,
  importSource: { id: "source-1", name: "CTI", dataType: ImportDataType.CTI_CAST_REPORT, mediaType: "CTI", storeId: null }, store: null,
};

function file(overrides: Partial<DriveFileMetadata> = {}): DriveFileMetadata {
  return { id: "file-1", name: "女子別レポート.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 100, createdTime: "2026-08-14T00:00:00Z", modifiedTime: "2026-08-14T01:00:00Z", parents: ["folder-1"], trashed: false, md5Checksum: "md5", ...overrides };
}

function downloaded(): DriveImportFile {
  return { driveFileId: "file-1", folderId: "folder-1", displayName: "CTI", fileName: "女子別レポート.xlsx", localPath: "/tmp/drive-file", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 100, createdTime: "2026-08-14T00:00:00Z", modifiedTime: "2026-08-14T01:00:00Z", driveMd5Checksum: "md5", sha256: "sha", downloadedAt: "2026-08-14T02:00:00Z" };
}

function harness(files: DriveFileMetadata[], existing: unknown = null) {
  const client = { getFolderMetadata: vi.fn(async () => file({ id: "folder-1", name: "CTI", mimeType: "application/vnd.google-apps.folder" })), listFilesInFolder: vi.fn(async () => files), downloadFile: vi.fn() } as unknown as GoogleDriveClient;
  const getState = vi.fn(async () => existing);
  const upsert = vi.fn(async (): Promise<{ id: string; status: DriveFileStatus }> => ({ id: "state-1", status: DriveFileStatus.DETECTED }));
  const transition = vi.fn(async (_id: string, status: DriveFileStatus) => ({ id: "state-1", status }));
  const download = vi.fn(async () => downloaded());
  const dispatch = vi.fn(async () => ({ status: "REVIEW_REQUIRED", pipeline: "CTI", policy: "MANUAL_REVIEW", importBatchId: null, message: "resolve only", autoConfirmed: false, reviewReason: "RESOLVE_ONLY", errorCode: null }));
  const storage = { cleanup: vi.fn(async () => undefined) };
  return { client, getState, upsert, transition, download, dispatch, storage, deps: { client, mappings: [mapping], getState, upsert, transition, download, dispatch, storage } as never };
}

describe("runManualOneShotScan", () => {
  it("detects, downloads, resolves without importing, and cleans up a new file", async () => {
    const h = harness([file()]);
    const result = await runManualOneShotScan(h.deps);
    expect(result.summary).toMatchObject({ mappingsScanned: 1, filesSeen: 1, newFiles: 1, downloadedFiles: 1, reviewRequired: 1, failedFiles: 0 });
    expect(h.transition).toHaveBeenNthCalledWith(1, "state-1", DriveFileStatus.DOWNLOADING);
    expect(h.transition).toHaveBeenNthCalledWith(2, "state-1", DriveFileStatus.READY, expect.objectContaining({ sha256: "sha" }));
    expect(h.dispatch).toHaveBeenCalledWith(expect.objectContaining({ stateStatus: DriveFileStatus.READY }), { mode: "RESOLVE_ONLY" });
    expect(h.storage.cleanup).toHaveBeenCalledWith("/tmp/drive-file");
  });

  it("downloads unchanged DETECTED files but skips unchanged READY files", async () => {
    const detected = harness([file()], { fileName: "女子別レポート.xlsx", folderId: "folder-1", driveModifiedTime: new Date("2026-08-14T01:00:00Z"), sha256: null, status: DriveFileStatus.DETECTED });
    await runManualOneShotScan(detected.deps);
    expect(detected.download).toHaveBeenCalledTimes(1);
    const ready = harness([file()], { fileName: "女子別レポート.xlsx", folderId: "folder-1", driveModifiedTime: new Date("2026-08-14T01:00:00Z"), sha256: "sha", status: DriveFileStatus.READY });
    const result = await runManualOneShotScan(ready.deps);
    expect(ready.download).not.toHaveBeenCalled();
    expect(result.summary.unchangedFiles).toBe(1);
  });

  it("redownloads a READY file when Drive modifiedTime changes", async () => {
    const h = harness([file({ modifiedTime: "2026-08-14T03:00:00Z" })], { fileName: "女子別レポート.xlsx", folderId: "folder-1", driveModifiedTime: new Date("2026-08-14T01:00:00Z"), sha256: "old-sha", status: DriveFileStatus.READY });
    h.upsert.mockResolvedValue({ id: "state-1", status: DriveFileStatus.READY });
    await runManualOneShotScan(h.deps);
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(h.transition).toHaveBeenCalledWith("state-1", DriveFileStatus.DOWNLOADING);
  });

  it("skips trashed and Google Workspace files", async () => {
    const h = harness([file({ id: "trash", trashed: true }), file({ id: "native", mimeType: "application/vnd.google-apps.spreadsheet" })]);
    const result = await runManualOneShotScan(h.deps);
    expect(result.summary).toMatchObject({ filesSeen: 0, skippedFiles: 2, downloadedFiles: 0 });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("isolates a file failure and continues scanning", async () => {
    const h = harness([file({ id: "bad" }), file({ id: "good", name: "other.xlsx" })]);
    h.download.mockRejectedValueOnce(new Error("download failed"));
    const result = await runManualOneShotScan(h.deps);
    expect(result.summary.failedFiles).toBe(1);
    expect(result.summary.downloadedFiles).toBe(1);
    expect(result.files).toHaveLength(2);
  });

  it("fails the scan when a mapping folder cannot be listed", async () => {
    const h = harness([]);
    h.client.listFilesInFolder = vi.fn(async () => { throw new Error("Drive unavailable"); });
    await expect(runManualOneShotScan(h.deps)).rejects.toThrow("Drive unavailable");
  });
});
