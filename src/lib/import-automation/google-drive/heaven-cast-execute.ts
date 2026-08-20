import { readFile } from "node:fs/promises";
import { DriveFailureCategory, DriveFileStatus, ImportDataType, MediaType, StoreCode } from "@/generated/prisma/client";
import { createHeavenPreview } from "@/lib/imports/heaven/service";
import type { HeavenMetricType } from "@/lib/imports/heaven/parser";
import { prisma } from "@/lib/prisma";
import { getGoogleDriveSystemActor } from "../system-actor";
import { driveFileLockName, withAdvisoryLock } from "./advisory-lock";
import { downloadDriveFile } from "./download";
import { markDriveFileFailure, transitionDriveFileState } from "./file-state-service";
import { resolveDriveFolderMapping } from "./mapping-service";
import { GoogleDriveTemporaryStorage } from "./temporary-storage";
import type { GoogleDriveClient } from "./types";

const ALLOWED_METRICS = new Set<HeavenMetricType>(["PAGE_ACCESS", "DIARY_POSTS"]);
/** autoPreview is an internal capability passed only by the allowlisted I8 registry; it never confirms/imports. */
export type HeavenCastExecuteInput = { driveFileId: string; confirmProduction?: boolean; autoPreview?: boolean; client: GoogleDriveClient };
export type HeavenCastExecuteResult = { outcome: "EXECUTED" | "SKIPPED" | "REUSED"; batchId?: string; batchStatus?: string; reviewUrl?: string; reason?: string };
export const heavenCastReviewUrl = (batchId: string) => `/imports/heaven/${batchId}`;

export function validateHeavenCastExecuteInput(input: Pick<HeavenCastExecuteInput, "driveFileId">) { if (!input.driveFileId.trim()) throw new Error("--drive-file-id is required."); }
export function assertHeavenCastProductionExecution(environment: string | undefined, confirmProduction: boolean, autoPreview = false) { if (environment === "production" && !confirmProduction && !autoPreview) throw new Error("Production execution requires --confirm-production."); }
export function assertHeavenCastMapping(mapping: { isActive: boolean; isFuture: boolean; importDataType: ImportDataType; storeId: string | null; metricHint?: string | null; importSource: { mediaType: MediaType; dataType: ImportDataType; storeId: string | null; store?: { code: StoreCode } | null } }) {
  if (!mapping.isActive || mapping.isFuture) throw new Error("Drive mapping is inactive or future.");
  if (mapping.importDataType !== ImportDataType.HEAVEN_CAST || mapping.importSource.dataType !== ImportDataType.HEAVEN_CAST || mapping.importSource.mediaType !== MediaType.HEAVEN) throw new Error("Drive mapping is not a valid HEAVEN_CAST mapping.");
  if (!mapping.storeId || mapping.storeId !== mapping.importSource.storeId || mapping.importSource.store?.code !== StoreCode.KASUKABE) throw new Error("Heaven CAST mapping requires the Kasukabe store.");
  if (!mapping.metricHint || !ALLOWED_METRICS.has(mapping.metricHint as HeavenMetricType)) throw new Error("Heaven CAST mapping requires PAGE_ACCESS or DIARY_POSTS metricHint.");
}
function metadataObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function sameHeavenCastIdentity(_metadata: unknown, state: { driveFileId: string; driveModifiedTime: Date; sha256: string | null }, batch: { metadata: unknown } | null) { const data = metadataObject(batch?.metadata); return data.origin === "GOOGLE_DRIVE" && data.importDataType === ImportDataType.HEAVEN_CAST && data.driveFileId === state.driveFileId && data.driveModifiedTime === state.driveModifiedTime.toISOString() && data.driveSha256 === state.sha256; }

export async function executeHeavenCastDriveFile(input: HeavenCastExecuteInput): Promise<HeavenCastExecuteResult> {
  validateHeavenCastExecuteInput(input); assertHeavenCastProductionExecution(process.env.GOOGLE_DRIVE_AUTOMATION_ENV, Boolean(input.confirmProduction), Boolean(input.autoPreview));
  const locked = await withAdvisoryLock<HeavenCastExecuteResult>(driveFileLockName(input.driveFileId), async () => {
    const state = await prisma.driveFileState.findUnique({ where: { driveFileId: input.driveFileId }, include: { driveFolderMapping: { include: { importSource: { include: { store: true } }, store: true } }, lastImportBatch: true } });
    if (!state) throw new Error("DriveFileState was not found.");
    if (state.status !== DriveFileStatus.READY) { if (state.status === DriveFileStatus.REVIEW_REQUIRED && state.lastImportBatch) return { outcome: "REUSED", batchId: state.lastImportBatch.id, batchStatus: state.lastImportBatch.status, reviewUrl: heavenCastReviewUrl(state.lastImportBatch.id), reason: "EXISTING_REVIEW" }; throw new Error(`DriveFileState is not READY: ${state.status}.`); }
    const mapping = state.driveFolderMapping ?? await resolveDriveFolderMapping(state.folderId); assertHeavenCastMapping(mapping);
    if (state.lastImportBatch && sameHeavenCastIdentity(state.lastImportBatch.metadata, state, state.lastImportBatch)) return { outcome: "REUSED", batchId: state.lastImportBatch.id, batchStatus: state.lastImportBatch.status, reviewUrl: heavenCastReviewUrl(state.lastImportBatch.id), reason: "SAME_CONTENT" };
    const file = (await input.client.listFilesInFolder(state.folderId)).find((candidate) => candidate.id === state.driveFileId);
    if (!file || file.trashed) throw new Error("Drive file is missing or trashed.");
    if (!file.modifiedTime || new Date(file.modifiedTime).getTime() !== state.driveModifiedTime.getTime()) throw new Error("Drive file changed after detection; re-scan is required.");
    const storage = new GoogleDriveTemporaryStorage(); let downloadedPath: string | null = null;
    try {
      const downloaded = await downloadDriveFile({ client: input.client, file, folderId: state.folderId, storage }); downloadedPath = downloaded.localPath;
      if (state.sha256 && downloaded.sha256 !== state.sha256) throw new Error("Downloaded SHA-256 does not match DriveFileState.");
      const duplicate = await prisma.importBatch.findFirst({ where: { fileHash: downloaded.sha256, dataType: ImportDataType.HEAVEN_CAST, status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] }, importSource: { storeId: mapping.storeId! } }, orderBy: { completedAt: "desc" }, select: { id: true, status: true } });
      if (duplicate) return { outcome: "REUSED", batchId: duplicate.id, batchStatus: duplicate.status, reviewUrl: heavenCastReviewUrl(duplicate.id), reason: "DUPLICATE_COMPLETED_FILE" };
      await transitionDriveFileState(state.id, DriveFileStatus.IMPORTING);
      const actor = await getGoogleDriveSystemActor(); const buffer = await readFile(downloaded.localPath);
      const preview = await createHeavenPreview({ file: new File([buffer], downloaded.fileName, { type: downloaded.mimeType || "text/csv" }), storeId: mapping.storeId!, metricHint: mapping.metricHint as HeavenMetricType, uploadedByUserId: actor.id, metadata: { origin: "GOOGLE_DRIVE", importDataType: ImportDataType.HEAVEN_CAST, driveFileId: state.driveFileId, driveModifiedTime: state.driveModifiedTime.toISOString(), driveSha256: downloaded.sha256, driveFileStateId: state.id, executionMode: "EXECUTE", reviewRequired: true } });
      if (preview.reused) { await transitionDriveFileState(state.id, DriveFileStatus.REVIEW_REQUIRED, { lastImportBatch: { connect: { id: preview.batchId } }, lastImportAttemptAt: new Date() }); return { outcome: "REUSED", batchId: preview.batchId, batchStatus: preview.status, reviewUrl: heavenCastReviewUrl(preview.batchId), reason: "DUPLICATE_OR_ACTIVE_FILE" }; }
      await transitionDriveFileState(state.id, DriveFileStatus.REVIEW_REQUIRED, { lastImportBatch: { connect: { id: preview.batchId } }, lastImportAttemptAt: new Date() });
      return { outcome: "EXECUTED", batchId: preview.batchId, batchStatus: preview.status, reviewUrl: heavenCastReviewUrl(preview.batchId) };
    } catch (error) { await markDriveFileFailure(state.id, { category: DriveFailureCategory.IMPORT, code: "HEAVEN_CAST_EXECUTE_FAILED", message: error instanceof Error ? error.message : "Heaven CAST execute failed.", retryable: false }).catch(() => undefined); throw error; }
    finally { if (downloadedPath) await storage.cleanup(downloadedPath).catch(() => undefined); }
  });
  return locked.acquired ? locked.result! : { outcome: "SKIPPED", reason: "FILE_LOCK_BUSY" };
}
