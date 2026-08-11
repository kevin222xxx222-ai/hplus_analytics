import { describe, expect, it } from "vitest";
import { formatMediaFunnelMetric, mediaFunnelMetricLabel } from "./cast-metric-presentation";

describe("media funnel presentation", () => {
  it("uses Japanese labels and preserves zero/partial states", () => {
    expect(mediaFunnelMetricLabel("heavenMyGirlAdds")).toBe("マイガール増加数");
    expect(formatMediaFunnelMetric("heavenMyGirlAdds", 0, "ZERO")).toBe("0件");
    expect(formatMediaFunnelMetric("heavenMyGirlAdds", 39, "VALUE", true)).toBe("39件（暫定）");
    expect(formatMediaFunnelMetric("heavenFavoriteTalks", null, "MISSING")).toBe("データなし");
    expect(formatMediaFunnelMetric("heavenFavoriteTalks", null, "UNAVAILABLE")).toBe("掲載対象外");
    expect(formatMediaFunnelMetric("heavenFavoriteTalksPerAttendanceDay", null, "UNCOMPUTABLE")).toBe("算出不可");
  });
});
