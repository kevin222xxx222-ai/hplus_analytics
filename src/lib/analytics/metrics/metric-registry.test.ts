import { describe, expect, it } from "vitest";
import { METRIC_REGISTRY } from "./metric-registry";

describe("metric registry", () => {
  it("必須指標が一意なキーと表示名を持つ", () => {
    const keys = Object.keys(METRIC_REGISTRY);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(["ctiDiaryPostCount", "townDiaryPv", "heavenGirlPageAccess", "heavenDiaryPostCount", "mediaExposureReference"]));
    expect(Object.values(METRIC_REGISTRY).every((metric) => metric.label.length > 0)).toBe(true);
  });
  it("媒体横断参考値を正式合算として扱わない", () => {
    expect(METRIC_REGISTRY.mediaExposureReference.crossMediaAdditive).toBe(false);
    expect(METRIC_REGISTRY.mediaExposureReference.aggregation).toBe("reference");
  });
});
