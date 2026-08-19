import { describe, expect, it, vi } from "vitest";
import { DriveFailureCategory, DriveFileStatus } from "@/generated/prisma/client";
import {
  assertDriveFileStateTransition,
  classifyDriveFileUpdate,
  getDriveFileStateByDriveFileId,
  listPendingDriveFileStates,
  listRetryPendingDriveFileStates,
  markDriveFileFailure,
  transitionDriveFileState,
  upsertDetectedDriveFile,
} from "./file-state-service";

type FakeDb = {
  driveFileState: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  driveFolderMapping: { findUnique: ReturnType<typeof vi.fn> };
};

const mapping = { id: "mapping-1", driveFolderId: "folder-1", isActive: true, isFuture: false };
const input = (overrides: Record<string, unknown> = {}) => ({
  driveFileId: "file-1", folderId: "folder-1", fileName: "report.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  sizeBytes: 20, driveMd5Checksum: "12345678901234567890123456789012", sha256: "a".repeat(64),
  createdTime: "2026-08-14T00:00:00.000Z", modifiedTime: "2026-08-14T01:00:00.000Z", mappingId: "mapping-1", ...overrides,
});
const dbFor = (state: unknown = null, mappingValue: unknown = mapping): FakeDb => ({
  driveFileState: { findUnique: vi.fn().mockResolvedValue(state), create: vi.fn().mockImplementation(({ data }) => ({ id: "state-1", ...data })), update: vi.fn().mockImplementation(({ data }) => ({ id: "state-1", ...data })) , findMany: vi.fn().mockResolvedValue([]) },
  driveFolderMapping: { findUnique: vi.fn().mockResolvedValue(mappingValue) },
});

describe("DriveFileState service", () => {
  it("creates first detection as DETECTED", async () => {
    const db = dbFor();
    const result = await upsertDetectedDriveFile(input(), db as never);
    expect(result.status).toBe(DriveFileStatus.DETECTED);
    expect(db.driveFileState.create).toHaveBeenCalledOnce();
  });

  it("creates an unmapped file safely as UNMAPPED", async () => {
    const db = dbFor(null, null);
    const result = await upsertDetectedDriveFile(input({ mappingId: null }), db as never);
    expect(result.status).toBe(DriveFileStatus.UNMAPPED);
  });

  it("updates the same file without changing state when modifiedTime is unchanged", async () => {
    const state = { id: "state-1", driveFileId: "file-1", folderId: "folder-1", driveFolderMappingId: "mapping-1", driveModifiedTime: new Date("2026-08-14T01:00:00.000Z"), sha256: "a".repeat(64), status: DriveFileStatus.IMPORTED, isTrashed: false };
    const db = dbFor(state);
    const result = await upsertDetectedDriveFile(input({ fileName: "renamed.xlsx" }), db as never);
    expect(result.status).toBe(DriveFileStatus.IMPORTED);
    expect(result.fileName).toBe("renamed.xlsx");
  });

  it("marks imported content as DETECTED when modifiedTime changes", async () => {
    const state = { id: "state-1", driveFileId: "file-1", folderId: "folder-1", driveFolderMappingId: "mapping-1", driveModifiedTime: new Date("2026-08-14T01:00:00.000Z"), sha256: "a".repeat(64), status: DriveFileStatus.IMPORTED, isTrashed: false };
    const db = dbFor(state);
    const result = await upsertDetectedDriveFile(input({ modifiedTime: "2026-08-14T02:00:00.000Z", sha256: "b".repeat(64) }), db as never);
    expect(result.status).toBe(DriveFileStatus.DETECTED);
  });

  it("requires review when a file moves Folder", async () => {
    const state = { id: "state-1", driveFileId: "file-1", folderId: "folder-1", driveFolderMappingId: "mapping-1", driveModifiedTime: new Date("2026-08-14T01:00:00.000Z"), sha256: null, status: DriveFileStatus.IMPORTED, isTrashed: false };
    const db = dbFor(state, { ...mapping, id: "mapping-2", driveFolderId: "folder-2" });
    const result = await upsertDetectedDriveFile(input({ folderId: "folder-2", mappingId: "mapping-2" }), db as never);
    expect(result.status).toBe(DriveFileStatus.REVIEW_REQUIRED);
  });

  it("classifies modified metadata with unchanged SHA as content_unchanged", () => {
    expect(classifyDriveFileUpdate({ driveModifiedTime: new Date("2026-08-14T01:00:00Z"), sha256: "a" }, { modifiedTime: "2026-08-14T02:00:00Z", sha256: "a" })).toBe("content_unchanged");
  });

  it("accepts valid state transition", async () => {
    const db = dbFor({ id: "state-1", status: DriveFileStatus.DETECTED });
    const result = await transitionDriveFileState("state-1", DriveFileStatus.DOWNLOADING, {}, db as never);
    expect(result.status).toBe(DriveFileStatus.DOWNLOADING);
  });

  it("rejects invalid state transition", async () => {
    const db = dbFor({ id: "state-1", status: DriveFileStatus.DETECTED });
    await expect(transitionDriveFileState("state-1", DriveFileStatus.IMPORTED, {}, db as never)).rejects.toThrow("Invalid DriveFileState transition");
    expect(() => assertDriveFileStateTransition(DriveFileStatus.IMPORTED, DriveFileStatus.IMPORTING)).toThrow();
  });

  it("records retryable failure metadata", async () => {
    const db = dbFor({ id: "state-1", status: DriveFileStatus.DOWNLOADING });
    const nextRetryAt = new Date("2026-08-14T02:00:00Z");
    const result = await markDriveFileFailure("state-1", { category: DriveFailureCategory.TRANSIENT_API, code: "TIMEOUT", message: "temporary", retryable: true, nextRetryAt }, db as never);
    expect(result.status).toBe(DriveFileStatus.FAILED_RETRYABLE);
    expect(result.lastErrorCategory).toBe(DriveFailureCategory.TRANSIENT_API);
  });

  it("records final failure without a retry time", async () => {
    const db = dbFor({ id: "state-1", status: DriveFileStatus.IMPORTING });
    const result = await markDriveFileFailure("state-1", { category: DriveFailureCategory.VALIDATION, retryable: false }, db as never);
    expect(result.status).toBe(DriveFileStatus.FAILED_FINAL);
    expect(result.nextRetryAt).toBeNull();
  });

  it("queries a state by unique driveFileId", async () => {
    const db = dbFor({ driveFileId: "file-1" });
    await getDriveFileStateByDriveFileId("file-1", db as never);
    expect(db.driveFileState.findUnique).toHaveBeenCalledWith({ where: { driveFileId: "file-1" } });
  });

  it("queries pending DETECTED, READY and due retryable states", async () => {
    const db = dbFor();
    await listPendingDriveFileStates(new Date("2026-08-14T03:00:00Z"), db as never);
    expect(db.driveFileState.findMany).toHaveBeenCalledOnce();
    const call = db.driveFileState.findMany.mock.calls[0][0];
    expect(call.where.OR).toHaveLength(3);
  });

  it("queries retry-only FAILED_RETRYABLE states with due or null retry time", async () => {
    const db = dbFor();
    const now = new Date("2026-08-14T03:00:00Z");
    await listRetryPendingDriveFileStates(now, db as never);
    const call = db.driveFileState.findMany.mock.calls[0][0];
    expect(call.where.status).toBe(DriveFileStatus.FAILED_RETRYABLE);
    expect(call.where.OR).toEqual([{ nextRetryAt: null }, { nextRetryAt: { lte: now } }]);
  });
});
