import type { MetricFormat, UiAvailability, UiConfidence } from "./types";
import { availabilityPresentation, confidencePresentation, growthPresentation } from "./presentation";
import type { GrowthPotential } from "./types";

const safe = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const formatCurrency = (value: unknown) => safe(value) ? `¥${Math.round(value).toLocaleString("ja-JP")}` : "—";
export const formatInteger = (value: unknown) => safe(value) ? Math.round(value).toLocaleString("ja-JP") : "—";
export const formatDecimal = (value: unknown, digits = 2) => safe(value) ? value.toLocaleString("ja-JP", { maximumFractionDigits: digits }) : "—";
export const formatWeeklyAverageCount = (value: unknown) => safe(value) ? value.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—";
export const formatWeeklyRelativeDifference = (value: unknown) => !safe(value) ? "—" : Math.abs(value) < 0.001 ? "±0.1%未満" : formatSignedPercent(value);
export const formatPercent = (value: unknown, digits = 1) => safe(value) ? `${value.toLocaleString("ja-JP", { maximumFractionDigits: digits })}%` : "—";
export const formatHours = (value: unknown) => safe(value) ? `${value.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}時間` : "—";
export const formatCount = formatInteger;
export const formatSignedCurrency = (value: unknown) => safe(value) ? `${value < 0 ? "-" : value > 0 ? "+" : ""}¥${Math.abs(Math.round(value)).toLocaleString("ja-JP")}` : "—";
export const formatSignedCount = (value: unknown) => safe(value) ? `${value < 0 ? "-" : value > 0 ? "+" : ""}${Math.abs(Math.round(value)).toLocaleString("ja-JP")}` : "—";
export const formatPointDifference = (value: unknown) => safe(value) ? `${value < 0 ? "-" : value > 0 ? "+" : ""}${Math.abs(value * 100).toFixed(1)}pt` : "—";
export const formatSignedPercent = (value: unknown) => safe(value) ? `${value < 0 ? "-" : value > 0 ? "+" : ""}${Math.abs(value * 100).toFixed(1)}%` : "—";
export const formatDate = (value: unknown) => value instanceof Date ? value.toLocaleDateString("ja-JP") : typeof value === "string" && value ? value : "—";
export const formatJapaneseDate = (value: unknown) => { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—"; const [year, month, day] = value.split("-"); return `${year}年${Number(month)}月${Number(day)}日`; };
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
