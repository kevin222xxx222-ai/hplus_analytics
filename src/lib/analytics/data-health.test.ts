import { describe, expect, it } from "vitest";
import { calculateDataHealthScore, healthState } from "./data-health";

describe("data health score", () => {
  it("starts at 100 when no issues exist", () => {
    expect(calculateDataHealthScore({ previewReady: 0, failed: 0, waiting: 0, openErrors: 0, openWarnings: 0, missingDays: 0 })).toBe(100);
  });

  it("applies the documented caps", () => {
    expect(calculateDataHealthScore({ previewReady: 10, failed: 10, waiting: 10, openErrors: 20, openWarnings: 100, missingDays: 10 })).toBe(0);
  });

  it("classifies blocking states separately from score", () => {
    expect(healthState(95, 1)).toBe("要対応");
    expect(healthState(80, 0)).toBe("注意");
    expect(healthState(95, 0)).toBe("正常");
  });
});
