import { readFile } from "node:fs/promises";
import { DriveFailureCategory, DriveFileStatus, ImportDataType, MediaType, StoreCode } from "@/generated/prisma/client";
import { createTownPreview } from "@/lib/imports/town/service";
import { prisma } from "@/lib/prisma";
import { getGoogleDriveSystemActor } from "../system-actor";
import { driveFileLockName, withAdvisoryLock } from "./advisory-lock";
import { downloadDriveFile } from "./download";
import { markDriveFileFailure, transitionDriveFileState } from "./file-state-service";
import { resolveDriveFolderMapping } from "./mapping-service";
import { GoogleDriveTemporaryStorage } from "./temporary-storage";
import type { GoogleDriveClient } from "./types";

export type TownCastExecuteInput = { driveFileId: string; targetDate: string; confirmProduction?: boolean; client: GoogleDriveClient };
export type TownCastExecuteResult = { outcome: "EXECUTED" | "SKIPPED" | "REUSED"; batchId?: string; batchStatus?: string; reviewUrl?: string; reason?: string };

export const townCastReviewUrl = (batchId: string) => `/imports/town/${batchId}`;

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateTownCastExecuteInput(input: Pick<TownCastExecuteInput, "driveFileId" | "targetDate">) {
  if (!input.driveFileId.trim()) throw new Error("--drive-file-id is required.");
  if (!validDate(input.targetDate)) throw new Error("--target-date must be a valid YYYY-MM-DD date.");
}

export function assertTownCastProductionExecution(environment: string | undefined, confirmProduction: boolean) {
  if (environment === "production" && !confirmProduction) throw new Error("Production execution requires --confirm-production.");
}

export function assertTownCastMapping(mapping: { isActive: boolean; isFuture: boolean; importDataType: ImportDataType; storeId: string | null; importSource: { mediaType: MediaType; dataType: ImportDataType; storeId: string | null; store?: { code: StoreCode } | null } }) {
  if (!mapping.isActive || mapping.isFuture) throw new Error("Drive mapping is inactive or future.");
  if (mapping.importDataType !== ImportDataType.TOWN_CAST || mapping.importSource.dataType !== ImportDataType.TOWN_CAST || mapping.importSource.mediaType !== MediaType.TOWN) throw new Error("Drive mapping is not a valid TOWN_CAST mapping.");
  if (!mapping.storeId || mapping.storeId !== mapping.importSource.storeId) throw new Error("TOWN_CAST mapping requires a matching storeId.");
  if (!mapping.importSource.store || mapping.importSource.store.code === StoreCode.NODA || mapping.importSource.store.code === StoreCode.KUKI) throw new Error("TOWN_CAST mapping is restricted to a supported store.");
}

function metadataObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function sameTownCastIdentity(_metadata: unknown, state: { driveFileId: string; driveModifiedTime: Date; sha256: string | null }, batch: { metadata: unknown } | null) {
  const data = metadataObject(batch?.metadata);
  return data.origin === "GOOGLE_DRIVE" && data.importDataType === ImportDataType.TOWN_CAST && data.driveFileId === state.driveFileId && data.driveModifiedTime === state.driveModifiedTime.toISOString() && data.driveSha256 === state.sha256;
}

export async function executeTownCastDriveFile(input: TownCastExecuteInput): Promise<TownCastExecuteResult> {
  validateTownCastExecuteInput(input);
  assertTownCastProductionExecution(process.env.GOOGLE_DRIVE_AUTOMATION_ENV, Boolean(input.confirmProduction));
  const locked = await withAdvisoryLock<TownCastExecuteResult>(driveFileLockName(input.driveFileId), async () => {
    const state = await prisma.driveFileState.findUnique({ where: { driveFileId: input.driveFileId }, include: { driveFolderMapping: { include: { importSource: { include: { store: true } }, store: true } }, lastImportBatch: true } });
    if (!state) throw new Error("DriveFileState was not found.");
    if (state.status !== DriveFileStatus.READY) {
      if (state.status === DriveFileStatus.REVIEW_REQUIRED && state.lastImportBatch) return { outcome: "REUSED", batchId: state.lastImportBatch.id, batchStatus: state.lastImportBatch.status, reviewUrl: townCastReviewUrl(state.lastImportBatch.id), reason: "EXISTING_REVIEW" };
      throw new Error(`DriveFileState is not READY: ${state.status}.`);
    }
    const mapping = state.driveFolderMapping ?? await resolveDriveFolderMapping(state.folderId);
    assertTownCastMapping(mapping);
    if (state.lastImportBatch && sameTownCastIdentity(state.lastImportBatch.metadata, state, state.lastImportBatch)) return { outcome: "REUSED", batchId: state.lastImportBatch.id, batchStatus: state.lastImportBatch.status, reviewUrl: townCastReviewUrl(state.lastImportBatch.id), reason: "SAME_CONTENT" };
    const file = (await input.client.listFilesInFolder(state.folderId)).find((candidate) => candidate.id === state.driveFileId);
    if (!file || file.trashed) throw new Error("Drive file is missing or trashed.");
    if (!file.modifiedTime || new Date(file.modifiedTime).getTime() !== state.driveModifiedTime.getTime()) throw new Error("Drive file changed after detection; re-scan is required.");
    const storage = new GoogleDriveTemporaryStorage(); let downloadedPath: string | null = null;
    try {
      const downloaded = await downloadDriveFile({ client: input.client, file, folderId: state.folderId, storage }); downloadedPath = downloaded.localPath;
      if (state.sha256 && downloaded.sha256 !== state.sha256) throw new Error("Downloaded SHA-256 does not match DriveFileState.");
      const duplicate = await prisma.importBatch.findFirst({ where: { fileHash: downloaded.sha256, dataType: ImportDataType.TOWN_CAST, status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] }, importSource: { storeId: mapping.storeId! } }, orderBy: { completedAt: "desc" }, select: { id: true, status: true } });
      if (duplicate) return { outcome: "REUSED", batchId: duplicate.id, batchStatus: duplicate.status, reviewUrl: townCastReviewUrl(duplicate.id), reason: "DUPLICATE_COMPLETED_FILE" };
      await transitionDriveFileState(state.id, DriveFileStatus.IMPORTING);
      const actor = await getGoogleDriveSystemActor(); const buffer = await readFile(downloaded.localPath);
      const preview = await createTownPreview({ file: new File([buffer], downloaded.fileName, { type: downloaded.mimeType || "text/csv" }), importSourceId: mapping.importSourceId, dataType: ImportDataType.TOWN_CAST, storeId: mapping.storeId!, targetFrom: input.targetDate, targetTo: input.targetDate, uploadedByUserId: actor.id, metadata: { origin: "GOOGLE_DRIVE", importDataType: ImportDataType.TOWN_CAST, driveFileId: state.driveFileId, driveModifiedTime: state.driveModifiedTime.toISOString(), driveSha256: downloaded.sha256, driveFileStateId: state.id, executionMode: "EXECUTE", reviewRequired: true } });
      await transitionDriveFileState(state.id, DriveFileStatus.REVIEW_REQUIRED, { lastImportBatch: { connect: { id: preview.batchId } }, lastImportAttemptAt: new Date() });
      return { outcome: "EXECUTED", batchId: preview.batchId, batchStatus: preview.status, reviewUrl: townCastReviewUrl(preview.batchId) };
    } catch (error) { await markDriveFileFailure(state.id, { category: DriveFailureCategory.IMPORT, code: "TOWN_CAST_EXECUTE_FAILED", message: error instanceof Error ? error.message : "Town CAST execute failed.", retryable: false }).catch(() => undefined); throw error; }
    finally { if (downloadedPath) await storage.cleanup(downloadedPath).catch(() => undefined); }
  });
  return locked.acquired ? locked.result! : { outcome: "SKIPPED", reason: "FILE_LOCK_BUSY" };
}
