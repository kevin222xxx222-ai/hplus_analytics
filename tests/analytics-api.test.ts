import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getPerformance = vi.fn();
const getTrend = vi.fn();
const getTime = vi.fn();

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/analytics/integration", () => ({ getPerformance, getTrend, getTime, parseAnalyticsParams: (params: URLSearchParams) => ({ from: params.get("from"), to: params.get("to") }) }));

describe("Analytics GET APIs", () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: "viewer", role: "VIEWER" }); });

  it("allows authenticated VIEWER and keeps controller thin", async () => {
    getPerformance.mockResolvedValue({ period: { from: "2026-06-01", to: "2026-06-30" }, casts: [{ castId: "cast", summary: { growth: { classification: "Data不足", availability: "INSUFFICIENT_SAMPLE" }, nextBestAction: { actionLevel: "NONE", action: null } } }] });
    const { GET } = await import("@/app/api/analytics/performance/route");
    const response = await GET(new Request("http://localhost/api/analytics/performance?from=2026-06-01&to=2026-06-30"));
    expect(response.status).toBe(200);
    expect(getPerformance).toHaveBeenCalledWith({ from: "2026-06-01", to: "2026-06-30" });
    expect((await response.json()).casts[0].summary.nextBestAction.actionLevel).toBe("NONE");
  });

  it("returns auth error without querying when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await import("@/app/api/analytics/time/route");
    const response = await GET(new Request("http://localhost/api/analytics/time?from=2026-06-01&to=2026-06-30"));
    expect(response.status).toBe(401);
    expect(getTime).not.toHaveBeenCalled();
  });

  it("passes trend and time requests to integration services", async () => {
    getTrend.mockResolvedValue({ trend: null });
    getTime.mockResolvedValue({ weekdays: [] });
    const trend = await import("@/app/api/analytics/trend/route");
    const time = await import("@/app/api/analytics/time/route");
    await trend.GET(new Request("http://localhost/api/analytics/trend?from=2026-06-01&to=2026-06-30"));
    await time.GET(new Request("http://localhost/api/analytics/time?from=2026-06-01&to=2026-06-30"));
    expect(getTrend).toHaveBeenCalledTimes(1);
    expect(getTime).toHaveBeenCalledTimes(1);
  });
});
