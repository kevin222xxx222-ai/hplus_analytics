import { describe, expect, it } from "vitest";
import { castMetricFormats, castMetricLabels, castMetricKeys } from "@/lib/analytics/ui/cast-view-model";

describe("Cast Analytics view model", () => {
  it("exposes only API-backed metrics with display formats", () => {
    expect(castMetricKeys).toContain("sales");
    expect(castMetricKeys).toContain("townPv");
    expect(castMetricKeys).toContain("heavenAccess");
    expect(castMetricLabels.sales).toBe("売上");
    expect(castMetricFormats.salesPerHour).toBe("hourly");
  });
});
