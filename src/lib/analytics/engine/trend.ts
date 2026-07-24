import type { Availability, BaselineKind, Comparison, MetricValue, TrendResult } from "./types";

const availabilityOf = (value: MetricValue): Availability => value === null || value === undefined || !Number.isFinite(value) ? "MISSING" : value === 0 ? "ZERO" : "VALUE";

export function compareValues(current: MetricValue, baseline: MetricValue, baselineKind: BaselineKind, reason?: string): Comparison {
  const currentAvailability = availabilityOf(current);
  const baselineAvailability = availabilityOf(baseline);
  if (current === null || baseline === null || currentAvailability === "MISSING" || baselineAvailability === "MISSING") return { status: "Unavailable", current, baseline, delta: null, changeRate: null, improvementRate: null, baselineKind, reason: reason ?? "比較不能：値が不足しています", availability: "UNAVAILABLE", currentAvailability, baselineAvailability };
  const delta = current - baseline;
  const changeRate = baseline === 0 ? null : delta / Math.abs(baseline);
  return { status: "Available", current, baseline, delta, changeRate, improvementRate: changeRate, baselineKind, availability: delta === 0 ? "ZERO" : "VALUE", currentAvailability, baselineAvailability, reason: baseline === 0 ? "比較値が0のため増減率は算出しません" : undefined };
}

export function trendFromComparison(comparison: Comparison): TrendResult {
  if (comparison.status === "Unavailable" || comparison.delta === null) return { ...comparison, direction: "unavailable" };
  return { ...comparison, direction: comparison.delta > 0 ? "improved" : comparison.delta < 0 ? "worsened" : "flat" };
}
