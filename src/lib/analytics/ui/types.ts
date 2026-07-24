export type UiAvailability = "VALUE" | "ZERO" | "MISSING" | "UNCOMPUTABLE" | "UNAVAILABLE" | "INSUFFICIENT_SAMPLE";
export type UiConfidence = "High" | "Medium" | "Low" | "Insufficient";
export type TrendDirection = "INCREASE" | "DECREASE" | "FLAT" | "UNAVAILABLE";
export type GrowthPotential = "Data不足" | "Capacity上限" | "Schedule制約" | "Exposure不足" | "Activity不足" | "Efficiency改善余地" | "安定維持";
export type DisplayValue = string | number | null | undefined;

export type MetricFormat = "currency" | "integer" | "decimal" | "percent" | "hours" | "count" | "people" | "unitPrice" | "hourly" | "pv" | "uu";

export type ComparisonViewModel = {
  current: DisplayValue;
  baseline: DisplayValue;
  difference?: DisplayValue;
  rate?: number | null;
  label: string;
  period?: string;
  availability?: UiAvailability;
  confidence?: UiConfidence;
  sample?: string;
};

export type NextBestActionViewModel = {
  actionLevel: "ACTION" | "REFERENCE" | "NONE";
  cause?: string;
  evidence?: string[];
  action?: string | null;
  confidence?: UiConfidence;
  availability?: UiAvailability;
  status?: string;
};
