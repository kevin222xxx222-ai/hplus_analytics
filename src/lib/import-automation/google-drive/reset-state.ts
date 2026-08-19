import { DriveFileStatus, ImportDataType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { driveFileLockName, withAdvisoryLock } from "./advisory-lock";
import { transitionDriveFileState } from "./file-state-service";

export type ResetDriveFileStateInput = { driveFileId: string; confirmProduction?: boolean; dryRun?: boolean };
export type ResetDriveFileStateResult = { outcome: "RESET" | "DRY_RUN" | "SKIPPED"; driveFileId: string; from: DriveFileStatus; to: DriveFileStatus; reason?: string };

export function validateResetDriveFileStateInput(input: Pick<ResetDriveFileStateInput, "driveFileId">) {
  if (!input.driveFileId.trim()) throw new Error("--drive-file-id is required.");
}

export function assertResetProductionExecution(environment: string | undefined, confirmProduction: boolean) {
  if (environment === "production" && !confirmProduction) throw new Error("Production reset requires --confirm-production.");
}

export function assertResettableDriveFileState(state: {
  status: DriveFileStatus;
  lastImportBatchId: string | null;
  lastSuccessfulImportBatchId: string | null;
  isTrashed: boolean;
  sha256: string | null;
  driveFolderMapping: { isActive: boolean; isFuture: boolean; importDataType: ImportDataType } | null;
}) {
  if (state.status !== DriveFileStatus.REVIEW_REQUIRED) throw new Error(`Only REVIEW_REQUIRED state can be reset; current state is ${state.status}.`);
  if (state.lastImportBatchId) throw new Error("Reset is blocked because a Manual Review ImportBatch is attached.");
  if (state.lastSuccessfulImportBatchId) throw new Error("Reset is blocked because a successful ImportBatch is attached.");
  if (!state.driveFolderMapping) throw new Error("Reset requires a DriveFolderMapping.");
  if (!state.driveFolderMapping.isActive || state.driveFolderMapping.isFuture) throw new Error("Reset requires an active, non-future DriveFolderMapping.");
  if (state.isTrashed) throw new Error("Trashed Drive files cannot be reset.");
  if (!state.sha256) throw new Error("Reset requires a stored SHA-256.");
}

export async function resetDriveFileState(input: ResetDriveFileStateInput): Promise<ResetDriveFileStateResult> {
  validateResetDriveFileStateInput(input);
  assertResetProductionExecution(process.env.GOOGLE_DRIVE_AUTOMATION_ENV, Boolean(input.confirmProduction));
  const locked = await withAdvisoryLock<ResetDriveFileStateResult>(driveFileLockName(input.driveFileId), async () => {
    const state = await prisma.driveFileState.findUnique({ where: { driveFileId: input.driveFileId }, include: { driveFolderMapping: true } });
    if (!state) throw new Error("DriveFileState was not found.");
    assertResettableDriveFileState(state);
    if (input.dryRun) return { outcome: "DRY_RUN", driveFileId: input.driveFileId, from: state.status, to: DriveFileStatus.READY };
    await transitionDriveFileState(state.id, DriveFileStatus.READY, { lastErrorCategory: null, lastErrorCode: null, lastErrorMessage: null, nextRetryAt: null });
    return { outcome: "RESET", driveFileId: input.driveFileId, from: state.status, to: DriveFileStatus.READY };
  });
  return locked.acquired ? locked.result! : { outcome: "SKIPPED", driveFileId: input.driveFileId, from: DriveFileStatus.REVIEW_REQUIRED, to: DriveFileStatus.READY, reason: "FILE_LOCK_BUSY" };
}
