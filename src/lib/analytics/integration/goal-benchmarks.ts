import type { Availability, Confidence } from "@/lib/analytics/engine";
import { type HealthScope } from "@/lib/analytics/data-health";
import { formatDateOnly, parseDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { addUtcDays } from "./home-dates";

export type BenchmarkStatus = "ABOVE_REFERENCE" | "WITHIN_REFERENCE" | "BELOW_REFERENCE" | "INSUFFICIENT_SAMPLE" | "UNAVAILABLE";
export type BenchmarkCategory = "運営" | "集客・活動";
export type BenchmarkUnit = "yen" | "count" | "hours";
export type ThresholdBasis = "REQUIRED_DAILY_AVERAGE" | "TARGET_DAILY_PACE" | "UNAVAILABLE";

export type GoalBenchmarkMetricDto = {
  metricId: string;
  label: string;
  category: BenchmarkCategory;
  unit: BenchmarkUnit;
  currentValue: number | null;
  monthlyAverage: number | null;
  weekdayAverage: number | null;
  requiredValue: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  weekdayMedian: number | null;
  weekdayP25: number | null;
  weekdayP75: number | null;
  min: number | null;
  max: number | null;
  mean: number | null;
  differenceFromMedian: number | null;
  differenceRateFromMedian: number | null;
  differenceFromMonthlyAverage: number | null;
  sample: number;
  weekdaySample: number;
  confidence: Confidence;
  availability: Availability;
  status: BenchmarkStatus;
  /** Status evaluated against the current-month average (the HOME comparison basis). */
  monthlyStatus?: BenchmarkStatus;
  weekdayStatus: BenchmarkStatus;
  scopeNote: string;
  detailHref: string;
  direction: "HIGHER_IS_BETTER";
};

export type GoalBenchmarksDto = {
  scope: HealthScope;
  evaluationDate: string | null;
  targetMonth: string;
  monthlyTarget: number | null;
  benchmarkDailySalesThreshold: number | null;
  thresholdBasis: ThresholdBasis;
  historyFrom: string | null;
  historyTo: string | null;
  qualifiedDayCount: number;
  weekdayQualifiedDayCount: number;
  operations: GoalBenchmarkMetricDto[];
  marketing: GoalBenchmarkMetricDto[];
  availability: Availability;
  generatedAt: string;
  disclaimer: string[];
  emptyReason: string | null;
};

export type BenchmarkSummary = { sample: number; min: number | null; max: number | null; mean: number | null; p25: number | null; median: number | null; p75: number | null };

/** Linear interpolation is used consistently for P25/P50/P75. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function summarize(values: number[]): BenchmarkSummary {
  if (!values.length) return { sample: 0, min: null, max: null, mean: null, p25: null, median: null, p75: null };
  return { sample: values.length, min: Math.min(...values), max: Math.max(...values), mean: values.reduce((a, b) => a + b, 0) / values.length, p25: percentile(values, 0.25), median: percentile(values, 0.5), p75: percentile(values, 0.75) };
}

export function confidenceForSample(sample: number): Confidence {
  if (sample >= 20) return "High";
  if (sample >= 10) return "Medium";
  if (sample >= 5) return "Low";
  return "Insufficient";
}

export function resolveBenchmarkThreshold(input: { monthlyTarget: number | null; requiredDailyAverage: number | null; remainingAmount: number | null; remainingDays: number; calendarDays: number }): { value: number | null; basis: ThresholdBasis } {
  if (input.monthlyTarget === null || input.monthlyTarget <= 0) return { value: null, basis: "UNAVAILABLE" };
  if (input.remainingAmount !== null && input.remainingAmount > 0 && input.remainingDays > 0 && input.requiredDailyAverage !== null && input.requiredDailyAverage > 0) return { value: input.requiredDailyAverage, basis: "REQUIRED_DAILY_AVERAGE" };
  return { value: input.monthlyTarget / Math.max(1, input.calendarDays), basis: "TARGET_DAILY_PACE" };
}

export function benchmarkStatus(current: number | null, summary: BenchmarkSummary, minimumSample = 8): BenchmarkStatus {
  if (current === null || summary.sample === 0 || summary.p25 === null || summary.p75 === null) return "UNAVAILABLE";
  if (summary.sample < minimumSample) return "INSUFFICIENT_SAMPLE";
  if (current < summary.p25) return "BELOW_REFERENCE";
  if (current > summary.p75) return "ABOVE_REFERENCE";
  return "WITHIN_REFERENCE";
}

type DailyValues = { sales: number | null; attendance: number | null; hours: number | null; reservations: number | null; contracts: number | null; services: number | null; regularNominations: number | null; townPv: number | null; townUu: number | null; heavenAccess: number | null; heavenDiaryPosts: number | null };
type RawCti = { castId: string; storeId: string; businessDate: Date; attendanceCount: number; attendanceMinutes: number; salesAmount: number | null; reservationCount: number; contractCount: number; serviceCount: number; regularNominationCount: number };
type RawTown = { date: Date; storeId: string; pv: number; uu: number };
type RawHeaven = { businessDate: Date; storeId: string; metricKey: string; rawValue: unknown; rawValueStatus: string };

const labels: Record<keyof DailyValues, { label: string; category: BenchmarkCategory; unit: BenchmarkUnit }> = {
  attendance: { label: "出勤人数", category: "運営", unit: "count" }, hours: { label: "出勤時間", category: "運営", unit: "hours" }, reservations: { label: "予約数", category: "運営", unit: "count" }, contracts: { label: "成約数", category: "運営", unit: "count" }, services: { label: "接客数", category: "運営", unit: "count" }, regularNominations: { label: "本指名数", category: "運営", unit: "count" }, sales: { label: "売上", category: "運営", unit: "yen" }, townPv: { label: "Town PV", category: "集客・活動", unit: "count" }, townUu: { label: "Town UU", category: "集客・活動", unit: "count" }, heavenAccess: { label: "Heaven女子ページアクセス", category: "集客・活動", unit: "count" }, heavenDiaryPosts: { label: "Heaven写メ日記投稿数", category: "集客・活動", unit: "count" },
};

const emptyDay = (): DailyValues => ({ sales: null, attendance: null, hours: null, reservations: null, contracts: null, services: null, regularNominations: null, townPv: null, townUu: null, heavenAccess: null, heavenDiaryPosts: null });
const toNumber = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);

function aggregateDates(cti: RawCti[], town: RawTown[], heaven: RawHeaven[]): Map<string, DailyValues> {
  const map = new Map<string, DailyValues>();
  const ensure = (date: string) => { const current = map.get(date) ?? emptyDay(); map.set(date, current); return current; };
  const ctiDates = new Set<string>();
  for (const row of cti) {
    const date = formatDateOnly(row.businessDate); const day = ensure(date); if (row.attendanceCount > 0) ctiDates.add(`${date}:${row.castId}`);
    day.sales = (day.sales ?? 0) + (row.salesAmount ?? 0); day.reservations = (day.reservations ?? 0) + row.reservationCount; day.contracts = (day.contracts ?? 0) + row.contractCount; day.services = (day.services ?? 0) + row.serviceCount; day.regularNominations = (day.regularNominations ?? 0) + row.regularNominationCount; day.hours = (day.hours ?? 0) + row.attendanceMinutes / 60;
  }
  for (const key of ctiDates) { const [date] = key.split(":"); const day = ensure(date); day.attendance = (day.attendance ?? 0) + 1; }
  for (const row of town) { const day = ensure(formatDateOnly(row.date)); day.townPv = (day.townPv ?? 0) + row.pv; day.townUu = (day.townUu ?? 0) + row.uu; }
  for (const row of heaven) { if (row.rawValueStatus !== "VALUE") continue; const day = ensure(formatDateOnly(row.businessDate)); const value = toNumber(row.rawValue); if (value === null) continue; if (row.metricKey === "page_access") day.heavenAccess = (day.heavenAccess ?? 0) + value; if (row.metricKey === "diary_posts") day.heavenDiaryPosts = (day.heavenDiaryPosts ?? 0) + value; }
  return map;
}

function metricDto(key: keyof DailyValues, current: number | null, monthValues: number[], qualified: number[], weekdayQualified: number[], requiredValue: number | null, scope: HealthScope, from: string, to: string): GoalBenchmarkMetricDto {
  const summary = summarize(qualified); const weekdaySummary = summarize(weekdayQualified); const meta = labels[key]; const monthlyAverage = monthValues.length ? monthValues.reduce((a, b) => a + b, 0) / monthValues.length : null; const outOfScope = (key === "heavenAccess" || key === "heavenDiaryPosts") && scope !== "ALL" && scope !== "KASUKABE"; const status = outOfScope ? "UNAVAILABLE" : benchmarkStatus(current, summary); const monthlyStatus = outOfScope ? "UNAVAILABLE" : benchmarkStatus(monthlyAverage, summary); const weekdayStatus = outOfScope ? "UNAVAILABLE" : benchmarkStatus(current, weekdaySummary, 3); const availability: Availability = outOfScope ? "UNAVAILABLE" : summary.sample === 0 ? "UNAVAILABLE" : summary.sample < 8 ? "INSUFFICIENT_SAMPLE" : current === null ? "MISSING" : current === 0 ? "ZERO" : "VALUE";
  const difference = current !== null && summary.median !== null ? current - summary.median : null; const differenceRate = difference !== null && summary.median !== null && summary.median !== 0 ? difference / Math.abs(summary.median) : null;
  const scopeNote = outOfScope ? "この店舗はHeaven対象外です。" : key === "heavenAccess" || key === "heavenDiaryPosts" ? (scope === "ALL" ? "Heavenは春日部のみの参考水準です。媒体と売上の因果関係は示しません。" : "Heavenの正式取得値のみを使用しています。媒体と売上の因果関係は示しません。") : "過去の目標ペース達成日に観測された参考水準です。目標達成を保証しません。";
  return { metricId: key, label: meta.label, category: meta.category, unit: meta.unit, currentValue: current, monthlyAverage, weekdayAverage: weekdaySummary.mean, requiredValue, median: summary.median, p25: summary.p25, p75: summary.p75, weekdayMedian: weekdaySummary.median, weekdayP25: weekdaySummary.p25, weekdayP75: weekdaySummary.p75, min: summary.min, max: summary.max, mean: summary.mean, differenceFromMedian: difference, differenceRateFromMedian: differenceRate, differenceFromMonthlyAverage: monthlyAverage !== null && summary.median !== null ? monthlyAverage - summary.median : null, sample: summary.sample, weekdaySample: weekdaySummary.sample, confidence: confidenceForSample(summary.sample), availability, status, monthlyStatus, weekdayStatus, scopeNote, detailHref: `/analytics/trend?from=${from}&to=${to}&scope=${scope}&metric=${key}`, direction: "HIGHER_IS_BETTER" };
}

export async function getGoalBasedBenchmarks(input: { from: string; to: string; scope: HealthScope; evaluationDate: string | null; monthlyTarget: number | null; requiredDailyAverage: number | null; remainingAmount: number | null; remainingDays: number; requiredValues?: Partial<Record<keyof DailyValues, number | null>> }): Promise<GoalBenchmarksDto> {
  const evaluationDate = input.evaluationDate ? parseDateOnly(input.evaluationDate) : null; const monthStart = parseDateOnly(`${input.from.slice(0, 7)}-01`); const targetMonth = input.from.slice(0, 7); const calendarDays = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate(); const threshold = resolveBenchmarkThreshold({ monthlyTarget: input.monthlyTarget, requiredDailyAverage: input.requiredDailyAverage, remainingAmount: input.remainingAmount, remainingDays: input.remainingDays, calendarDays });
  const base: Omit<GoalBenchmarksDto, "operations" | "marketing" | "availability" | "generatedAt" | "emptyReason"> = { scope: input.scope, evaluationDate: input.evaluationDate, targetMonth, monthlyTarget: input.monthlyTarget, benchmarkDailySalesThreshold: threshold.value, thresholdBasis: threshold.basis, historyFrom: null, historyTo: null, qualifiedDayCount: 0, weekdayQualifiedDayCount: 0, disclaimer: ["過去の目標ペース達成日に観測された参考レンジであり、必要値・保証値・予測値ではありません。", "媒体指標と売上の因果関係や予約経路は判定していません。"] };
  if (!evaluationDate || threshold.value === null) return { ...base, operations: [], marketing: [], availability: "UNAVAILABLE", generatedAt: new Date().toISOString(), emptyReason: "目標金額が設定されていないため、目標ペース達成日の参考水準を算出できません。" };
  const scopeCodes: Array<"KASUKABE" | "KOSHIGAYA" | "NODA"> = input.scope === "ALL" ? ["KASUKABE", "KOSHIGAYA", "NODA"] : [input.scope as "KASUKABE" | "KOSHIGAYA" | "NODA"]; const stores = await prisma.store.findMany({ where: { code: { in: scopeCodes } }, select: { id: true, code: true } }); const storeIds = stores.map((s) => s.id); const heavenStoreIds = stores.filter((s) => s.code === "KASUKABE").map((s) => s.id); const historyFromDate = addUtcDays(evaluationDate, -89); const historyFrom = formatDateOnly(historyFromDate); const historyTo = input.evaluationDate;
  const [cti, town, heaven] = await Promise.all([
    prisma.ctiCastDaily.findMany({ where: { businessDate: { gte: historyFromDate, lte: evaluationDate }, storeId: { in: storeIds }, cast: { mergedIntoCastId: null }, importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, select: { castId: true, storeId: true, businessDate: true, attendanceCount: true, attendanceMinutes: true, salesAmount: true, reservationCount: true, contractCount: true, serviceCount: true, regularNominationCount: true } }),
    prisma.townStoreDaily.findMany({ where: { date: { gte: historyFromDate, lte: evaluationDate }, storeId: { in: storeIds }, importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, select: { date: true, storeId: true, pv: true, uu: true } }),
    prisma.heavenCastDaily.findMany({ where: { businessDate: { gte: historyFromDate, lte: evaluationDate }, storeId: { in: heavenStoreIds }, castId: { not: null }, cast: { mergedIntoCastId: null }, metricKey: { in: ["page_access", "diary_posts"] }, rawValueStatus: "VALUE", importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, select: { businessDate: true, storeId: true, metricKey: true, rawValue: true, rawValueStatus: true } }),
  ]);
  const daily = aggregateDates(cti as RawCti[], town as RawTown[], heaven as RawHeaven[]); const dates = [...daily.keys()].sort(); const qualifiedDates = dates.filter((date) => date < input.evaluationDate! && (daily.get(date)?.sales ?? null) !== null && (daily.get(date)?.sales ?? 0) >= threshold.value!); const weekday = evaluationDate.getUTCDay(); const weekdayDates = qualifiedDates.filter((date) => parseDateOnly(date).getUTCDay() === weekday); const fromDate = dates.length ? dates[0] : historyFrom; const keys = Object.keys(labels) as Array<keyof DailyValues>; const monthDates = dates.filter((date) => date >= formatDateOnly(monthStart) && date < input.evaluationDate!); const makeMetric = (key: keyof DailyValues) => metricDto(key, daily.get(input.evaluationDate!)?.[key] ?? null, monthDates.map((date) => daily.get(date)?.[key]).filter((v): v is number => v !== null && v !== undefined), qualifiedDates.map((date) => daily.get(date)?.[key]).filter((v): v is number => v !== null && v !== undefined), weekdayDates.map((date) => daily.get(date)?.[key]).filter((v): v is number => v !== null && v !== undefined), input.requiredValues?.[key] ?? null, input.scope, fromDate, input.to); const operations = keys.filter((key) => labels[key].category === "運営").map(makeMetric); const marketing = keys.filter((key) => labels[key].category === "集客・活動").map(makeMetric);
  return { ...base, historyFrom: fromDate, historyTo, qualifiedDayCount: qualifiedDates.length, weekdayQualifiedDayCount: weekdayDates.length, operations, marketing, availability: qualifiedDates.length ? "VALUE" : "INSUFFICIENT_SAMPLE", generatedAt: new Date().toISOString(), emptyReason: qualifiedDates.length ? null : "目標ペース達成日の実績がありません。" };
}
