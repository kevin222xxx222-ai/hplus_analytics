import { DriveFileStatus, ImportBatchStatus, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { driveFileLockName, withAdvisoryLock } from "./advisory-lock";

type SyncDb = Pick<PrismaClient, "importBatch" | "driveFileState">;
type SyncLock = <T>(name: string, operation: () => Promise<T>) => Promise<{ acquired: boolean; result?: T }>;

export type DrivePostConfirmSyncResult = {
  status: "SYNCED" | "NOOP" | "CONFLICT" | "FAILED";
  batchId: string;
  driveFileStateId?: string;
  reason: string;
};

const successfulStatuses = new Set<ImportBatchStatus>([ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS]);

function isDriveMetadata(value: unknown): value is { origin: "GOOGLE_DRIVE" } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as { origin?: unknown }).origin === "GOOGLE_DRIVE");
}

export async function syncDriveFileStateAfterConfirmedImport(batchId: string, db: SyncDb = prisma, lock: SyncLock = withAdvisoryLock): Promise<DrivePostConfirmSyncResult> {
  const batch = await db.importBatch.findUnique({ where: { id: batchId }, select: { id: true, status: true, metadata: true } });
  if (!batch) return { status: "FAILED", batchId, reason: "BATCH_NOT_FOUND" };
  if (!isDriveMetadata(batch.metadata)) return { status: "NOOP", batchId, reason: "NON_DRIVE_BATCH" };
  if (!successfulStatuses.has(batch.status)) return { status: "NOOP", batchId, reason: "BATCH_NOT_CONFIRMED" };
  const driveFileId = typeof batch.metadata === "object" && batch.metadata !== null && "driveFileId" in batch.metadata && typeof batch.metadata.driveFileId === "string" ? batch.metadata.driveFileId : "";
  if (!driveFileId) return { status: "NOOP", batchId, reason: "DRIVE_IDENTITY_MISSING" };

  const locked = await lock(driveFileLockName(driveFileId), async () => {
    const state = await db.driveFileState.findFirst({ where: { lastImportBatchId: batchId }, select: { id: true, status: true, lastSuccessfulImportBatchId: true } });
    if (!state) return { status: "NOOP", batchId, reason: "DRIVE_STATE_NOT_LINKED" } satisfies DrivePostConfirmSyncResult;
    if (state.status === DriveFileStatus.IMPORTED && state.lastSuccessfulImportBatchId === batchId) return { status: "NOOP", batchId, driveFileStateId: state.id, reason: "ALREADY_SYNCED" } satisfies DrivePostConfirmSyncResult;
    if (state.status !== DriveFileStatus.REVIEW_REQUIRED) return { status: "CONFLICT", batchId, driveFileStateId: state.id, reason: "STATE_NOT_REVIEW_REQUIRED" } satisfies DrivePostConfirmSyncResult;
    try {
      const updated = await db.driveFileState.updateMany({
        where: { id: state.id, status: DriveFileStatus.REVIEW_REQUIRED, lastImportBatchId: batchId },
        data: { status: DriveFileStatus.IMPORTED, lastSuccessfulImportBatchId: batchId, lastImportedAt: new Date(), lastErrorCategory: null, lastErrorCode: null, lastErrorMessage: null, nextRetryAt: null },
      });
      if (updated.count !== 1) return { status: "CONFLICT", batchId, driveFileStateId: state.id, reason: "STATE_CHANGED_DURING_SYNC" } satisfies DrivePostConfirmSyncResult;
      return { status: "SYNCED", batchId, driveFileStateId: state.id, reason: "CONFIRMED_IMPORT" } satisfies DrivePostConfirmSyncResult;
    } catch {
      return { status: "FAILED", batchId, driveFileStateId: state.id, reason: "SYNC_WRITE_FAILED" } satisfies DrivePostConfirmSyncResult;
    }
  });
  return locked.acquired ? locked.result! : { status: "NOOP", batchId, reason: "FILE_LOCK_BUSY" };
}
