import { describe, expect, it } from "vitest";
import { buildPublicCastTrendSummary } from "./summary";
import { TREND_METRIC_KEYS, type CastMonthlyTrendPoint, type CastTrendResult } from "./types";
import { formatCastTrendValue, metricLabel } from "@/lib/analytics/ui/cast-metric-presentation";

const point = (month: string, status: "COMPLETE" | "PARTIAL", value: number | null): CastMonthlyTrendPoint => {
  const metrics = Object.fromEntries(TREND_METRIC_KEYS.map((key) => [key, { value: key === "hourlyReward" ? value : null, availability: key === "hourlyReward" ? (value === 0 ? "ZERO" : value === null ? "MISSING" : "VALUE") : "MISSING" }])) as CastMonthlyTrendPoint["metrics"];
  const empty = Object.fromEntries(TREND_METRIC_KEYS.map((key) => [key, { previousMonth: null, currentValue: null, previousValue: null, absoluteChange: null, percentageChange: null, absolutePointChange: null, availability: "UNCOMPUTABLE" }])) as CastMonthlyTrendPoint["previous"];
  const averages = Object.fromEntries(TREND_METRIC_KEYS.map((key) => [key, { value: value, validMonthCount: value === null ? 0 : 1, requiredMonthCount: 3, availability: value === null ? "INSUFFICIENT" : "VALUE" }])) as CastMonthlyTrendPoint["rolling3"];
  const directions = Object.fromEntries(TREND_METRIC_KEYS.map((key) => [key, "INSUFFICIENT_DATA"])) as CastMonthlyTrendPoint["direction"];
  const extrema = Object.fromEntries(TREND_METRIC_KEYS.map((key) => [key, { highest: value === null ? null : { month, value }, lowest: value === null ? null : { month, value }, latestIsHighest: value !== null, latestIsLowest: value !== null }])) as CastMonthlyTrendPoint["extrema"];
  return { castId: "cast", month, label: month, status, coverage: {} as CastMonthlyTrendPoint["coverage"], metrics, diagnosis: null, action: null, warnings: [], previous: empty, rolling3: averages, rolling6: averages, direction: directions, extrema, records: Object.fromEntries(TREND_METRIC_KEYS.map((key) => [key, null])) as CastMonthlyTrendPoint["records"] };
};

const result = (months: CastMonthlyTrendResult["months"]): CastTrendResult => ({ version: "test", cast: { castId: "cast", displayName: "テスト", storeLabels: [] }, period: { from: `${months[0]?.month ?? "2026-01"}-01`, to: `${months.at(-1)?.month ?? "2026-01"}-28`, monthCount: months.length }, months, summaries: {} as CastTrendResult["summaries"], actionFocus: { actionType: null, primaryMetricKeys: ["hourlyReward"], maintainMetricKeys: [], monitorMetricKeys: [], reason: "" }, availabilitySummary: {} as CastTrendResult["availabilitySummary"], warnings: [] });
type CastMonthlyTrendResult = { months: CastMonthlyTrendPoint[] };

describe("buildPublicCastTrendSummary", () => {
  it("keeps zero distinct from missing and marks the current partial month", () => {
    const summary = buildPublicCastTrendSummary({ trend: result([point("2026-06", "COMPLETE", 0), point("2026-07", "PARTIAL", 1200)]), actionType: "MAINTAIN_CURRENT", castId: "cast" });
    expect(summary.period.includesPartialMonth).toBe(true);
    expect(summary.metrics[0]?.current.availability).toBe("VALUE");
    expect(summary.metrics[0]?.current.status).toBe("PROVISIONAL");
    const zero = buildPublicCastTrendSummary({ trend: result([point("2026-06", "COMPLETE", 0)]), castId: "cast" });
    expect(zero.metrics[0]?.current.availability).toBe("ZERO");
  });

  it("removes leading unavailable months and limits cards to four", () => {
    const summary = buildPublicCastTrendSummary({ trend: result([point("2026-02", "COMPLETE", null), point("2026-04", "COMPLETE", 100), point("2026-05", "COMPLETE", 110)]), castId: "cast" });
    expect(summary.period.fromMonth).toBe("2026-04");
    expect(summary.metrics.length).toBeLessThanOrEqual(4);
  });

  it("uses the latest confirmed month when the partial current month is missing", () => {
    const summary = buildPublicCastTrendSummary({ trend: result([point("2026-07", "COMPLETE", 1250), point("2026-08", "PARTIAL", null)]), castId: "cast" });
    expect(summary.metrics[0]?.displayValueSource).toBe("LATEST_CONFIRMED");
    expect(summary.metrics[0]?.latestConfirmed.month).toBe("2026-07");
    expect(summary.metrics[0]?.latestConfirmed.value).toBe(1250);
    expect(summary.overallMessage.description).toContain("最新の確定実績");
  });

  it("presents trend labels and units without exposing internal keys", () => {
    expect(metricLabel("repeatShare")).toBe("リピート構成比");
    expect(formatCastTrendValue("repeatShare", 0.4175)).toBe("41.8%");
    expect(formatCastTrendValue("hourlyReward", 2499.5)).toBe("2,499.5円");
  });
});
