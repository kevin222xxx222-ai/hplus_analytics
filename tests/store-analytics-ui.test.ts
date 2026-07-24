import { describe, expect, it } from "vitest";
import { STORE_METRICS, storeMetricAvailability } from "@/lib/analytics/ui/store-view-model";

describe("store analytics view model", () => {
  it("exposes the required store metrics", () => {
    expect(STORE_METRICS.map(([key]) => key)).toEqual(expect.arrayContaining(["sales", "castReward", "attendancePeople", "salesPerHour", "townPv", "townUu", "heavenAccess"]));
  });
  it("distinguishes zero from missing", () => {
    const summary = { volume: { metrics: { sales: 0 }, metricAvailability: {} }, efficiency: {}, sample: {} } as never;
    expect(storeMetricAvailability(summary, "sales")).toBe("ZERO");
    expect(storeMetricAvailability(summary, "townPv")).toBe("MISSING");
  });
});
