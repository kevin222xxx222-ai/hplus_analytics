import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApi = vi.fn();
const analyzeTownBulkLinkCandidates = vi.fn();
const executeTownBulkLinks = vi.fn();
const executeTownBulkLinkCandidate = vi.fn();
const inspectTownBulkLinkImpact = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, requireAdminApi };
});
vi.mock("@/lib/imports/security", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/imports/town/bulk-link-service", () => ({ analyzeTownBulkLinkCandidates, executeTownBulkLinks, executeTownBulkLinkCandidate, inspectTownBulkLinkImpact }));

describe("Town CTI-based bulk link API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the read-only preview for ADMIN", async () => {
    requireAdminApi.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", role: "ADMIN" });
    analyzeTownBulkLinkCandidates.mockResolvedValue({ fingerprint: "a".repeat(64), categories: {} });
    const { POST } = await import("@/app/api/imports/town/bulk/link-candidates/route");
    const response = await POST(new Request("http://localhost/api/imports/town/bulk/link-candidates", { method: "POST", body: JSON.stringify({ action: "PREVIEW" }) }));
    expect(response.status).toBe(200);
    expect(analyzeTownBulkLinkCandidates).toHaveBeenCalledOnce();
    expect(executeTownBulkLinks).not.toHaveBeenCalled();
  });

  it("rejects legacy A/B bulk execution during Phase 2", async () => {
    requireAdminApi.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", role: "ADMIN" });
    const { POST } = await import("@/app/api/imports/town/bulk/link-candidates/route");
    const response = await POST(new Request("http://localhost/api/imports/town/bulk/link-candidates", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "EXECUTE", category: "B", candidateKeys: ["candidate"], fingerprint: "a".repeat(64) }),
    }));
    expect(response.status).toBe(409);
    expect(executeTownBulkLinks).not.toHaveBeenCalled();
  });

  it("passes a single C candidate execution to the Phase 2 service", async () => {
    requireAdminApi.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", role: "ADMIN" });
    executeTownBulkLinkCandidate.mockResolvedValue({ resolvedRows: 3, affectedBatchCount: 2 });
    const { POST } = await import("@/app/api/imports/town/bulk/link-candidates/route");
    const response = await POST(new Request("http://localhost/api/imports/town/bulk/link-candidates", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "EXECUTE_CANDIDATE", candidateKey: "store:name", fingerprint: "a".repeat(64), operation: "EXISTING", targetCastId: "22222222-2222-4222-8222-222222222222" }),
    }));
    expect(response.status).toBe(200);
    expect(executeTownBulkLinkCandidate).toHaveBeenCalledWith(expect.objectContaining({ operation: "EXISTING", userId: "11111111-1111-4111-8111-111111111111" }));
  });

  it("passes an ID_FORMAT SKIP execution with its reason to the Phase 2 service", async () => {
    requireAdminApi.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", role: "ADMIN" });
    executeTownBulkLinkCandidate.mockResolvedValue({ skippedRows: 4, affectedBatchCount: 2 });
    const { POST } = await import("@/app/api/imports/town/bulk/link-candidates/route");
    const response = await POST(new Request("http://localhost/api/imports/town/bulk/link-candidates", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "EXECUTE_CANDIDATE", candidateKey: "store:ID:5297063", fingerprint: "a".repeat(64), operation: "SKIP", skipReason: "元URL確認済み・人物特定不能" }),
    }));
    expect(response.status).toBe(200);
    expect(executeTownBulkLinkCandidate).toHaveBeenCalledWith(expect.objectContaining({ operation: "SKIP", skipReason: "元URL確認済み・人物特定不能", userId: "11111111-1111-4111-8111-111111111111" }));
  });

  it("passes the SKIP reason through impact preview validation", async () => {
    requireAdminApi.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", role: "ADMIN" });
    inspectTownBulkLinkImpact.mockResolvedValue({ operation: "SKIP", executable: true });
    const { POST } = await import("@/app/api/imports/town/bulk/link-candidates/route");
    const response = await POST(new Request("http://localhost/api/imports/town/bulk/link-candidates", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "IMPACT_PREVIEW", candidateKey: "store:ID:5297063", fingerprint: "a".repeat(64), operation: "SKIP", skipReason: "元URL確認済み・人物特定不能" }),
    }));
    expect(response.status).toBe(200);
    expect(inspectTownBulkLinkImpact).toHaveBeenCalledWith(expect.objectContaining({ operation: "SKIP", skipReason: "元URL確認済み・人物特定不能" }));
  });

  it("does not reach preview or execution when authorization fails", async () => {
    const { ApiError } = await import("@/lib/api");
    requireAdminApi.mockRejectedValue(new ApiError("ADMIN権限が必要です。", 403));
    const { POST } = await import("@/app/api/imports/town/bulk/link-candidates/route");
    const response = await POST(new Request("http://localhost/api/imports/town/bulk/link-candidates", { method: "POST", body: JSON.stringify({ action: "PREVIEW" }) }));
    expect(response.status).toBe(403);
    expect(analyzeTownBulkLinkCandidates).not.toHaveBeenCalled();
    expect(executeTownBulkLinks).not.toHaveBeenCalled();
  });
});
