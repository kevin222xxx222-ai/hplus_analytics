import { DriveFailureCategory, DriveFileStatus } from "@/generated/prisma/client";
import { dispatchDriveImport, type DispatcherResult, type ResolvedDriveFolderMapping } from "./dispatcher";
import { downloadDriveFile } from "./download";
import { classifyDriveFileUpdate, getDriveFileStateByDriveFileId, markDriveFileFailure, transitionDriveFileState, upsertDetectedDriveFile } from "./file-state-service";
import { listActiveDriveFolderMappings } from "./mapping-service";
import { GoogleDriveTemporaryStorage } from "./temporary-storage";
import type { DriveFileMetadata, DriveImportFile, GoogleDriveClient } from "./types";

export type OneShotScanSummary = {
  mappingsScanned: number;
  filesSeen: number;
  newFiles: number;
  changedFiles: number;
  unchangedFiles: number;
  downloadedFiles: number;
  skippedFiles: number;
  reviewRequired: number;
  failedFiles: number;
};

export type OneShotScanFileResult = {
  fileId: string;
  fileName: string;
  mappingName: string;
  classification: "NEW" | "UNCHANGED" | "CHANGED" | "RENAMED" | "MOVED" | "SKIPPED";
  status: string;
  download: "OK" | "SKIPPED" | "FAILED";
  dispatcher: DispatcherResult | null;
  error?: string;
};

export type OneShotScanResult = {
  summary: OneShotScanSummary;
  files: OneShotScanFileResult[];
};

export type OneShotScanDependencies = {
  client: GoogleDriveClient;
  storage?: GoogleDriveTemporaryStorage;
  mappings?: ResolvedDriveFolderMapping[];
  getMappings?: () => Promise<ResolvedDriveFolderMapping[]>;
  getState?: typeof getDriveFileStateByDriveFileId;
  upsert?: typeof upsertDetectedDriveFile;
  transition?: typeof transitionDriveFileState;
  download?: typeof downloadDriveFile;
  dispatch?: typeof dispatchDriveImport;
  withFileLock?: <T>(driveFileId: string, operation: () => Promise<T>) => Promise<{ acquired: boolean; result?: T }>;
  markFailure?: typeof markDriveFileFailure;
};

const WORKSPACE_MIME_PREFIX = "application/vnd.google-apps.";

function isProcessable(file: DriveFileMetadata): boolean {
  return !file.trashed && !(file.mimeType || "").startsWith(WORKSPACE_MIME_PREFIX);
}

function mappingForDispatcher(mapping: ResolvedDriveFolderMapping): ResolvedDriveFolderMapping {
  return mapping;
}

function classification(file: DriveFileMetadata, folderId: string, existing: { fileName: string; folderId: string; driveModifiedTime: Date; sha256: string | null } | null): OneShotScanFileResult["classification"] {
  if (!existing) return "NEW";
  if (existing.folderId !== folderId) return "MOVED";
  if (existing.fileName !== file.name) return "RENAMED";
  return classifyDriveFileUpdate(existing, { modifiedTime: file.modifiedTime || "", sha256: null }) === "unchanged" ? "UNCHANGED" : "CHANGED";
}

function shouldDownload(kind: OneShotScanFileResult["classification"], status: DriveFileStatus | undefined): boolean {
  if (kind === "NEW") return true;
  if (kind === "UNCHANGED") return status === DriveFileStatus.DETECTED || status === DriveFileStatus.FAILED_RETRYABLE;
  if (kind === "CHANGED" || kind === "RENAMED" || kind === "MOVED") return status === DriveFileStatus.DETECTED || status === DriveFileStatus.READY || status === DriveFileStatus.FAILED_RETRYABLE;
  return false;
}

export async function runManualOneShotScan(dependencies: OneShotScanDependencies): Promise<OneShotScanResult> {
  const storage = dependencies.storage ?? new GoogleDriveTemporaryStorage();
  const getMappings = dependencies.getMappings ?? (() => listActiveDriveFolderMappings() as unknown as Promise<ResolvedDriveFolderMapping[]>);
  const getState = dependencies.getState ?? getDriveFileStateByDriveFileId;
  const upsert = dependencies.upsert ?? upsertDetectedDriveFile;
  const transition = dependencies.transition ?? transitionDriveFileState;
  const download = dependencies.download ?? downloadDriveFile;
  const dispatch = dependencies.dispatch ?? dispatchDriveImport;
  const markFailure = dependencies.markFailure ?? markDriveFileFailure;
  const mappings = dependencies.mappings ?? await getMappings();
  const summary: OneShotScanSummary = { mappingsScanned: 0, filesSeen: 0, newFiles: 0, changedFiles: 0, unchangedFiles: 0, downloadedFiles: 0, skippedFiles: 0, reviewRequired: 0, failedFiles: 0 };
  const results: OneShotScanFileResult[] = [];

  for (const mapping of mappings) {
    summary.mappingsScanned += 1;
    await dependencies.client.getFolderMetadata(mapping.driveFolderId);
    const files = await dependencies.client.listFilesInFolder(mapping.driveFolderId);
    for (const file of files) {
      if (!isProcessable(file)) { summary.skippedFiles += 1; continue; }
      summary.filesSeen += 1;
      const existing = await getState(file.id);
      const kind = classification(file, mapping.driveFolderId, existing as { fileName: string; folderId: string; driveModifiedTime: Date; sha256: string | null } | null);
      if (kind === "NEW") summary.newFiles += 1;
      else if (kind === "UNCHANGED") summary.unchangedFiles += 1;
      else summary.changedFiles += 1;
      const result: OneShotScanFileResult = { fileId: file.id, fileName: file.name, mappingName: mapping.displayName, classification: kind, status: existing?.status || "NEW", download: "SKIPPED", dispatcher: null };
      const processFile = async () => {
       let stateId: string | undefined;
       try {
        const state = await upsert({ driveFileId: file.id, folderId: mapping.driveFolderId, fileName: file.name, mimeType: file.mimeType || "application/octet-stream", sizeBytes: file.sizeBytes, driveMd5Checksum: file.md5Checksum, sha256: null, createdTime: file.createdTime || new Date().toISOString(), modifiedTime: file.modifiedTime || new Date().toISOString(), mappingId: mapping.id, isTrashed: file.trashed });
        stateId = state.id;
        result.status = state.status;
        if (!shouldDownload(kind, existing?.status)) { summary.skippedFiles += 1; return; }
        if (state.status !== DriveFileStatus.DETECTED && state.status !== DriveFileStatus.READY && state.status !== DriveFileStatus.FAILED_RETRYABLE) {
          summary.skippedFiles += 1; result.classification = kind === "UNCHANGED" ? kind : "SKIPPED"; return;
        }
        const downloading = state.status === DriveFileStatus.FAILED_RETRYABLE ? await transition(state.id, DriveFileStatus.DETECTED) : state;
        await transition(downloading.id, DriveFileStatus.DOWNLOADING);
        let downloaded: DriveImportFile | null = null;
        try {
          downloaded = await download({ client: dependencies.client, file, folderId: mapping.driveFolderId, storage });
          await transition(state.id, DriveFileStatus.READY, { sha256: downloaded.sha256, sizeBytes: BigInt(downloaded.sizeBytes), lastDownloadedAt: new Date(downloaded.downloadedAt) });
          summary.downloadedFiles += 1;
          result.download = "OK";
          result.status = DriveFileStatus.READY;
          result.dispatcher = await dispatch({ file: downloaded, mapping: mappingForDispatcher(mapping), stateId: state.id, stateStatus: DriveFileStatus.READY }, { mode: "RESOLVE_ONLY" });
          if (result.dispatcher.status === "REVIEW_REQUIRED") summary.reviewRequired += 1;
        } finally {
          if (downloaded) await storage.cleanup(downloaded.localPath).catch(() => undefined);
        }
       } catch (error) {
        summary.failedFiles += 1;
        result.download = "FAILED";
        result.error = error instanceof Error ? error.message : "unknown error";
        if (stateId) await markFailure(stateId, { category: DriveFailureCategory.DOWNLOAD, code: "ONE_SHOT_FILE_FAILURE", message: result.error, retryable: true }).catch(() => undefined);
       }
       results.push(result);
      };
      const lockResult = dependencies.withFileLock
        ? await dependencies.withFileLock(file.id, processFile)
        : { acquired: true, result: await processFile() };
      if (!lockResult.acquired) {
        summary.skippedFiles += 1;
        results.push({ ...result, classification: "SKIPPED", error: "FILE_LOCK_BUSY" });
      }
    }
  }
  return { summary, files: results };
}
