import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApi = vi.fn();
const scanCtiBulkFolder = vi.fn();
const processCtiBulkFile = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, requireAdminApi };
});
vi.mock("@/lib/imports/cti/bulk-service", () => ({ scanCtiBulkFolder, processCtiBulkFile }));

describe("CTI bulk API authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects VIEWER before scanning the configured folder", async () => {
    const { ApiError } = await import("@/lib/api");
    requireAdminApi.mockRejectedValueOnce(new ApiError("ADMIN権限が必要です。", 403));
    const { GET } = await import("@/app/api/imports/cti/bulk/scan/route");
    const response = await GET();
    expect(response.status).toBe(403);
    expect(scanCtiBulkFolder).not.toHaveBeenCalled();
  });

  it("rejects VIEWER before processing a file", async () => {
    const { ApiError } = await import("@/lib/api");
    requireAdminApi.mockRejectedValueOnce(new ApiError("ADMIN権限が必要です。", 403));
    const { POST } = await import("@/app/api/imports/cti/bulk/process/route");
    const request = new Request("http://localhost/api/imports/cti/bulk/process", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ key: "file.xlsx", action: "VALIDATE" }) });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(processCtiBulkFile).not.toHaveBeenCalled();
  });

  it("processes exactly one file and returns request timing", async () => {
    requireAdminApi.mockResolvedValueOnce({ id: "admin" });
    processCtiBulkFile.mockResolvedValueOnce({
      key: "file.xlsx", outcome: "VALIDATED", batchId: "batch", status: "PREVIEW_READY",
      pendingCount: 0, warningCount: 0, errorCount: 0, ambiguousCount: 0, unmatchedCount: 0,
      importableCount: 1, autoConfirmSafe: true, message: "ok",
    });
    const { POST } = await import("@/app/api/imports/cti/bulk/process/route");
    const request = new Request("http://localhost/api/imports/cti/bulk/process", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ key: "file.xlsx", action: "VALIDATE" }) });
    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(processCtiBulkFile).toHaveBeenCalledTimes(1);
    expect(processCtiBulkFile).toHaveBeenCalledWith({ key: "file.xlsx", action: "VALIDATE", uploadedByUserId: "admin" });
    expect(body.request).toMatchObject({ apiUrl: "/api/imports/cti/bulk/process" });
    expect(response.headers.get("server-timing")).toContain("cti-bulk-process");
  });
});
