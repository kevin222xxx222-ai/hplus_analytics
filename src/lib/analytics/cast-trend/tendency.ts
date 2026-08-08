import { isValidTrendValue } from "./metrics";
import { CAST_TREND_THRESHOLDS, type CastMonthlyTrendPoint, type CastTrendDirection, type CastTrendMetricKey } from "./types";

export const directionFor = (points: CastMonthlyTrendPoint[], key: CastTrendMetricKey): CastTrendDirection => {
  const values = points.filter((point) => point.status === "COMPLETE" && isValidTrendValue(point.metrics[key])).slice(-3).map((point) => point.metrics[key].value as number);
  if (values.length < 3) return "INSUFFICIENT_DATA";
  const changes = values.slice(1).map((value, index) => value - values[index]); const first = values[0]; const last = values[values.length - 1]; const rangeRatio = first === 0 ? (Math.max(...values) === 0 ? 0 : Infinity) : (Math.max(...values) - Math.min(...values)) / Math.abs(first); const totalRatio = first === 0 ? (last === 0 ? 0 : Infinity) : (last - first) / Math.abs(first);
  if (rangeRatio <= CAST_TREND_THRESHOLDS.flatRangeRatio) return "FLAT";
  if (changes.every((change) => change > 0) && totalRatio >= CAST_TREND_THRESHOLDS.meaningfulChangeRatio) return "RISING";
  if (changes.every((change) => change < 0) && totalRatio <= -CAST_TREND_THRESHOLDS.meaningfulChangeRatio) return "FALLING";
  return "VOLATILE";
};
export const extremaFor = (points: CastMonthlyTrendPoint[], key: CastTrendMetricKey) => { const valid = points.filter((point) => isValidTrendValue(point.metrics[key])); if (!valid.length) return { highest: null, lowest: null, latestIsHighest: false, latestIsLowest: false }; const highest = valid.reduce((a, b) => (a.metrics[key].value as number) >= (b.metrics[key].value as number) ? a : b); const lowest = valid.reduce((a, b) => (a.metrics[key].value as number) <= (b.metrics[key].value as number) ? a : b); const latest = points.at(-1); return { highest: { month: highest.month, value: highest.metrics[key].value as number }, lowest: { month: lowest.month, value: lowest.metrics[key].value as number }, latestIsHighest: Boolean(latest && isValidTrendValue(latest.metrics[key]) && latest.metrics[key].value === highest.metrics[key].value), latestIsLowest: Boolean(latest && isValidTrendValue(latest.metrics[key]) && latest.metrics[key].value === lowest.metrics[key].value) }; };
