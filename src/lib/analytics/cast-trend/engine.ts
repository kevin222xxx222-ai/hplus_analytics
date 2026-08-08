import { actionFocusFor } from "./action-focus";
import { previousComparison, rollingAverage } from "./comparison";
import { buildTrendPointBase } from "./monthly-aggregation";
import { extremaFor, directionFor } from "./tendency";
import { TREND_LABELS, TREND_METRIC_KEYS, type CastTrendMetricKey, type CastTrendResult, type TrendMonthlyInput } from "./types";

const rateKeys = new Set<CastTrendMetricKey>(["photoNominationShare", "mainNominationRate", "repeatShare"]);
const emptyAvailabilitySummary = () => Object.fromEntries(TREND_METRIC_KEYS.map((key) => [key, { VALUE: 0, ZERO: 0, MISSING: 0, UNAVAILABLE: 0, UNCOMPUTABLE: 0 }])) as CastTrendResult["availabilitySummary"];
export function buildCastTrend(input: { castId: string; displayName: string; storeLabels: string[]; period: { from: string; to: string }; months: TrendMonthlyInput[]; actionType?: string | null }): CastTrendResult {
  const points = input.months.map((month) => buildTrendPointBase(month));
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    point.action = input.months[index].actionSnapshot ?? null;
    for (const key of TREND_METRIC_KEYS) {
      const previousPoint = points[index - 1];
      point.previous[key] = previousComparison(point.metrics[key], previousPoint?.metrics[key], previousPoint?.month ?? null, rateKeys.has(key));
      point.rolling3[key] = rollingAverage(points.slice(0, index + 1), key, 3);
      point.rolling6[key] = rollingAverage(points.slice(0, index + 1), key, 6);
      point.direction[key] = directionFor(points.slice(0, index + 1), key);
      point.extrema[key] = extremaFor(points.slice(0, index + 1), key);
      point.records[key] = point.status === "PARTIAL" && point.extrema[key].latestIsHighest ? "PROVISIONAL_HIGHEST" : point.status === "COMPLETE" && point.extrema[key].latestIsHighest && point.extrema[key].highest?.month === point.month ? "NEW_HIGHEST" : null;
    }
  }
  const latest = points.at(-1);
  const summaries = Object.fromEntries(TREND_METRIC_KEYS.map((key) => [key, { key, latest: latest?.metrics[key] ?? { value: null, availability: "MISSING" }, previous: latest?.previous[key], rolling3: latest?.rolling3[key], rolling6: latest?.rolling6[key], direction: latest?.direction[key] ?? "INSUFFICIENT_DATA", extrema: latest?.extrema[key], record: latest?.records[key] ?? null }])) as CastTrendResult["summaries"];
  const availabilitySummary = emptyAvailabilitySummary();
  for (const point of points) for (const key of TREND_METRIC_KEYS) availabilitySummary[key][point.metrics[key].availability]++;
  const warnings = points.filter((point) => point.status === "PARTIAL").map((point) => ({ code: "PARTIAL_MONTH", label: `${point.month}は暫定値です` }));
  return { version: "cast-trend-v1", cast: { castId: input.castId, displayName: input.displayName, storeLabels: input.storeLabels }, period: { ...input.period, monthCount: points.length }, months: points, summaries, actionFocus: actionFocusFor(input.actionType ?? null), availabilitySummary, warnings };
}

export const trendMetricLabels = TREND_LABELS;
