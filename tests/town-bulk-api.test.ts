import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApi = vi.fn();
const scanTownBulkFolders = vi.fn();
const processTownBulkFile = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, requireAdminApi };
});
vi.mock("@/lib/imports/town/bulk-service", () => ({ scanTownBulkFolders, processTownBulkFile }));

describe("Town bulk API authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects VIEWER before scanning folders", async () => {
    const { ApiError } = await import("@/lib/api");
    requireAdminApi.mockRejectedValueOnce(new ApiError("ADMIN権限が必要です。", 403));
    const { GET } = await import("@/app/api/imports/town/bulk/scan/route");
    const response = await GET();
    expect(response.status).toBe(403);
    expect(scanTownBulkFolders).not.toHaveBeenCalled();
  });

  it("rejects VIEWER before processing a file", async () => {
    const { ApiError } = await import("@/lib/api");
    requireAdminApi.mockRejectedValueOnce(new ApiError("ADMIN権限が必要です。", 403));
    const { POST } = await import("@/app/api/imports/town/bulk/process/route");
    const request = new Request("http://localhost/api/imports/town/bulk/process", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ key: "KASUKABE:test.csv", action: "VALIDATE" }) });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(processTownBulkFile).not.toHaveBeenCalled();
  });
});
