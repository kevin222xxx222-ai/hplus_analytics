import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const renameCast = vi.fn();
const executeCastMerge = vi.fn();
const buildCastStartDateBulkPreview = vi.fn();
const executeCastStartDateBulkChange = vi.fn();

vi.mock("@/lib/auth", () => ({ requireAdmin }));
vi.mock("@/lib/casts/name-service", () => ({ renameCast }));
vi.mock("@/lib/casts/merge-service", () => ({ executeCastMerge }));
vi.mock("@/lib/casts/start-date-bulk-service", () => ({ buildCastStartDateBulkPreview, executeCastStartDateBulkChange }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("updateCastDisplayNameAction authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("rejects the update before mutation when the caller is not ADMIN", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT: forbidden"));
    const { updateCastDisplayNameAction } = await import("@/app/actions/masters");
    const formData = new FormData();
    formData.set("id", "00000000-0000-4000-8000-000000000001");
    formData.set("displayName", "みゆ");
    formData.set("confirmDuplicate", "false");
    await expect(updateCastDisplayNameAction(formData)).rejects.toThrow("forbidden");
    expect(renameCast).not.toHaveBeenCalled();
  });

  it("rejects a merge before mutation when the caller is not ADMIN", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT: forbidden"));
    const { executeCastMergeAction } = await import("@/app/actions/masters");
    const formData = new FormData();
    formData.set("sourceCastId", "00000000-0000-4000-8000-000000000001");
    formData.set("targetCastId", "00000000-0000-4000-8000-000000000002");
    formData.set("expectedFingerprint", "0".repeat(64));
    formData.set("displayName", "みほ");
    formData.set("startedOn", "2026-07-13");
    formData.set("confirmation", "MERGE");
    await expect(executeCastMergeAction(formData)).rejects.toThrow("forbidden");
    expect(executeCastMerge).not.toHaveBeenCalled();
  });

  it("rejects bulk preview and execution before reading or mutating when the caller is not ADMIN", async () => {
    const { previewCastStartDateBulkChangeAction, executeCastStartDateBulkChangeAction } = await import("@/app/actions/masters");
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT: forbidden"));
    await expect(previewCastStartDateBulkChangeAction({ castIds: ["00000000-0000-4000-8000-000000000001"], expectedSelectionCount: 1, targetDate: "2026-04-01", mediaScope: "ALL" })).rejects.toThrow("forbidden");
    expect(buildCastStartDateBulkPreview).not.toHaveBeenCalled();
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT: forbidden"));
    await expect(executeCastStartDateBulkChangeAction({ castIds: ["00000000-0000-4000-8000-000000000001"], targetDate: "2026-04-01", mediaScope: "ALL", expectedFingerprint: "0".repeat(64), reason: "test" })).rejects.toThrow("forbidden");
    expect(executeCastStartDateBulkChange).not.toHaveBeenCalled();
  });

  it("passes all 115 selected IDs to bulk preview and reports the received count", async () => {
    const castIds = Array.from({ length: 115 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
    requireAdmin.mockResolvedValueOnce({ id: "admin" });
    buildCastStartDateBulkPreview.mockResolvedValueOnce({ castIds, castChanges: [], aliasChanges: [] });
    const { previewCastStartDateBulkChangeAction } = await import("@/app/actions/masters");
    const result = await previewCastStartDateBulkChangeAction({ castIds, expectedSelectionCount: 115, targetDate: "2026-04-01", mediaScope: "ALL" });
    expect(buildCastStartDateBulkPreview).toHaveBeenCalledWith({ castIds, targetDate: "2026-04-01", mediaScope: "ALL" });
    expect(result.receivedSelectionCount).toBe(115);
  });

  it("shows an input error and stops before preview when selection counts differ", async () => {
    requireAdmin.mockResolvedValueOnce({ id: "admin" });
    const { previewCastStartDateBulkChangeAction } = await import("@/app/actions/masters");
    await expect(previewCastStartDateBulkChangeAction({
      castIds: ["00000000-0000-4000-8000-000000000001"],
      expectedSelectionCount: 2,
      targetDate: "2026-04-01",
      mediaScope: "ALL",
    })).rejects.toThrow();
    expect(buildCastStartDateBulkPreview).not.toHaveBeenCalled();
  });
});
