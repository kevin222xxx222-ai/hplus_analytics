import type { CastTrendAvailability, CastTrendMetric, CastTrendMetricKey, CastTrendMetrics } from "./types";
import type { CastEngineCast } from "@/lib/analytics/cast-diagnosis/types";
import { TREND_METRIC_KEYS, toTrendMetric } from "./types";

const missing = (availability: CastTrendAvailability = "MISSING"): CastTrendMetric => ({ value: null, availability });
export const metricsFromCast = (cast: CastEngineCast | null): CastTrendMetrics => {
  const result = Object.fromEntries(TREND_METRIC_KEYS.map((key) => [key, cast ? toTrendMetric(cast.fact[key]) : missing()])) as CastTrendMetrics;
  return result;
};
export const metricValue = (metric: CastTrendMetric | undefined) => metric?.value ?? null;
export const isValidTrendValue = (metric: CastTrendMetric | undefined): metric is CastTrendMetric & { value: number } => Boolean(metric && metric.value !== null && ["VALUE", "ZERO"].includes(metric.availability));
export const emptyAvailability = (): Record<CastTrendMetricKey, number> => Object.fromEntries(TREND_METRIC_KEYS.map((key) => [key, 0])) as Record<CastTrendMetricKey, number>;
