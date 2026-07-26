import { describe, expect, it } from "vitest";
import { confidenceLabel, formatMetricWithUnit } from "./daily-brief";

describe("Daily Brief presentation helpers", () => {
  it("uses Japanese confidence labels", () => {
    expect(confidenceLabel("High")).toBe("高い");
    expect(confidenceLabel("Medium")).toBe("標準");
    expect(confidenceLabel("Low")).toBe("低い");
    expect(confidenceLabel("Insufficient")).toBe("不十分");
  });

  it("keeps missing values visible and adds metric units", () => {
    expect(formatMetricWithUnit({ value: 592000, availability: "VALUE", unit: "yen" })).toBe("¥592,000");
    expect(formatMetricWithUnit({ value: 15, availability: "VALUE", unit: "count" })).toContain("件");
    expect(formatMetricWithUnit({ value: 130, availability: "VALUE", unit: "hours" })).toContain("時間");
    expect(formatMetricWithUnit({ value: null, availability: "MISSING", unit: "count" })).toBe("データ不足");
  });
});
