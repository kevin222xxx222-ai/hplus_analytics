import { describe, expect, it, vi } from "vitest";
import { DriveFileStatus, ImportBatchStatus } from "@/generated/prisma/client";
import { syncDriveFileStateAfterConfirmedImport } from "./post-confirm-sync";

function dbFor(batch: unknown, state: unknown, updateCount = 1, updateError = false) {
  return {
    importBatch: { findUnique: vi.fn().mockResolvedValue(batch) },
    driveFileState: {
      findFirst: vi.fn().mockResolvedValue(state),
      updateMany: updateError ? vi.fn().mockRejectedValue(new Error("database unavailable")) : vi.fn().mockResolvedValue({ count: updateCount }),
    },
  };
}

const driveBatch = (status: ImportBatchStatus = ImportBatchStatus.COMPLETED) => ({ id: "batch-1", status, metadata: { origin: "GOOGLE_DRIVE", driveFileId: "drive-file-1" } });
const reviewState = (overrides: Record<string, unknown> = {}) => ({ id: "state-1", status: DriveFileStatus.REVIEW_REQUIRED, lastSuccessfulImportBatchId: null, ...overrides });
const unlocked = async <T>(_name: string, operation: () => Promise<T>) => ({ acquired: true, result: await operation() });

describe("post-confirm Drive state synchronization", () => {
  it.each([ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS])("syncs %s to IMPORTED", async (status) => {
    const db = dbFor(driveBatch(status), reviewState());
    const result = await syncDriveFileStateAfterConfirmedImport("batch-1", db as never, unlocked);
    expect(result.status).toBe("SYNCED");
    expect(db.driveFileState.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: DriveFileStatus.REVIEW_REQUIRED, lastImportBatchId: "batch-1" }), data: expect.objectContaining({ status: DriveFileStatus.IMPORTED, lastSuccessfulImportBatchId: "batch-1" }) }));
  });

  it.each([ImportBatchStatus.WAITING_FOR_CAST_LINK, ImportBatchStatus.PREVIEW_READY, ImportBatchStatus.FAILED])("does not sync unconfirmed %s", async (status) => {
    const db = dbFor(driveBatch(status), reviewState());
    expect((await syncDriveFileStateAfterConfirmedImport("batch-1", db as never, unlocked)).reason).toBe("BATCH_NOT_CONFIRMED");
    expect(db.driveFileState.updateMany).not.toHaveBeenCalled();
  });

  it("does not affect a non-Drive batch", async () => {
    const db = dbFor({ ...driveBatch(), metadata: { origin: "MANUAL_UPLOAD" } }, reviewState());
    expect((await syncDriveFileStateAfterConfirmedImport("batch-1", db as never, unlocked)).reason).toBe("NON_DRIVE_BATCH");
  });

  it("is idempotent after synchronization", async () => {
    const db = dbFor(driveBatch(), reviewState({ status: DriveFileStatus.IMPORTED, lastSuccessfulImportBatchId: "batch-1" }));
    expect((await syncDriveFileStateAfterConfirmedImport("batch-1", db as never, unlocked)).reason).toBe("ALREADY_SYNCED");
    expect(db.driveFileState.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a different state status", async () => {
    const db = dbFor(driveBatch(), reviewState({ status: DriveFileStatus.READY }));
    expect((await syncDriveFileStateAfterConfirmedImport("batch-1", db as never, unlocked)).status).toBe("CONFLICT");
  });

  it("returns a failure without changing the confirmed batch", async () => {
    const db = dbFor(driveBatch(), reviewState(), 1, true);
    const result = await syncDriveFileStateAfterConfirmedImport("batch-1", db as never, unlocked);
    expect(result.status).toBe("FAILED");
  });
});
