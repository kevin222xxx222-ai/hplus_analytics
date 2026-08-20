import { readFile } from "node:fs/promises";
import { DriveFailureCategory, DriveFileStatus, ImportDataType, ImportMode, MediaType } from "@/generated/prisma/client";
import { createCtiPreview } from "@/lib/imports/cti/service";
import { prisma } from "@/lib/prisma";
import { getGoogleDriveSystemActor } from "../system-actor";
import { driveFileLockName, withAdvisoryLock } from "./advisory-lock";
import { downloadDriveFile } from "./download";
import { markDriveFileFailure, transitionDriveFileState } from "./file-state-service";
import { resolveDriveFolderMapping } from "./mapping-service";
import { GoogleDriveTemporaryStorage } from "./temporary-storage";
import type { GoogleDriveClient } from "./types";

export type CtiExecuteInput = { driveFileId: string; targetDate: string; confirmProduction?: boolean; autoPreview?: boolean; client: GoogleDriveClient };
export type CtiExecuteResult = { outcome: "EXECUTED" | "SKIPPED" | "REUSED"; batchId?: string; batchStatus?: string; reviewUrl?: string; reason?: string };

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateCtiExecuteInput(input: Pick<CtiExecuteInput, "driveFileId" | "targetDate">): void {
  if (!input.driveFileId.trim()) throw new Error("--drive-file-id is required.");
  if (!validDate(input.targetDate)) throw new Error("--target-date must be a valid YYYY-MM-DD date.");
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sameIdentity(metadata: unknown, state: { driveFileId: string; driveModifiedTime: Date; sha256: string | null }, stateBatch: { metadata: unknown } | null): boolean {
  const data = metadataObject(stateBatch?.metadata);
  return data.origin === "GOOGLE_DRIVE"
    && data.driveFileId === state.driveFileId
    && data.driveModifiedTime === state.driveModifiedTime.toISOString()
    && data.driveSha256 === state.sha256;
}

export async function executeCtiDriveFile(input: CtiExecuteInput): Promise<CtiExecuteResult> {
  validateCtiExecuteInput(input);
  if (process.env.GOOGLE_DRIVE_AUTOMATION_ENV === "production" && !input.confirmProduction && !input.autoPreview) throw new Error("Production execution requires --confirm-production.");

  const locked = await withAdvisoryLock<CtiExecuteResult>(driveFileLockName(input.driveFileId), async () => {
    const state = await prisma.driveFileState.findUnique({
      where: { driveFileId: input.driveFileId },
      include: { driveFolderMapping: { include: { importSource: { include: { store: true } }, store: true } }, lastImportBatch: true },
    });
    if (!state) throw new Error("DriveFileState was not found.");
    if (state.status !== DriveFileStatus.READY) {
      if (state.status === DriveFileStatus.REVIEW_REQUIRED && state.lastImportBatch) return { outcome: "REUSED", batchId: state.lastImportBatch.id, batchStatus: state.lastImportBatch.status, reviewUrl: `/imports/${state.lastImportBatch.id}`, reason: "EXISTING_REVIEW" };
      throw new Error(`DriveFileState is not READY: ${state.status}.`);
    }
    const mapping = state.driveFolderMapping ?? await resolveDriveFolderMapping(state.folderId);
    if (!mapping.isActive || mapping.isFuture || mapping.importDataType !== ImportDataType.CTI_CAST_REPORT || mapping.storeId || mapping.importSource.mediaType !== MediaType.CTI || mapping.importSource.dataType !== ImportDataType.CTI_CAST_REPORT) throw new Error("Drive mapping is not a valid CTI_CAST_REPORT mapping.");
    if (state.lastImportBatch && sameIdentity(state.lastImportBatch.metadata, state, state.lastImportBatch)) return { outcome: "REUSED", batchId: state.lastImportBatch.id, batchStatus: state.lastImportBatch.status, reviewUrl: `/imports/${state.lastImportBatch.id}`, reason: "SAME_CONTENT" };

    const files = await input.client.listFilesInFolder(state.folderId);
    const file = files.find((candidate) => candidate.id === state.driveFileId);
    if (!file || file.trashed) throw new Error("Drive file is missing or trashed.");
    if (!file.modifiedTime || new Date(file.modifiedTime).getTime() !== state.driveModifiedTime.getTime()) throw new Error("Drive file changed after detection; re-scan is required.");
    await transitionDriveFileState(state.id, DriveFileStatus.IMPORTING);
    const storage = new GoogleDriveTemporaryStorage();
    let downloadedPath: string | null = null;
    try {
      const downloaded = await downloadDriveFile({ client: input.client, file, folderId: state.folderId, storage });
      downloadedPath = downloaded.localPath;
      if (state.sha256 && downloaded.sha256 !== state.sha256) throw new Error("Downloaded SHA-256 does not match DriveFileState.");
      const buffer = await readFile(downloaded.localPath);
      const actor = await getGoogleDriveSystemActor();
      const preview = await createCtiPreview({
        file: new File([buffer], downloaded.fileName, { type: downloaded.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        importSourceId: mapping.importSourceId, importMode: ImportMode.DAILY, targetFrom: input.targetDate, targetTo: input.targetDate,
        uploadedByUserId: actor.id,
        metadata: { origin: "GOOGLE_DRIVE", driveFileId: state.driveFileId, driveModifiedTime: state.driveModifiedTime.toISOString(), driveSha256: downloaded.sha256, driveFileStateId: state.id, executionMode: "EXECUTE", reviewRequired: true },
      });
      await transitionDriveFileState(state.id, DriveFileStatus.REVIEW_REQUIRED, { lastImportBatch: { connect: { id: preview.batchId } }, lastImportAttemptAt: new Date() });
      return { outcome: "EXECUTED", batchId: preview.batchId, batchStatus: preview.status, reviewUrl: `/imports/${preview.batchId}` };
    } catch (error) {
      await markDriveFileFailure(state.id, { category: DriveFailureCategory.IMPORT, code: "CTI_EXECUTE_FAILED", message: error instanceof Error ? error.message : "CTI execute failed.", retryable: false }).catch(() => undefined);
      throw error;
    } finally {
      if (downloadedPath) await storage.cleanup(downloadedPath).catch(() => undefined);
    }
  });
  return locked.acquired ? locked.result! : { outcome: "SKIPPED", reason: "FILE_LOCK_BUSY" };
}
