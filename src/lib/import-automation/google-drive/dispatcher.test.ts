import { describe, expect, it, vi } from "vitest";
import { ImportDataType } from "@/generated/prisma/client";
import { dispatchDriveImport, resolveDispatchRoute, type ResolvedDriveFolderMapping } from "./dispatcher";

const mapping = (dataType: ImportDataType, metricHint: string | null = null): ResolvedDriveFolderMapping => ({
  id: "mapping-1", driveFolderId: "folder-1", displayName: "Test mapping", importDataType: dataType, metricHint, isActive: true, isFuture: false,
  importSource: { id: "source-1", name: "source", dataType, mediaType: "CTI", storeId: "store-1" }, store: { id: "store-1", code: "KASUKABE", shortName: "春日部" },
});
const file = { driveFileId: "file-1", folderId: "folder-1", displayName: "file.csv", fileName: "file.csv", localPath: "/tmp/file.csv", mimeType: "text/csv", sizeBytes: 10, createdTime: "2026-08-14T00:00:00Z", modifiedTime: "2026-08-14T00:00:00Z", driveMd5Checksum: null, sha256: "a", downloadedAt: "2026-08-14T00:00:00Z" };

describe("Google Drive Import Dispatcher", () => {
  it("routes CTI to manual review", () => expect(resolveDispatchRoute(mapping(ImportDataType.CTI_CAST_REPORT))).toMatchObject({ pipeline: "CTI", policy: "MANUAL_REVIEW" }));
  it("routes Town Store to AUTO", () => expect(resolveDispatchRoute(mapping(ImportDataType.TOWN_STORE))).toMatchObject({ pipeline: "TOWN_STORE", policy: "AUTO" }));
  it("routes Town Cast to manual review", () => expect(resolveDispatchRoute(mapping(ImportDataType.TOWN_CAST))).toMatchObject({ pipeline: "TOWN_CAST", policy: "MANUAL_REVIEW" }));
  it("routes Heaven Shop to AUTO", () => expect(resolveDispatchRoute(mapping(ImportDataType.HEAVEN_STORE))).toMatchObject({ pipeline: "HEAVEN_SHOP", policy: "AUTO" }));
  it("routes Heaven PAGE_ACCESS to manual review", () => expect(resolveDispatchRoute(mapping(ImportDataType.HEAVEN_CAST, "PAGE_ACCESS")).policy).toBe("MANUAL_REVIEW"));
  it("routes Heaven DIARY_POSTS to manual review", () => expect(resolveDispatchRoute(mapping(ImportDataType.HEAVEN_CAST, "DIARY_POSTS")).pipeline).toBe("HEAVEN_GIRL_DIARY"));
  it("blocks unsupported Heaven metrics", () => expect(resolveDispatchRoute(mapping(ImportDataType.HEAVEN_CAST, "MY_GIRL")).policy).toBe("BLOCKED"));
  it("blocks Town URL and LANDING", () => {
    expect(resolveDispatchRoute(mapping(ImportDataType.TOWN_URL)).policy).toBe("BLOCKED");
    expect(resolveDispatchRoute(mapping(ImportDataType.TOWN_LANDING)).policy).toBe("BLOCKED");
  });
  it("blocks inactive or future mappings", () => expect(resolveDispatchRoute({ ...mapping(ImportDataType.TOWN_STORE), isActive: false })).toMatchObject({ policy: "BLOCKED", reason: "INACTIVE_OR_FUTURE_MAPPING" }));
  it("returns route in RESOLVE_ONLY without calling Import", async () => {
    const executePipeline = vi.fn();
    const result = await dispatchDriveImport({ file, mapping: mapping(ImportDataType.TOWN_STORE) }, { mode: "RESOLVE_ONLY", executePipeline });
    expect(result).toMatchObject({ status: "REVIEW_REQUIRED", pipeline: "TOWN_STORE", policy: "AUTO", reviewReason: "RESOLVE_ONLY" });
    expect(executePipeline).not.toHaveBeenCalled();
  });
  it("requires manual review for a manual route even in execute mode", async () => {
    const executePipeline = vi.fn();
    const result = await dispatchDriveImport({ file, mapping: mapping(ImportDataType.CTI_CAST_REPORT) }, { mode: "EXECUTE", executePipeline });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(executePipeline).not.toHaveBeenCalled();
  });
  it("auto route is imported only when pipeline reports no issues", async () => {
    const executePipeline = vi.fn().mockResolvedValue({ importBatchId: "batch-1", status: "COMPLETED", warningCount: 0, pendingCount: 0, errorCount: 0 });
    const result = await dispatchDriveImport({ file, mapping: mapping(ImportDataType.TOWN_STORE) }, { mode: "EXECUTE", executePipeline });
    expect(result).toMatchObject({ status: "IMPORTED", autoConfirmed: true, importBatchId: "batch-1" });
  });
  it("falls back to review when AUTO validation has warnings", async () => {
    const result = await dispatchDriveImport({ file, mapping: mapping(ImportDataType.HEAVEN_STORE) }, { mode: "EXECUTE", executePipeline: vi.fn().mockResolvedValue({ importBatchId: "batch-1", status: "PREVIEW_READY", warningCount: 1 }) });
    expect(result).toMatchObject({ status: "REVIEW_REQUIRED", reviewReason: "PIPELINE_VALIDATION_REVIEW" });
  });
});
