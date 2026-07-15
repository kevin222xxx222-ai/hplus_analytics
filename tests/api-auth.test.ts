import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser }));

describe("import API authorization", () => {
  beforeEach(() => getCurrentUser.mockReset());

  it("rejects VIEWER", async () => {
    getCurrentUser.mockResolvedValue({ id: "viewer", role: "VIEWER" });
    const { requireAdminApi } = await import("@/lib/api");
    await expect(requireAdminApi()).rejects.toMatchObject({ status: 403 });
  });

  it("accepts ADMIN", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin", role: "ADMIN" });
    const { requireAdminApi } = await import("@/lib/api");
    await expect(requireAdminApi()).resolves.toMatchObject({ id: "admin" });
  });
});
