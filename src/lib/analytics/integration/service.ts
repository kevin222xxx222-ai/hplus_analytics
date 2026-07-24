import { aggregateVolume, analyzeWeekdays, averageBaseline, calculateEfficiency, classifyGrowth, compareValues, comparisonRange, nextBestAction, summarizeSample, trendFromComparison } from "@/lib/analytics/engine";
import { parseDateOnly } from "@/lib/date";
import { adaptSnapshot } from "./adapter";
import { ANALYTICS_STORE_CODES, fetchAnalyticsSnapshot, type AnalyticsQuery } from "./query";
import { toComparisonDto, toPerformanceDto, toTimeDto, toTrendDto, type AnalyticsSummaryDto, type StoreSummaryDto } from "./dto";

export type AnalyticsRequest = { from: string; to: string; storeCodes?: AnalyticsQuery["storeCodes"]; comparison?: (typeof comparisonKinds)[number] };
const comparisonKinds = ["previousDay", "previousWeek", "previousWeekday", "previousMonth", "previousMonthToDate"] as const;

export function parseAnalyticsParams(params: URLSearchParams): AnalyticsRequest {
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to) throw new Error("from と to は必須です。");
  const store = params.get("store");
  const comparison = params.get("comparison");
  const validComparison = comparisonKinds.includes(comparison as (typeof comparisonKinds)[number]) ? comparison as (typeof comparisonKinds)[number] : undefined;
  if (!store || store === "ALL") return { from, to, comparison: validComparison };
  if (!ANALYTICS_STORE_CODES.includes(store as (typeof ANALYTICS_STORE_CODES)[number])) throw new Error("分析対象外の店舗です。");
  return { from, to, comparison: validComparison, storeCodes: [store as (typeof ANALYTICS_STORE_CODES)[number]] };
}

function queryInput(input: AnalyticsRequest): AnalyticsQuery { return { from: parseDateOnly(input.from), to: parseDateOnly(input.to), storeCodes: input.storeCodes }; }

function rowsForCast(rows: ReturnType<typeof adaptSnapshot>["rows"], castId: string) { return rows.filter((row) => row.castId === castId); }

function growthAvailability(result: ReturnType<typeof classifyGrowth>) {
  if (result.classification === "Data不足") return "INSUFFICIENT_SAMPLE" as const;
  if (result.missingMetrics?.length) return "MISSING" as const;
  return "VALUE" as const;
}

function apiDirection(direction: ReturnType<typeof trendFromComparison>["direction"]): "increase" | "decrease" | "flat" | "unavailable" {
  return direction === "improved" ? "increase" : direction === "worsened" ? "decrease" : direction;
}

function buildSummary(rows: ReturnType<typeof adaptSnapshot>["rows"], casts: ReturnType<typeof adaptSnapshot>["casts"]): AnalyticsSummaryDto {
  const base = casts.map((cast) => { const volume = aggregateVolume(rowsForCast(rows, cast.id))[0]; return { castId: cast.id, volume, efficiency: calculateEfficiency(volume) }; });
  const salesPerHourBaseline = averageBaseline("storeAverage", base.map((item) => item.efficiency.salesPerHour));
  const townExposureBaseline = averageBaseline("storeAverage", base.map((item) => item.volume.metrics.townPv ?? item.volume.metrics.heavenAccess));
  const activityBaseline = averageBaseline("storeAverage", base.map((item) => item.volume.metrics.attendanceMinutes));
  const volume = aggregateVolume(rows)[0];
  const efficiency = calculateEfficiency(volume);
  const growth = classifyGrowth({ confidence: volume.sample.confidence, exposure: volume.metrics.townPv ?? volume.metrics.heavenAccess, exposureBaseline: townExposureBaseline.value, activity: volume.metrics.attendanceMinutes, activityBaseline: activityBaseline.value, efficiency: efficiency.salesPerHour, efficiencyBaseline: salesPerHourBaseline.value, utilizationRate: null, theoreticalMaxAchievementRate: efficiency.theoreticalMaxAchievementRate, attendanceHours: volume.sample.totalAttendanceHours });
  const action = nextBestAction(growth, volume.sample);
  return { volume, efficiency, sample: volume.sample, growth: { classification: growth.classification, availability: growthAvailability(growth), reason: growth.missingMetrics?.length ? `不足指標: ${growth.missingMetrics.join(", ")}` : null, evidence: growth.evidence, score: growth.score }, nextBestAction: { level: action.recommendationLevel, actionLevel: action.recommendationLevel, cause: action.cause, evidence: action.evidence, action: action.action, reason: action.action ? undefined : action.cause, confidence: action.confidence, availability: growthAvailability(growth), status: action.status }, rank: { availability: "UNAVAILABLE", reason: "Rankモデル／Rankカラムが存在しないため利用できません。" } };
}

export function buildPerformanceSummaries(adapted: ReturnType<typeof adaptSnapshot>) {
  const base = adapted.casts.map((cast) => {
    const volume = aggregateVolume(rowsForCast(adapted.rows, cast.id))[0];
    return { castId: cast.id, volume, efficiency: calculateEfficiency(volume) };
  });
  const salesPerHourBaseline = averageBaseline("storeAverage", base.map((item) => item.efficiency.salesPerHour));
  const townExposureBaseline = averageBaseline("storeAverage", base.map((item) => item.volume.metrics.townPv ?? item.volume.metrics.heavenAccess));
  const activityBaseline = averageBaseline("storeAverage", base.map((item) => item.volume.metrics.attendanceMinutes));
  return base.map((item) => {
    const growth = classifyGrowth({ confidence: item.volume.sample.confidence, exposure: item.volume.metrics.townPv ?? item.volume.metrics.heavenAccess, exposureBaseline: townExposureBaseline.value, activity: item.volume.metrics.attendanceMinutes, activityBaseline: activityBaseline.value, efficiency: item.efficiency.salesPerHour, efficiencyBaseline: salesPerHourBaseline.value, utilizationRate: null, theoreticalMaxAchievementRate: item.efficiency.theoreticalMaxAchievementRate, attendanceHours: item.volume.sample.totalAttendanceHours });
    const action = nextBestAction(growth, item.volume.sample);
    return { castId: item.castId, summary: { volume: item.volume, efficiency: item.efficiency, sample: item.volume.sample, growth: { classification: growth.classification, availability: growthAvailability(growth), reason: growth.missingMetrics?.length ? `不足指標: ${growth.missingMetrics.join(", ")}` : null, evidence: growth.evidence, score: growth.score }, nextBestAction: { level: action.recommendationLevel, actionLevel: action.recommendationLevel, cause: action.cause, evidence: action.evidence, action: action.action, reason: action.action ? undefined : action.cause, confidence: action.confidence, availability: growthAvailability(growth), status: action.status }, rank: { availability: "UNAVAILABLE" as const, reason: "Rankモデル／Rankカラムが存在しないため利用できません。" } } };
  });
}

function comparisonSet(currentRows: ReturnType<typeof adaptSnapshot>["rows"], baselineRows: Map<(typeof comparisonKinds)[number], ReturnType<typeof adaptSnapshot>["rows"]>, range: { from: string; to: string }) {
  const current = aggregateVolume(currentRows)[0];
  return comparisonKinds.map((kind) => { const period = comparisonRange(range, kind); const baseline = aggregateVolume(baselineRows.get(kind) ?? [])[0]; const comparison = compareValues(current.metrics.sales, baseline.metrics.sales, kind); return toComparisonDto(comparison, period, baseline.sample, apiDirection(trendFromComparison(comparison).direction)); });
}

function filterBaselineRows(baseline: Map<(typeof comparisonKinds)[number], ReturnType<typeof adaptSnapshot>["rows"]>, predicate: (row: ReturnType<typeof adaptSnapshot>["rows"][number]) => boolean) {
  return new Map([...baseline.entries()].map(([kind, rows]) => [kind, rows.filter(predicate)] as const));
}

async function baselineRows(input: AnalyticsRequest, range: { from: string; to: string }) {
  const rows = await Promise.all(comparisonKinds.map(async (kind) => { const period = comparisonRange(range, kind); const snapshot = adaptSnapshot(await fetchAnalyticsSnapshot({ from: parseDateOnly(period.from), to: parseDateOnly(period.to), storeCodes: input.storeCodes })); return [kind, snapshot.rows] as const; }));
  return new Map(rows);
}

export async function getPerformance(input: AnalyticsRequest) {
  const adapted = adaptSnapshot(await fetchAnalyticsSnapshot(queryInput(input)));
  const range = { from: adapted.from, to: adapted.to };
  const comparisons = await baselineRows(input, range);
  const overall = buildSummary(adapted.rows, adapted.casts);
  overall.comparison = comparisonSet(adapted.rows, comparisons, range);
  const storeSummaries: StoreSummaryDto[] = adapted.stores.map((store) => { const rows = adapted.rows.filter((row) => row.storeId === store.id); const summary = buildSummary(rows, adapted.casts.filter((cast) => rows.some((row) => row.castId === cast.id))); summary.comparison = comparisonSet(rows, filterBaselineRows(comparisons, (row) => row.storeId === store.id), range); return { store, summary }; });
  const castSummaries = buildPerformanceSummaries(adapted).map((item) => { const summary = item.summary as AnalyticsSummaryDto; summary.comparison = comparisonSet(rowsForCast(adapted.rows, item.castId), filterBaselineRows(comparisons, (row) => row.castId === item.castId), range); return { ...item, summary }; });
  return toPerformanceDto(adapted, castSummaries, overall, storeSummaries);
}

export async function getTrend(input: AnalyticsRequest) {
  const adapted = adaptSnapshot(await fetchAnalyticsSnapshot(queryInput(input)));
  const volume = aggregateVolume(adapted.rows)[0];
  const efficiency = calculateEfficiency(volume);
  const comparisons = await baselineRows(input, { from: adapted.from, to: adapted.to });
  const allComparisons = comparisonSet(adapted.rows, comparisons, { from: adapted.from, to: adapted.to });
  const selectedKind = input.comparison ?? "previousMonthToDate";
  const selectedDto = allComparisons.find((item) => item.baselineKind === selectedKind) ?? allComparisons[allComparisons.length - 1];
  const comparison = trendFromComparison(compareValues(volume.metrics.sales, aggregateVolume(comparisons.get(selectedKind) ?? [])[0].metrics.sales, selectedKind));
  const daily = aggregateVolume(adapted.rows, ["period"]).map((dailyVolume) => ({ date: dailyVolume.dimensions.period ?? adapted.from, volume: dailyVolume, efficiency: calculateEfficiency(dailyVolume) }));
  const storeSummaries: StoreSummaryDto[] = adapted.stores.map((store) => { const currentRows = adapted.rows.filter((row) => row.storeId === store.id); const summary = buildSummary(currentRows, adapted.casts.filter((cast) => currentRows.some((row) => row.castId === cast.id))); summary.comparison = comparisonSet(currentRows, filterBaselineRows(comparisons, (row) => row.storeId === store.id), { from: adapted.from, to: adapted.to }); return { store, summary }; });
  return toTrendDto(adapted, { volume, efficiency, sample: volume.sample, trend: comparison }, daily, selectedDto, storeSummaries, allComparisons);
}

export async function getTime(input: AnalyticsRequest) {
  const adapted = adaptSnapshot(await fetchAnalyticsSnapshot(queryInput(input)));
  const overallVolume = aggregateVolume(adapted.rows)[0];
  const storeSummaries: StoreSummaryDto[] = adapted.stores.map((store) => { const rows = adapted.rows.filter((row) => row.storeId === store.id); return { store, summary: buildSummary(rows, adapted.casts.filter((cast) => rows.some((row) => row.castId === cast.id))) }; });
  return toTimeDto(adapted, analyzeWeekdays(adapted.rows), { volume: overallVolume, efficiency: calculateEfficiency(overallVolume), sample: overallVolume.sample }, storeSummaries);
}

export { comparisonRange, summarizeSample };
