import { describe, expect, it } from "vitest";
import { DriveFileStatus, ImportDataType } from "@/generated/prisma/client";
import { assertResetProductionExecution, assertResettableDriveFileState, validateResetDriveFileStateInput } from "./reset-state";

const state = (overrides: Record<string, unknown> = {}) => ({ status: DriveFileStatus.REVIEW_REQUIRED, lastImportBatchId: null, lastSuccessfulImportBatchId: null, isTrashed: false, sha256: "sha256", driveFolderMapping: { isActive: true, isFuture: false, importDataType: ImportDataType.TOWN_CAST }, ...overrides });

describe("DriveFileState operator reset", () => {
  it("allows a batchless REVIEW_REQUIRED state", () => expect(() => assertResettableDriveFileState(state())).not.toThrow());
  it.each([
    ["attached import batch", { lastImportBatchId: "batch" }],
    ["attached successful batch", { lastSuccessfulImportBatchId: "batch" }],
    ["inactive mapping", { driveFolderMapping: { isActive: false, isFuture: false, importDataType: ImportDataType.TOWN_CAST } }],
    ["future mapping", { driveFolderMapping: { isActive: true, isFuture: true, importDataType: ImportDataType.TOWN_CAST } }],
    ["missing mapping", { driveFolderMapping: null }],
    ["trashed file", { isTrashed: true }],
    ["missing SHA", { sha256: null }],
    ["READY state", { status: DriveFileStatus.READY }],
    ["IMPORTED state", { status: DriveFileStatus.IMPORTED }],
  ])("rejects %s", (_name, overrides) => expect(() => assertResettableDriveFileState(state(overrides))).toThrow());
  it("requires a file id and production confirmation", () => { expect(() => validateResetDriveFileStateInput({ driveFileId: "" })).toThrow("--drive-file-id"); expect(() => assertResetProductionExecution("production", false)).toThrow("--confirm-production"); expect(() => assertResetProductionExecution("production", true)).not.toThrow(); });
});
