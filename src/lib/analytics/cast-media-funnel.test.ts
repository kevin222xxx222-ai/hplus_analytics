import { describe, expect, it } from "vitest";
import { aggregateHeavenMediaFunnel } from "./cast-media-funnel";

const row = (castId: string, date: string, metricKey: "my_girl" | "okini_talk_sent", rawValue: number | null, deltaValue: number | null = null) => ({ castId, businessDate: date, metricKey, rawValue, deltaValue, valueKind: metricKey === "my_girl" ? "SNAPSHOT" as const : "DAILY_EVENT" as const, rawValueStatus: rawValue === null ? "MISSING" : "VALUE" });

describe("Heaven media funnel aggregation", () => {
  it("sums daily talk events and computes snapshot increases from a baseline", () => {
    const result = aggregateHeavenMediaFunnel({ from: "2026-07-01", to: "2026-07-03", previousSnapshots: [row("a", "2026-06-30", "my_girl", 100)], rows: [row("a", "2026-07-01", "my_girl", 102), row("a", "2026-07-02", "my_girl", 105), row("a", "2026-07-03", "my_girl", 105), row("a", "2026-07-01", "okini_talk_sent", 2), row("a", "2026-07-02", "okini_talk_sent", 0), row("a", "2026-07-03", "okini_talk_sent", 3)] });
    expect(result.get("a")?.heavenMyGirlAdds.value).toBe(5);
    expect(result.get("a")?.heavenFavoriteTalks.value).toBe(5);
    expect(result.get("a")?.heavenFavoriteTalks.availability).toBe("VALUE");
  });

  it("does not zero-fill missing snapshots and marks a reset as partial", () => {
    const result = aggregateHeavenMediaFunnel({ from: "2026-07-01", to: "2026-07-04", previousSnapshots: [row("a", "2026-06-30", "my_girl", 100)], rows: [row("a", "2026-07-01", "my_girl", 105), row("a", "2026-07-02", "my_girl", 103), row("a", "2026-07-03", "my_girl", 104)] });
    const metric = result.get("a")?.heavenMyGirlAdds;
    expect(metric?.value).toBe(6);
    expect(metric?.isPartial).toBe(true);
    expect(result.get("a")?.negativeDeltaCount).toBe(1);
  });

  it("keeps a formal zero distinct from unavailable", () => {
    const result = aggregateHeavenMediaFunnel({ from: "2026-07-01", to: "2026-07-02", previousSnapshots: [row("a", "2026-06-30", "my_girl", 10)], rows: [row("a", "2026-07-01", "my_girl", 10), row("a", "2026-07-02", "my_girl", 10), row("a", "2026-07-01", "okini_talk_sent", 0), row("a", "2026-07-02", "okini_talk_sent", 0)] });
    expect(result.get("a")?.heavenMyGirlAdds.availability).toBe("ZERO");
    expect(result.get("a")?.heavenFavoriteTalks.availability).toBe("ZERO");
    expect(aggregateHeavenMediaFunnel({ from: "2026-07-01", to: "2026-07-02", rows: [] }).get("a")).toBeUndefined();
  });
});
