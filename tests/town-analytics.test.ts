import { describe, expect, it } from "vitest";
import { aggregateTown, townRatio } from "@/lib/analytics/town";

describe("Town analytics", () => {
  it("uses weighted totals instead of averaging rates", () => {
    const result = aggregateTown([{ pv: 1000, uu: 100, telTapUu: 10, bounceRate: 0.2 }, { pv: 100, uu: 10, telTapUu: 0, bounceRate: 0.8 }]);
    expect(result.averagePv).toBe(10);
    expect(result.conversionRate).toBeCloseTo(10 / 110);
    expect(result.bounceRate).toBeCloseTo((20 + 8) / 110);
  });
  it("returns null for zero denominators", () => expect(townRatio(1, 0)).toBeNull());
});

