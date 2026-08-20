import { readFile } from "node:fs/promises";
import { DriveFailureCategory, DriveFileStatus, ImportDataType, MediaType, StoreCode } from "@/generated/prisma/client";
import { createHeavenPreview } from "@/lib/imports/heaven/service";
import { prisma } from "@/lib/prisma";
import { getGoogleDriveSystemActor } from "../system-actor";
import { driveFileLockName, withAdvisoryLock } from "./advisory-lock";
import { downloadDriveFile } from "./download";
import { markDriveFileFailure, transitionDriveFileState } from "./file-state-service";
import { resolveDriveFolderMapping } from "./mapping-service";
import { GoogleDriveTemporaryStorage } from "./temporary-storage";
import type { GoogleDriveClient } from "./types";

/** autoPreview is an internal capability passed only by the allowlisted I8 registry; it never confirms/imports. */
export type HeavenShopExecuteInput = { driveFileId: string; confirmProduction?: boolean; autoPreview?: boolean; client: GoogleDriveClient };
export type HeavenShopExecuteResult = { outcome: "EXECUTED" | "SKIPPED" | "REUSED"; batchId?: string; batchStatus?: string; reviewUrl?: string; reason?: string };

export function heavenReviewUrl(batchId: string): string {
  return `/imports/heaven/${batchId}`;
}

export function validateHeavenShopExecuteInput(input: Pick<HeavenShopExecuteInput, "driveFileId">): void {
  if (!input.driveFileId.trim()) throw new Error("--drive-file-id is required.");
}

export function assertHeavenShopProductionExecution(environment: string | undefined, confirmProduction: boolean, autoPreview = false): void {
  if (environment === "production" && !confirmProduction && !autoPreview) throw new Error("Production execution requires --confirm-production.");
}

export function assertHeavenShopMapping(mapping: {
  isActive: boolean;
  isFuture: boolean;
  importDataType: ImportDataType;
  storeId: string | null;
  metricHint?: string | null;
  importSource: { mediaType: MediaType; dataType: ImportDataType; storeId: string | null; metricHint?: string | null; store?: { code: StoreCode } | null };
}): void {
  if (!mapping.isActive || mapping.isFuture) throw new Error("Drive mapping is inactive or future.");
  if (mapping.importDataType !== ImportDataType.HEAVEN_STORE || mapping.importSource.dataType !== ImportDataType.HEAVEN_STORE || mapping.importSource.mediaType !== MediaType.HEAVEN) throw new Error("Drive mapping is not a valid HEAVEN_STORE mapping.");
  if (!mapping.storeId || mapping.storeId !== mapping.importSource.storeId) throw new Error("HEAVEN_STORE mapping requires a matching storeId.");
  if (mapping.importSource.store?.code !== StoreCode.KASUKABE) throw new Error("Heaven Shop mapping is restricted to Kasukabe.");
  if (mapping.metricHint || mapping.importSource.metricHint) throw new Error("Heaven Shop mapping must not specify metricHint.");
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function sameHeavenShopIdentity(metadata: unknown, state: { driveFileId: string; driveModifiedTime: Date; sha256: string | null }, stateBatch: { metadata: unknown } | null): boolean {
  const data = metadataObject(stateBatch?.metadata);
  return data.origin === "GOOGLE_DRIVE"
    && data.importDataType === ImportDataType.HEAVEN_STORE
    && data.driveFileId === state.driveFileId
    && data.driveModifiedTime === state.driveModifiedTime.toISOString()
    && data.driveSha256 === state.sha256;
}

export async function executeHeavenShopDriveFile(input: HeavenShopExecuteInput): Promise<HeavenShopExecuteResult> {
  validateHeavenShopExecuteInput(input);
  assertHeavenShopProductionExecution(process.env.GOOGLE_DRIVE_AUTOMATION_ENV, Boolean(input.confirmProduction), Boolean(input.autoPreview));

  const locked = await withAdvisoryLock<HeavenShopExecuteResult>(driveFileLockName(input.driveFileId), async () => {
    const state = await prisma.driveFileState.findUnique({
      where: { driveFileId: input.driveFileId },
      include: { driveFolderMapping: { include: { importSource: { include: { store: true } }, store: true } }, lastImportBatch: true },
    });
    if (!state) throw new Error("DriveFileState was not found.");
    if (state.status !== DriveFileStatus.READY) {
      if (state.status === DriveFileStatus.REVIEW_REQUIRED && state.lastImportBatch) return { outcome: "REUSED", batchId: state.lastImportBatch.id, batchStatus: state.lastImportBatch.status, reviewUrl: heavenReviewUrl(state.lastImportBatch.id), reason: "EXISTING_REVIEW" };
      throw new Error(`DriveFileState is not READY: ${state.status}.`);
    }
    const mapping = state.driveFolderMapping ?? await resolveDriveFolderMapping(state.folderId);
    assertHeavenShopMapping(mapping);
    if (state.lastImportBatch && sameHeavenShopIdentity(state.lastImportBatch.metadata, state, state.lastImportBatch)) return { outcome: "REUSED", batchId: state.lastImportBatch.id, batchStatus: state.lastImportBatch.status, reviewUrl: heavenReviewUrl(state.lastImportBatch.id), reason: "SAME_CONTENT" };

    const files = await input.client.listFilesInFolder(state.folderId);
    const file = files.find((candidate) => candidate.id === state.driveFileId);
    if (!file || file.trashed) throw new Error("Drive file is missing or trashed.");
    if (!file.modifiedTime || new Date(file.modifiedTime).getTime() !== state.driveModifiedTime.getTime()) throw new Error("Drive file changed after detection; re-scan is required.");
    const storage = new GoogleDriveTemporaryStorage();
    let downloadedPath: string | null = null;
    try {
      const downloaded = await downloadDriveFile({ client: input.client, file, folderId: state.folderId, storage });
      downloadedPath = downloaded.localPath;
      if (state.sha256 && downloaded.sha256 !== state.sha256) throw new Error("Downloaded SHA-256 does not match DriveFileState.");
      const duplicate = await prisma.importBatch.findFirst({
        where: { fileHash: downloaded.sha256, dataType: ImportDataType.HEAVEN_STORE, status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] }, importSource: { storeId: mapping.storeId! } },
        orderBy: { completedAt: "desc" }, select: { id: true, status: true },
      });
      if (duplicate) return { outcome: "REUSED", batchId: duplicate.id, batchStatus: duplicate.status, reviewUrl: heavenReviewUrl(duplicate.id), reason: "DUPLICATE_COMPLETED_FILE" };
      await transitionDriveFileState(state.id, DriveFileStatus.IMPORTING);
      const buffer = await readFile(downloaded.localPath);
      const actor = await getGoogleDriveSystemActor();
      const preview = await createHeavenPreview({
        file: new File([buffer], downloaded.fileName, { type: downloaded.mimeType || "text/csv" }),
        storeId: mapping.storeId!, uploadedByUserId: actor.id,
        metadata: { origin: "GOOGLE_DRIVE", importDataType: ImportDataType.HEAVEN_STORE, driveFileId: state.driveFileId, driveModifiedTime: state.driveModifiedTime.toISOString(), driveSha256: downloaded.sha256, driveFileStateId: state.id, executionMode: "EXECUTE", reviewRequired: true },
      });
      if (preview.reused) {
        await transitionDriveFileState(state.id, DriveFileStatus.REVIEW_REQUIRED, { lastImportBatch: { connect: { id: preview.batchId } }, lastImportAttemptAt: new Date() });
        return { outcome: "REUSED", batchId: preview.batchId, batchStatus: preview.status, reviewUrl: heavenReviewUrl(preview.batchId), reason: "DUPLICATE_OR_ACTIVE_FILE" };
      }
      await transitionDriveFileState(state.id, DriveFileStatus.REVIEW_REQUIRED, { lastImportBatch: { connect: { id: preview.batchId } }, lastImportAttemptAt: new Date() });
      return { outcome: "EXECUTED", batchId: preview.batchId, batchStatus: preview.status, reviewUrl: heavenReviewUrl(preview.batchId) };
    } catch (error) {
      await markDriveFileFailure(state.id, { category: DriveFailureCategory.IMPORT, code: "HEAVEN_SHOP_EXECUTE_FAILED", message: error instanceof Error ? error.message : "Heaven Shop execute failed.", retryable: false }).catch(() => undefined);
      throw error;
    } finally {
      if (downloadedPath) await storage.cleanup(downloadedPath).catch(() => undefined);
    }
  });
  return locked.acquired ? locked.result! : { outcome: "SKIPPED", reason: "FILE_LOCK_BUSY" };
}
