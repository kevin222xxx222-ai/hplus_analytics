import type { MetricFormat, UiAvailability, UiConfidence } from "./types";
import { availabilityPresentation, confidencePresentation, growthPresentation } from "./presentation";
import type { GrowthPotential } from "./types";

const safe = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const formatCurrency = (value: unknown) => safe(value) ? `¥${Math.round(value).toLocaleString("ja-JP")}` : "—";
export const formatInteger = (value: unknown) => safe(value) ? Math.round(value).toLocaleString("ja-JP") : "—";
export const formatDecimal = (value: unknown, digits = 2) => safe(value) ? value.toLocaleString("ja-JP", { maximumFractionDigits: digits }) : "—";
export const formatPercent = (value: unknown, digits = 1) => safe(value) ? `${value.toLocaleString("ja-JP", { maximumFractionDigits: digits })}%` : "—";
export const formatHours = (value: unknown) => safe(value) ? `${value.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}時間` : "—";
export const formatCount = formatInteger;
export const formatDate = (value: unknown) => value instanceof Date ? value.toLocaleDateString("ja-JP") : typeof value === "string" && value ? value : "—";
export const formatDateRange = (from?: string | null, to?: string | null) => from && to ? `${from}〜${to}` : "—";
export const formatAvailability = (value: UiAvailability) => availabilityPresentation[value]?.label ?? "—";
export const formatConfidence = (value: UiConfidence) => confidencePresentation[value]?.label ?? "—";
export const formatGrowthPotential = (value: GrowthPotential) => growthPresentation[value]?.label ?? value;
export const formatComparisonLabel = (value: string) => value || "比較不能";
export function formatMetric(value: unknown, format: MetricFormat): string {
  if (format === "currency") return formatCurrency(value);
  if (format === "percent") return formatPercent(value);
  if (format === "hours" || format === "hourly") return formatHours(value);
  if (format === "decimal" || format === "unitPrice") return formatDecimal(value);
  return formatInteger(value);
}
