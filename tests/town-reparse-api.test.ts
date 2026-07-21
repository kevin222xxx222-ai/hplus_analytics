import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApi = vi.fn();
const reparseTownBatch = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, requireAdminApi };
});
vi.mock("@/lib/imports/town/reparse-service", () => ({ reparseTownBatch }));

describe("Town reparse API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects VIEWER before reparse", async () => {
    const { ApiError } = await import("@/lib/api");
    requireAdminApi.mockRejectedValueOnce(new ApiError("ADMIN権限が必要です。", 403));
    const { POST } = await import("@/app/api/imports/town/[id]/reparse/route");
    const request = new Request("http://localhost/api/imports/town/batch/reparse", { method: "POST", headers: { origin: "http://localhost" } });
    const response = await POST(request, { params: Promise.resolve({ id: "batch" }) });
    expect(response.status).toBe(403);
    expect(reparseTownBatch).not.toHaveBeenCalled();
  });

  it("runs exactly one batch for ADMIN", async () => {
    requireAdminApi.mockResolvedValueOnce({ id: "admin" });
    reparseTownBatch.mockResolvedValueOnce({ batchId: "batch", status: "PREVIEW_READY" });
    const { POST } = await import("@/app/api/imports/town/[id]/reparse/route");
    const request = new Request("http://localhost/api/imports/town/batch/reparse", { method: "POST", headers: { origin: "http://localhost" } });
    const response = await POST(request, { params: Promise.resolve({ id: "batch" }) });
    expect(response.status).toBe(200);
    expect(reparseTownBatch).toHaveBeenCalledOnce();
    expect(reparseTownBatch).toHaveBeenCalledWith("batch");
  });
});
