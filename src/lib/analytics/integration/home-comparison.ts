import type { Availability, Confidence } from "@/lib/analytics/engine";
import { formatDateOnly } from "@/lib/date";

export type HomeComparisonMetricKey = "sales" | "reservations" | "contracts" | "attendance" | "hours" | "townPv" | "townUu" | "heavenAccess" | "ctiDiaryPosts" | "heavenDiaryPosts";

export type HomeMetricValue = {
  value: number | null;
  availability: Availability;
  confidence: Confidence;
  unit: "yen" | "count" | "hours" | "percent";
};

export type HomeComparisonValue = {
  current: HomeMetricValue;
  baseline: HomeMetricValue;
  difference: HomeMetricValue;
  differenceRate: HomeMetricValue;
  sampleDays: number;
  confidence: Confidence;
  status: "十分" | "目安内" | "不足" | "データ不足" | "サンプル不足" | "算出不能";
};

export type HomeComparisonRow = {
  key: HomeComparisonMetricKey;
  label: string;
  unit: HomeMetricValue["unit"];
  direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
  previousDay: HomeMetricValue;
  monthAverage: HomeMetricValue;
  weekdayAverage: HomeMetricValue;
  vsMonthAverage: HomeComparisonValue;
  vsWeekdayAverage: HomeComparisonValue;
};

export type HomeDailyMetricInput = {
  date: Date;
  sales?: number | null;
  reservations?: number | null;
  contracts?: number | null;
  attendance?: number | null;
  minutes?: number | null;
  townPv?: number | null;
  townUu?: number | null;
  heavenAccess?: number | null;
  ctiDiaryPosts?: number | null;
  heavenDiaryPosts?: number | null;
};

const LABELS: Record<HomeComparisonMetricKey, { label: string; unit: HomeMetricValue["unit"]; direction: HomeComparisonRow["direction"] }> = {
  sales: { label: "売上", unit: "yen", direction: "HIGHER_IS_BETTER" },
  reservations: { label: "予約数", unit: "count", direction: "HIGHER_IS_BETTER" },
  contracts: { label: "成約数", unit: "count", direction: "HIGHER_IS_BETTER" },
  attendance: { label: "出勤人数", unit: "count", direction: "HIGHER_IS_BETTER" },
  hours: { label: "出勤時間", unit: "hours", direction: "HIGHER_IS_BETTER" },
  townPv: { label: "Town PV", unit: "count", direction: "HIGHER_IS_BETTER" },
  townUu: { label: "Town UU", unit: "count", direction: "HIGHER_IS_BETTER" },
  heavenAccess: { label: "Heaven女子ページアクセス", unit: "count", direction: "HIGHER_IS_BETTER" },
  ctiDiaryPosts: { label: "CTI写メ日記", unit: "count", direction: "HIGHER_IS_BETTER" },
  heavenDiaryPosts: { label: "Heaven写メ日記投稿", unit: "count", direction: "HIGHER_IS_BETTER" },
};

const KEYS = Object.keys(LABELS) as HomeComparisonMetricKey[];

function confidenceFor(sampleDays: number): Confidence {
  return sampleDays >= 20 ? "High" : sampleDays >= 10 ? "Medium" : sampleDays >= 5 ? "Low" : "Insufficient";
}

function value(value: number | null, unit: HomeMetricValue["unit"], sampleDays: number): HomeMetricValue {
  return { value, unit, confidence: confidenceFor(sampleDays), availability: value === null ? "MISSING" : value === 0 ? "ZERO" : "VALUE" };
}

function average(values: Array<number | null>, unit: HomeMetricValue["unit"]): HomeMetricValue {
  const available = values.filter((item): item is number => item !== null);
  return value(available.length ? available.reduce((sum, item) => sum + item, 0) / available.length : null, unit, available.length);
}

function comparison(current: HomeMetricValue, baseline: HomeMetricValue, sampleDays: number): HomeComparisonValue {
  const difference = current.value === null || baseline.value === null ? null : current.value - baseline.value;
  const differenceRate = difference === null || baseline.value === null || baseline.value === 0 ? null : difference / Math.abs(baseline.value);
  const rateAvailability: Availability = difference !== null && baseline.value === 0 ? "UNCOMPUTABLE" : differenceRate === null ? "MISSING" : differenceRate === 0 ? "ZERO" : "VALUE";
  const status = current.availability === "MISSING" || baseline.availability === "MISSING" ? "データ不足" : confidenceFor(sampleDays) === "Insufficient" ? "サンプル不足" : rateAvailability === "UNCOMPUTABLE" ? "算出不能" : differenceRate !== null && differenceRate >= 0.1 ? "十分" : differenceRate !== null && differenceRate <= -0.1 ? "不足" : "目安内";
  return { current, baseline, difference: value(difference, current.unit, sampleDays), differenceRate: { value: differenceRate, unit: "percent", confidence: confidenceFor(sampleDays), availability: rateAvailability }, sampleDays, confidence: confidenceFor(sampleDays), status };
}

function getMetric(input: HomeDailyMetricInput, key: HomeComparisonMetricKey): number | null {
  if (key === "hours") return input.minutes === null || input.minutes === undefined ? null : input.minutes / 60;
  return input[key] ?? null;
}

function sameDayOfWeek(date: Date, weekday: number): boolean {
  return date.getUTCDay() === weekday;
}

export function buildHomeComparisons(input: { previousDate: Date; from: Date; to: Date; daily: HomeDailyMetricInput[] }): HomeComparisonRow[] {
  // Baselines are historical: exclude the day being evaluated to avoid comparing a value with an average that contains itself.
  const availableDaily = input.daily.filter((item) => item.date >= input.from && item.date <= input.to && item.date < input.previousDate);
  const weekdayDaily = availableDaily.filter((item) => sameDayOfWeek(item.date, input.previousDate.getUTCDay()));
  const previous = input.daily.find((item) => formatDateOnly(item.date) === formatDateOnly(input.previousDate));
  return KEYS.map((key) => {
    const { label, unit, direction } = LABELS[key];
    const previousDay = value(previous ? getMetric(previous, key) : null, unit, previous ? 1 : 0);
    const monthAverage = average(availableDaily.map((item) => getMetric(item, key)), unit);
    const weekdayAverage = average(weekdayDaily.map((item) => getMetric(item, key)), unit);
    return { key, label, unit, direction, previousDay, monthAverage, weekdayAverage, vsMonthAverage: comparison(previousDay, monthAverage, availableDaily.length), vsWeekdayAverage: comparison(previousDay, weekdayAverage, weekdayDaily.length) };
  });
}
