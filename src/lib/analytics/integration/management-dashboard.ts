import { aggregateVolume, calculateEfficiency, compareValues, comparisonRange, type Availability, type Confidence, type MetricValue, type SampleSummary } from "@/lib/analytics/engine";
import { getDataHealth } from "@/lib/analytics/data-health";
import { parseDateOnly, formatDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { adaptSnapshot } from "./adapter";
import { fetchAnalyticsSnapshot, ANALYTICS_STORE_CODES, type AnalyticsQuery } from "./query";
import { toComparisonDto, type ComparisonDto } from "./dto";
import type { StoreCode } from "@/generated/prisma/client";

export type ManagementComparison = "previousDay" | "previousWeekday" | "previousMonthToDate";
export type ManagementStatus = "CHECK_FIRST" | "CHECK_RECOMMENDED" | "NO_MAJOR_CHANGE" | "DATA_CHECK_REQUIRED";
export type DashboardMetric = { value: MetricValue; availability: Availability; confidence: Confidence; sample: SampleSummary };

type StoreItem = {
  storeId: string; storeName: string; storeCode: StoreCode;
  sample: { businessDays: DashboardMetric; attendanceCount: DashboardMetric; castCount: DashboardMetric; workHours: DashboardMetric };
  efficiency: { salesPerHour: DashboardMetric; contractsPerAttendance: DashboardMetric; nominationRate: DashboardMetric; averageUnitPrice: DashboardMetric };
  volume: { sales: DashboardMetric; reservations: DashboardMetric; contracts: DashboardMetric; attendanceCount: DashboardMetric; workHours: DashboardMetric };
  goal: { goalSales: DashboardMetric; achievementRate: DashboardMetric; remainingGap: DashboardMetric; projectedSales: DashboardMetric };
  media: { townPv: DashboardMetric; townUu: DashboardMetric; heavenAccess: DashboardMetric; heavenDiaryPosts: DashboardMetric };
  dataHealth: { status: "正常" | "注意" | "要対応" | "対象外"; latest: string | null; pending: number; failed: number; openErrors: number };
  comparison: ComparisonDto[];
  detailUrls: { store: string; trend: string; time: string; diary: string; dataHealth: string };
};

export type ManagementDashboardDto = {
  meta: { from: string; to: string; comparison: ManagementComparison; selectedStoreCodes: StoreCode[]; generatedAt: string; latestConfirmedDate: string | null; timezone: string; availability: Availability; confidence: Confidence };
  dataHealth: { status: "正常" | "注意" | "要対応"; pending: number; failed: number; openErrors: number; latest: string | null; detailUrl: string };
  summary: { sales: DashboardMetric; goal: DashboardMetric; achievementRate: DashboardMetric; projectedSales: DashboardMetric; salesPerHour: DashboardMetric; dataHealthStatus: string };
  stores: StoreItem[];
  priorities: Array<{ storeId: string; storeName: string; status: ManagementStatus; title: string; situation: string; evidence: string[]; recommendedDestination: string; detailUrl: string; availability: Availability; confidence: Confidence; sample: SampleSummary }>;
  charts: { salesByStore: Array<{ storeId: string; storeName: string; value: number | null; availability: Availability }>; salesPerHourByStore: Array<{ storeId: string; storeName: string; value: number | null; availability: Availability }>; salesTrend: Array<{ date: string; stores: Array<{ storeId: string; storeName: string; value: number | null; availability: Availability }> }> };
  media: Array<{ storeId: string; storeName: string; townPv: DashboardMetric; townUu: DashboardMetric; heavenAccess: DashboardMetric; heavenDiaryPosts: DashboardMetric }>;
  quickLinks: Array<{ label: string; href: string; description: string }>;
  notes: string[];
};

const emptyMetric = (sample: SampleSummary, availability: Availability = "MISSING"): DashboardMetric => ({ value: null, availability, confidence: sample.confidence, sample });
const metric = (value: MetricValue, sample: SampleSummary, availability?: Availability): DashboardMetric => ({ value, availability: availability ?? (value === null ? "MISSING" : value === 0 ? "ZERO" : "VALUE"), confidence: sample.confidence, sample });
const sampleOf = (rows: ReturnType<typeof adaptSnapshot>["rows"]): SampleSummary => aggregateVolume(rows)[0].sample;
const rowsForStore = (rows: ReturnType<typeof adaptSnapshot>["rows"], id: string) => rows.filter((row) => row.storeId === id);
const storeQueryCodes = (codes?: string[]): StoreCode[] => {
  const requested = codes?.filter((code): code is StoreCode => ANALYTICS_STORE_CODES.includes(code as StoreCode)) ?? [];
  return requested.length ? [...new Set(requested)] : [...ANALYTICS_STORE_CODES];
};
const comparisonKinds: ManagementComparison[] = ["previousDay", "previousWeekday", "previousMonthToDate"];

function safeComparison(current: number | null, baseline: number | null, kind: ManagementComparison, period: { from: string; to: string }, sample: SampleSummary) {
  return toComparisonDto(compareValues(current, baseline, kind), period, sample);
}

export async function getManagementDashboard(input: { from: string; to: string; storeCodes?: string[]; comparison?: string }): Promise<ManagementDashboardDto> {
  const from = parseDateOnly(input.from); const to = parseDateOnly(input.to); const selectedCodes = storeQueryCodes(input.storeCodes); const comparison = comparisonKinds.includes(input.comparison as ManagementComparison) ? input.comparison as ManagementComparison : "previousWeekday";
  const range = { from: formatDateOnly(from), to: formatDateOnly(to) };
  const selectedQuery: AnalyticsQuery = { from, to, storeCodes: selectedCodes };
  const comparisonPeriods = Object.fromEntries(comparisonKinds.map((kind) => [kind, comparisonRange(range, kind)])) as Record<ManagementComparison, { from: string; to: string }>;
  const [currentSnapshot, baselineSnapshots, health, storeHealthResults, overallGoal] = await Promise.all([
    fetchAnalyticsSnapshot(selectedQuery),
    Promise.all(comparisonKinds.map(async (kind) => [kind, adaptSnapshot(await fetchAnalyticsSnapshot({ from: parseDateOnly(comparisonPeriods[kind].from), to: parseDateOnly(comparisonPeriods[kind].to), storeCodes: selectedCodes }))] as const)),
    getDataHealth({ from, to, scope: "ALL", media: "ALL" }),
    Promise.all(ANALYTICS_STORE_CODES.filter((code) => code !== "KUKI").map(async (code) => [code, await getDataHealth({ from, to, scope: code as "KASUKABE" | "KOSHIGAYA" | "NODA", media: "ALL" })] as const)),
    prisma.monthlyGoal.findUnique({ where: { targetMonth_scopeKey: { targetMonth: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)), scopeKey: "OVERALL" } } }),
  ]);
  const storeHealth = new Map(storeHealthResults);
  const current = adaptSnapshot(currentSnapshot); const baselines = new Map(baselineSnapshots); const allRows = current.rows; const allVolume = aggregateVolume(allRows)[0]; const allEfficiency = calculateEfficiency(allVolume); const allSample = allVolume.sample;
  const goalValue = overallGoal?.salesTarget == null ? null : Number(overallGoal.salesTarget); const achievement = goalValue && allVolume.metrics.sales !== null ? allVolume.metrics.sales / goalValue : null;
  const elapsedDays = Math.max(1, Math.min(Math.ceil((Date.now() - from.getTime()) / 86400000), Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1))); const periodDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1); const projected = allVolume.metrics.sales === null ? null : allVolume.metrics.sales / elapsedDays * periodDays;
  const sampleMetric = (value: MetricValue, availability?: Availability) => metric(value, allSample, availability);
  const summary = { sales: sampleMetric(allVolume.metrics.sales), goal: sampleMetric(goalValue, goalValue === null ? "MISSING" : undefined), achievementRate: sampleMetric(achievement, goalValue === null ? "UNCOMPUTABLE" : undefined), projectedSales: sampleMetric(projected), salesPerHour: sampleMetric(allEfficiency.salesPerHour, allEfficiency.metricAvailability.salesPerHour), dataHealthStatus: health.state };
  const selectedStores = current.stores;
  const storeItems: StoreItem[] = selectedStores.map((store) => {
    const rows = rowsForStore(allRows, store.id); const volume = aggregateVolume(rows)[0]; const efficiency = calculateEfficiency(volume); const sample = volume.sample; const baselineRows = baselines.get(comparison) ? rowsForStore(baselines.get(comparison)!.rows, store.id) : []; const baselineVolume = aggregateVolume(baselineRows)[0]; const healthForStore = storeHealth.get(store.code as "KASUKABE" | "KOSHIGAYA" | "NODA");
    const storeGoal = emptyMetric(sample, "UNAVAILABLE");
    const c = safeComparison(volume.metrics.sales, baselineVolume.metrics.sales, comparison, comparisonPeriods[comparison], baselineVolume.sample);
    const availability = healthForStore?.state ?? "正常";
    const m = (key: keyof typeof volume.metrics) => metric(volume.metrics[key], sample, volume.metricAvailability[key]);
    return { storeId: store.id, storeName: store.shortName, storeCode: store.code, sample: { businessDays: metric(sample.targetDays, sample), attendanceCount: metric(sample.attendanceCount, sample), castCount: metric(sample.uniqueCastCount, sample), workHours: metric(sample.totalAttendanceHours, sample) }, efficiency: { salesPerHour: metric(efficiency.salesPerHour, sample, efficiency.metricAvailability.salesPerHour), contractsPerAttendance: emptyMetric(sample, "UNAVAILABLE"), nominationRate: metric(efficiency.regularNominationRate, sample, efficiency.metricAvailability.regularNominationRate), averageUnitPrice: metric(efficiency.averageUnitPrice, sample, efficiency.metricAvailability.averageUnitPrice) }, volume: { sales: m("sales"), reservations: m("reservations"), contracts: emptyMetric(sample, "UNAVAILABLE"), attendanceCount: m("attendancePeople"), workHours: metric(volume.metrics.attendanceMinutes === null ? null : volume.metrics.attendanceMinutes / 60, sample, volume.metricAvailability.attendanceMinutes) }, goal: { goalSales: storeGoal, achievementRate: emptyMetric(sample, "UNAVAILABLE"), remainingGap: emptyMetric(sample, "UNAVAILABLE"), projectedSales: emptyMetric(sample, "UNAVAILABLE") }, media: { townPv: m("townPv"), townUu: m("townUu"), heavenAccess: m("heavenAccess"), heavenDiaryPosts: m("diaryPosts") }, dataHealth: { status: availability, latest: healthForStore?.summary.latestReflectedDate ?? null, pending: healthForStore?.summary.pendingBatches ?? 0, failed: healthForStore?.summary.failedBatches ?? 0, openErrors: healthForStore?.summary.warnings ?? 0 }, comparison: [c], detailUrls: { store: `/analytics/store?from=${range.from}&to=${range.to}&store=${store.code}`, trend: `/analytics/trend?from=${range.from}&to=${range.to}&store=${store.code}&comparison=${comparison}`, time: `/analytics/time?from=${range.from}&to=${range.to}&store=${store.code}`, diary: `/analytics/diary?from=${range.from}&to=${range.to}&store=${store.code}`, dataHealth: `/data-health?period=custom&from=${range.from}&to=${range.to}&scope=${store.code}` } };
  });
  const priorities = storeItems.map((store) => { const c = store.comparison[0]; const sample = sampleOf(rowsForStore(allRows, store.storeId)); const severeHealth = store.dataHealth.status === "要対応"; const decline = c.availability === "VALUE" && c.differenceRate !== null && c.differenceRate <= -0.2; const status: ManagementStatus = severeHealth ? "DATA_CHECK_REQUIRED" : sample.confidence === "Insufficient" ? "DATA_CHECK_REQUIRED" : decline ? "CHECK_RECOMMENDED" : "NO_MAJOR_CHANGE"; const title = status === "DATA_CHECK_REQUIRED" ? "データ確認が必要" : status === "CHECK_RECOMMENDED" ? "確認推奨" : "大きな変化なし"; const situation = status === "CHECK_RECOMMENDED" ? `${store.storeName}は比較期間より売上が低下しています。` : status === "DATA_CHECK_REQUIRED" ? `${store.storeName}はデータ状態または母数を確認してください。` : `${store.storeName}は大きな変化が確認されていません。`; const evidence = status === "CHECK_RECOMMENDED" ? [`売上差異率 ${((c.differenceRate ?? 0) * 100).toFixed(1)}%`, `比較基準：${c.baselineKind}`] : [`信頼度：${sample.confidence}`, `対象日数：${sample.targetDays}日`]; return { storeId: store.storeId, storeName: store.storeName, status, title, situation, evidence, recommendedDestination: status === "DATA_CHECK_REQUIRED" ? "DATA HEALTH" : "店舗分析", detailUrl: status === "DATA_CHECK_REQUIRED" ? store.detailUrls.dataHealth : store.detailUrls.store, availability: c.availability, confidence: sample.confidence, sample }; }).sort((a, b) => (a.status === "DATA_CHECK_REQUIRED" ? 0 : a.status === "CHECK_RECOMMENDED" ? 1 : 2) - (b.status === "DATA_CHECK_REQUIRED" ? 0 : b.status === "CHECK_RECOMMENDED" ? 1 : 2) || a.storeName.localeCompare(b.storeName, "ja"));
  const dateOnly = (value: Date | string) => formatDateOnly(typeof value === "string" ? parseDateOnly(value) : value);
  const dates = [...new Set(allRows.filter((row) => row.media === "CTI").map((row) => dateOnly(row.date)))].sort(); const charts = { salesByStore: storeItems.map((s) => ({ storeId: s.storeId, storeName: s.storeName, value: s.volume.sales.value, availability: s.volume.sales.availability })), salesPerHourByStore: storeItems.map((s) => ({ storeId: s.storeId, storeName: s.storeName, value: s.efficiency.salesPerHour.value, availability: s.efficiency.salesPerHour.availability })), salesTrend: dates.map((date) => ({ date, stores: storeItems.map((store) => { const rows = allRows.filter((row) => row.media === "CTI" && row.storeId === store.storeId && dateOnly(row.date) === date); const value = aggregateVolume(rows)[0].metrics.sales; return { storeId: store.storeId, storeName: store.storeName, value, availability: value === null ? "MISSING" as const : value === 0 ? "ZERO" as const : "VALUE" as const }; }) })) };
  const media = storeItems.map((s) => ({ storeId: s.storeId, storeName: s.storeName, townPv: s.media.townPv, townUu: s.media.townUu, heavenAccess: s.media.heavenAccess, heavenDiaryPosts: s.media.heavenDiaryPosts }));
  return { meta: { from: range.from, to: range.to, comparison, selectedStoreCodes: selectedCodes, generatedAt: new Date().toISOString(), latestConfirmedDate: health.summary.latestReflectedDate, timezone: "Asia/Tokyo", availability: allRows.length ? "VALUE" : "MISSING", confidence: allSample.confidence }, dataHealth: { status: health.state, pending: health.summary.pendingBatches, failed: health.summary.failedBatches, openErrors: health.summary.warnings, latest: health.summary.latestReflectedDate, detailUrl: `/data-health?period=custom&from=${range.from}&to=${range.to}&scope=ALL` }, summary, stores: storeItems, priorities, charts, media, quickLinks: [{ label: "店舗分析", href: `/analytics/store?from=${range.from}&to=${range.to}&store=ALL`, description: "店舗内訳を確認" }, { label: "推移分析", href: `/analytics/trend?from=${range.from}&to=${range.to}&store=ALL&comparison=${comparison}`, description: "変化した時期を確認" }, { label: "曜日分析", href: `/analytics/time?from=${range.from}&to=${range.to}&store=ALL`, description: "曜日差を確認" }, { label: "DATA HEALTH", href: `/data-health?period=custom&from=${range.from}&to=${range.to}&scope=ALL`, description: "データ状態を確認" }], notes: ["Sample → Efficiency → Volumeの順で確認してください。", "TownとHeavenは合算していません。媒体から予約・成約への直接経路は特定していません。", "対象外媒体とデータ不足は0として表示していません。"] };
}
