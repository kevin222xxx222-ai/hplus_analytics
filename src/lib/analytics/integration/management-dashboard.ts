import { aggregateVolume, calculateEfficiency, compareValues, comparisonRange, type Availability, type Confidence, type MetricValue, type SampleSummary } from "@/lib/analytics/engine";
import { getDataHealth } from "@/lib/analytics/data-health";
import { parseDateOnly, formatDateOnly } from "@/lib/date";
import { adaptSnapshot } from "./adapter";
import { fetchAnalyticsSnapshot, ANALYTICS_STORE_CODES } from "./query";
import { toComparisonDto, type ComparisonDto } from "./dto";
import type { StoreCode } from "@/generated/prisma/client";

export type ManagementComparison = "previousDay" | "previousWeekday" | "previousMonthToDate";
export type DashboardMetric = { value: MetricValue; availability: Availability; confidence: Confidence; sample: SampleSummary; previousPeriod?: ComparisonDto | null; previousMonthSamePeriod?: ComparisonDto | null };
export type DashboardDataState = "available" | "partial" | "unavailable" | "not_applicable";
export type DashboardTrendState = "improving" | "stable" | "declining" | "insufficient_data";
export type StoreStateMetric = { metricId: string; label: string; currentValue: number | null; comparisonRate: number | null; trendState: DashboardTrendState; explanation: string };
export type StoreStateDto = { storeId: string; storeName: string; dataState: DashboardDataState; overallTrendState: DashboardTrendState | "mixed"; observations: StoreStateMetric[]; upwardMetrics: StoreStateMetric[]; downwardMetrics: StoreStateMetric[]; evidence: string[]; detailLinks: Array<{ label: string; href: string; description: string }> };
export type DashboardChartAvailability = "available" | "partial" | "unavailable" | "not_applicable";
export type DashboardChartValue = { date: string; value: number | null; formattedValue: string; availability: DashboardChartAvailability; sampleValue: number | null; sampleLabel: string | null; explanation: string | null; previousDayDifference: number | null; previousWeekdayDifference: number | null };
export type DashboardChartSeriesDto = { seriesId: string; storeId: string | null; storeName: string; values: DashboardChartValue[] };
export type DashboardChartDto = { chartId: string; title: string; description: string; metricId: string; chartType: "line" | "bar"; valueType: "currency" | "integer" | "decimal" | "hours" | "percentage"; unitLabel: string; xAxis: { type: "business_date"; labels: string[] }; series: DashboardChartSeriesDto[]; tooltip: { showDate: boolean; showComparison: boolean; showAvailability: boolean; showSample: boolean }; dataHealth: { state: DashboardChartAvailability; latestDate: string | null; missingDates: string[]; explanation: string }; emptyState: { isEmpty: boolean; title: string | null; description: string | null } };
export type DashboardStoryId = "sales_outcome" | "operations_outcome" | "town_funnel" | "heaven_funnel" | "nomination";
export type DashboardStoryScopeBlockDto = { scopeId: string; scopeLabel: string; scopeType: "overall" | "store" | "media_scope"; charts: DashboardChartDto[]; notes: string[]; navigation: Array<{ label: string; href: string; description: string }> };
export type DashboardStorySectionDto = { storyId: DashboardStoryId; title: string; description: string; scopeBlocks: DashboardStoryScopeBlockDto[]; dataHealth: { state: DashboardChartAvailability; latestDate: string | null; missingDates: string[]; explanation: string } };
export type DashboardRelationshipAxisDto = { metricId: string; label: string; side: "left" | "right"; renderType: "bar" | "line"; valueType: "currency" | "integer" | "decimal" | "hours"; unitLabel: string; startAtZero: boolean; colorToken: string };
export type RelationshipDirection = "same" | "opposite" | "unchanged" | "insufficient_data";
export type DashboardRelationshipChartDto = { chartId: string; relationshipId: "sales_contract" | "sales_attendance" | "sales_working_hours" | "sales_town_pv" | "sales_town_uu" | "town_pv_contract" | "town_pv_uu" | "town_heaven_access" | "diary_page_access" | "page_access_mitene" | "page_access_okini" | "sales_page_access" | "contract_page_access" | "sales_nomination"; title: string; description: string; scope: { scopeId: string; scopeLabel: string; scopeType: "overall" | "store" | "media_scope" }; xAxis: { type: "business_date"; dates: string[]; labels: string[] }; leftAxis: DashboardRelationshipAxisDto; rightAxis: DashboardRelationshipAxisDto; values: Array<{ date: string; leftValue: number | null; leftFormattedValue: string; rightValue: number | null; rightFormattedValue: string; leftAvailability: DashboardChartAvailability; rightAvailability: DashboardChartAvailability; previousDayDirection: RelationshipDirection; previousDayLeftDifference: number | null; previousDayRightDifference: number | null; explanation: string | null }>; relationshipSummary: { sameDirectionDays: number; oppositeDirectionDays: number; unchangedDays: number; insufficientDataDays: number; comparableDays: number; directionMatchRate: number | null; explanation: string }; dataHealth: { state: DashboardChartAvailability; latestDate: string | null; missingDates: string[]; note: string | null }; navigation: Array<{ label: string; href: string; description: string }> };
export type DashboardStoryCardDto = {
  cardId: string;
  storyId: "sales_trend" | "sales_outcome" | "sales_operations" | "town_performance" | "heaven_performance" | "sales_nomination";
  scope: { scopeId: string; scopeLabel: string; scopeType: "overall" | "store" | "media_scope" };
  title: string;
  description: string | null;
  headlineMetrics: Array<{ metricId: string; label: string; value: number | null; formattedValue: string; comparisonText: string | null; availability: DashboardChartAvailability }>;
  charts: DashboardRelationshipChartDto[];
  relationshipSummary: { primaryText: string; secondaryText: string | null; explanation: string } | null;
  dataHealth: { state: DashboardChartAvailability; latestDate: string | null; missingDates: string[]; note: string | null };
  notes: string[];
  navigation: Array<{ label: string; href: string; description: string }>;
  trendCharts?: DashboardChartDto[];
  displayPolicy: { isVisible: true; reason: "supported" | "business_data_constraint" | "insufficient_data" };
  dataReliability: { level: "official" | "limited" | "unavailable"; explanation: string | null };
};

type StoreItem = {
  storeId: string; storeName: string; storeCode: StoreCode;
  sample: { businessDays: DashboardMetric; attendanceCount: DashboardMetric; averageDailyAttendance: DashboardMetric; castCount: DashboardMetric; workHours: DashboardMetric };
  efficiency: { salesPerHour: DashboardMetric; nominationRate: DashboardMetric; averageUnitPrice: DashboardMetric };
  volume: { sales: DashboardMetric; reservations: DashboardMetric; contracts: DashboardMetric; attendanceCount: DashboardMetric; workHours: DashboardMetric; nominationCount: DashboardMetric };
  media: { townPv: DashboardMetric; townUu: DashboardMetric; heavenAccess: DashboardMetric; heavenDiaryPosts: DashboardMetric; heavenMiteneSent: DashboardMetric };
  dataHealth: { status: "正常" | "注意" | "要対応" | "対象外"; latest: string | null; pending: number; failed: number; openErrors: number };
  comparison: ComparisonDto[];
  detailUrls: { store: string; trend: string; time: string; cast: string; dataHealth: string };
};
export type StoreOverviewCardDto = {
  store: StoreItem;
  state: StoreStateDto;
  comparisonLabel: "前月同期間比";
  notes: string[];
};

export type ManagementDashboardDto = {
  context: { businessMonth: string; from: string; to: string; latestReflectedDate: string | null; storeScope: "ALL_STORES"; displayMode: "FIXED_CURRENT_MONTH" };
  dataHealth: { status: "正常" | "注意" | "要対応"; pending: number; failed: number; openErrors: number; latest: string | null; detailUrl: string };
  summary: { sales: DashboardMetric; contractCount: DashboardMetric; reservationCount: DashboardMetric; attendanceCountTotal: DashboardMetric; averageDailyAttendance: DashboardMetric; uniqueCastCount: DashboardMetric; workingHours: DashboardMetric; salesPerHour: DashboardMetric; averageUnitPrice: DashboardMetric; nominationCount: DashboardMetric; nominationRate: DashboardMetric };
  storeComposition: Array<{ storeId: string; storeName: string; sales: DashboardMetric; salesShare: DashboardMetric; contractCount: DashboardMetric; contractShare: DashboardMetric; attendanceCount: DashboardMetric; workHours: DashboardMetric }>;
  storeStates: StoreStateDto[];
  stores: StoreItem[];
  storeOverview: StoreOverviewCardDto[];
  navigation: Array<{ label: string; href: string; description: string }>;
  dailyCharts: DashboardChartDto[];
  storySections: DashboardStorySectionDto[];
  relationships: DashboardRelationshipChartDto[];
  storyCards: DashboardStoryCardDto[];
  media: Array<{ storeId: string; storeName: string; townPv: DashboardMetric; townUu: DashboardMetric; heavenAccess: DashboardMetric; heavenDiaryPosts: DashboardMetric; heavenMiteneSent: DashboardMetric }>;
  notes: string[];
};

const metric = (value: MetricValue, sample: SampleSummary, availability?: Availability): DashboardMetric => ({ value, availability: availability ?? (value === null ? "MISSING" : value === 0 ? "ZERO" : "VALUE"), confidence: sample.confidence, sample });
const emptyMetric = (sample: SampleSummary, availability: Availability = "MISSING"): DashboardMetric => metric(null, sample, availability);
const addComparisons = (base: DashboardMetric, current: number | null, previous: number | null, month: number | null, previousPeriod: { from: string; to: string }, monthPeriod: { from: string; to: string }, sample: SampleSummary): DashboardMetric => ({ ...base, previousPeriod: toComparisonDto(compareValues(current, previous, "previousWeekday"), previousPeriod, sample), previousMonthSamePeriod: toComparisonDto(compareValues(current, month, "previousMonthToDate"), monthPeriod, sample) });
const rowsForStore = (rows: ReturnType<typeof adaptSnapshot>["rows"], id: string) => rows.filter((row) => row.storeId === id);
const trendState = (comparison: ComparisonDto | undefined): DashboardTrendState => {
  if (!comparison || comparison.availability !== "VALUE" || comparison.differenceRate === null) return "insufficient_data";
  if (comparison.differenceRate > 0.02) return "improving";
  if (comparison.differenceRate < -0.02) return "declining";
  return "stable";
};
const dataState = (health: "正常" | "注意" | "要対応" | "対象外" | undefined, hasRows: boolean): DashboardDataState => !hasRows ? "unavailable" : health === "注意" || health === "要対応" ? "partial" : health === "対象外" ? "not_applicable" : "available";
const chartAvailability = (value: number | null, hasRows: boolean, applicable = true): DashboardChartAvailability => !applicable ? "not_applicable" : !hasRows ? "unavailable" : value === null ? "partial" : "available";
const fmtChartValue = (value: number | null, type: DashboardChartDto["valueType"]) => value === null ? "—" : type === "currency" ? `¥${Math.round(value).toLocaleString("ja-JP")}` : type === "hours" ? `${value.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}時間` : type === "percentage" ? `${(value * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%` : value.toLocaleString("ja-JP", { maximumFractionDigits: type === "decimal" ? 1 : 0 });
const allDates = (from: Date, to: Date) => { const dates: string[] = []; for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) dates.push(formatDateOnly(d)); return dates; };

export function buildDailyCharts(current: ReturnType<typeof adaptSnapshot>, from: Date, to: Date): DashboardChartDto[] {
  const dates = allDates(from, to);
  const configs: Array<{ id: string; title: string; description: string; metricId: string; chartType: "line" | "bar"; valueType: DashboardChartDto["valueType"]; unit: string; media: "CTI" | "TOWN" | "HEAVEN"; metric: keyof ReturnType<typeof aggregateVolume>[number]["metrics"]; applicable: (code: StoreCode) => boolean; overall: boolean }> = [
    { id: "sales-daily", title: "日別売上推移", description: "女子報酬控除前の店舗売上を営業日ごとに比較します。", metricId: "ctiSales", chartType: "line", valueType: "currency", unit: "円", media: "CTI", metric: "sales", applicable: () => true, overall: true },
    { id: "contracts-daily", title: "日別成約数", description: "予約数ではなく正式な成約数を表示します。", metricId: "contracts", chartType: "bar", valueType: "integer", unit: "件", media: "CTI", metric: "contracts", applicable: () => true, overall: true },
    { id: "attendance-daily", title: "日別出勤人数", description: "各営業日の延べ出勤人数です。期間内ユニーク出勤者とは別集計です。", metricId: "ctiAttendanceCount", chartType: "bar", valueType: "integer", unit: "人", media: "CTI", metric: "attendancePeople", applicable: () => true, overall: true },
    { id: "work-hours-daily", title: "日別出勤時間", description: "各営業日の総出勤時間を表示します。", metricId: "ctiWorkHours", chartType: "bar", valueType: "hours", unit: "時間", media: "CTI", metric: "attendanceMinutes", applicable: () => true, overall: true },
    { id: "town-pv-daily", title: "Town PV", description: "Town店舗対象のPVです。野田は対象外です。", metricId: "townStorePv", chartType: "line", valueType: "integer", unit: "PV", media: "TOWN", metric: "townPv", applicable: (code) => code === "KASUKABE" || code === "KOSHIGAYA", overall: true },
    { id: "town-uu-daily", title: "Town UU", description: "Town店舗対象のUUです。PVとは別グラフです。", metricId: "townStoreUu", chartType: "line", valueType: "integer", unit: "UU", media: "TOWN", metric: "townUu", applicable: (code) => code === "KASUKABE" || code === "KOSHIGAYA", overall: true },
    { id: "heaven-access-daily", title: "Heaven PAGE_ACCESS", description: "春日部のHeaven女子ページアクセスです。", metricId: "heavenGirlPageAccess", chartType: "line", valueType: "integer", unit: "件", media: "HEAVEN", metric: "heavenAccess", applicable: (code) => code === "KASUKABE", overall: false },
    { id: "heaven-diary-daily", title: "Heaven DIARY_POSTS", description: "Heavenの正式な写メ日記投稿イベント数です。PVではありません。", metricId: "heavenDiaryPostCount", chartType: "line", valueType: "integer", unit: "件", media: "HEAVEN", metric: "heavenDiaryPosts", applicable: (code) => code === "KASUKABE", overall: false },
    { id: "heaven-mitene-daily", title: "Heaven MITENE_SENT", description: "Heavenのミテネ送信数です。売上との直接比較は行いません。", metricId: "heavenMiteneSent", chartType: "line", valueType: "integer", unit: "件", media: "HEAVEN", metric: "heavenMiteneSent", applicable: (code) => code === "KASUKABE", overall: false },
    { id: "nomination-daily", title: "日別本指名数", description: "CTIの本指名数を営業日ごとに表示します。", metricId: "ctiNominationCount", chartType: "bar", valueType: "integer", unit: "件", media: "CTI", metric: "regularNominations", applicable: () => true, overall: true },
    { id: "nomination-rate-daily", title: "日別本指名率", description: "本指名数 ÷ 接客数。日次率は母数の影響を受けます。", metricId: "regularRate", chartType: "line", valueType: "percentage", unit: "%", media: "CTI", metric: "regularNominations", applicable: () => true, overall: true },
  ];
  return configs.map((config) => {
    const applicableStores = current.stores.filter((store) => config.applicable(store.code));
    const seriesStores = config.overall && applicableStores.length > 1 ? [{ id: "overall", name: "全体", storeIds: applicableStores.map((store) => store.id) }, ...applicableStores.map((store) => ({ id: store.code, name: store.shortName, storeIds: [store.id] }))] : applicableStores.map((store) => ({ id: store.code, name: store.shortName, storeIds: [store.id] }));
    const rawFor = (storeIdsForSeries: string[], date: string) => current.rows.filter((row) => row.media === config.media && storeIdsForSeries.includes(row.storeId ?? "") && formatDateOnly(typeof row.date === "string" ? parseDateOnly(row.date) : row.date) === date);
    const valueFor = (rows: ReturnType<typeof adaptSnapshot>["rows"]) => { const summary = aggregateVolume(rows)[0]; if (config.id === "sales-per-hour-daily") return calculateEfficiency(summary).salesPerHour; if (config.id === "nomination-rate-daily") return calculateEfficiency(summary).regularNominationRate; if (config.metric === "attendanceMinutes") return summary.metrics.attendanceMinutes === null ? null : summary.metrics.attendanceMinutes / 60; return summary.metrics[config.metric]; };
    const series = seriesStores.map((seriesStore) => { const rawValues = dates.map((date) => { const rows = rawFor(seriesStore.storeIds, date); const value = valueFor(rows); return { date, value, formattedValue: fmtChartValue(value, config.valueType), availability: chartAvailability(value, rows.length > 0, true), sampleValue: rows.length, sampleLabel: "対象行数", explanation: value === null ? "対象日に値がありません。" : null, previousDayDifference: null, previousWeekdayDifference: null }; }); const valuesByDate = new Map(rawValues.map((item) => [item.date, item.value])); const values = rawValues.map((item, index) => ({ ...item, previousDayDifference: index > 0 && item.value !== null && valuesByDate.get(dates[index - 1]) !== null ? item.value - (valuesByDate.get(dates[index - 1]) as number) : null, previousWeekdayDifference: index >= 7 && item.value !== null && valuesByDate.get(dates[index - 7]) !== null ? item.value - (valuesByDate.get(dates[index - 7]) as number) : null })); return { seriesId: seriesStore.id, storeId: seriesStore.id === "overall" ? null : seriesStore.storeIds[0], storeName: seriesStore.name, values }; });
    const missingDates = dates.filter((date) => series.every((item) => item.values.find((value) => value.date === date)?.value === null));
    const hasValue = series.some((item) => item.values.some((value) => value.value !== null)); const state: DashboardChartAvailability = !hasValue ? "unavailable" : missingDates.length ? "partial" : "available";
    return { chartId: config.id, title: config.title, description: config.description, metricId: config.metricId, chartType: config.chartType, valueType: config.valueType, unitLabel: config.unit, xAxis: { type: "business_date", labels: dates }, series, tooltip: { showDate: true, showComparison: true, showAvailability: true, showSample: true }, dataHealth: { state, latestDate: dates.filter((date) => series.some((item) => item.values.find((value) => value.date === date)?.value !== null)).at(-1) ?? null, missingDates, explanation: missingDates.length ? `${missingDates.length}日が未取得または欠測です。` : "対象期間のデータを取得済みです。" }, emptyState: { isEmpty: !hasValue, title: !hasValue ? "利用できる日次データがありません" : null, description: !hasValue ? "DATA HEALTHで対象期間と取得状態を確認してください。" : null } };
  });
}

/** Recompose the existing chart DTO once at the integration boundary into the Dashboard story.
 * The UI receives ready-to-render scope blocks and never filters, aggregates, or infers scope. */
export function buildStorySections(charts: DashboardChartDto[]): DashboardStorySectionDto[] {
  const definitions: Array<{ storyId: DashboardStoryId; title: string; description: string; chartIds: string[]; scope: "all" | "town" | "heaven" }> = [
    { storyId: "sales_outcome", title: "売上と成約数", description: "売上と成約数を同じ営業日軸で確認します。変化が同時に起きているかを観察し、詳細分析が必要な日を見つけます。", chartIds: ["sales-daily", "contracts-daily"], scope: "all" },
    { storyId: "operations_outcome", title: "稼働と成果", description: "日ごとの運営量と成約数を確認します。越谷・野田の出勤時間には店舗計上上の制約があるため、参考情報として扱います。", chartIds: ["attendance-daily", "work-hours-daily", "contracts-daily"], scope: "all" },
    { storyId: "town_funnel", title: "Town集客と成果", description: "Townの閲覧量と、同じ店舗範囲の成約・売上を同じ営業日軸で確認します。媒体が成果へ影響したと断定せず、同時変化を観察します。", chartIds: ["town-pv-daily", "town-uu-daily", "contracts-daily", "sales-daily"], scope: "town" },
    { storyId: "heaven_funnel", title: "Heaven活動・閲覧・成果", description: "Heavenの写メ日記投稿、ページ閲覧、成約、売上を同じ営業日軸で確認します。活動量と成果の同時変化を観察します。", chartIds: ["heaven-diary-daily", "heaven-access-daily", "contracts-daily", "sales-daily"], scope: "heaven" },
    { storyId: "nomination", title: "本指名の状態", description: "本指名数と本指名率を確認します。日次率は接客数が少ない日に大きく変動するため、件数とあわせて確認してください。", chartIds: ["nomination-daily", "nomination-rate-daily"], scope: "all" },
  ];
  const chartById = new Map(charts.map((chart) => [chart.chartId, chart]));
  const makeChart = (source: DashboardChartDto, seriesId: string, townScope = false) => {
    if (townScope && seriesId === "overall" && (source.chartId.startsWith("sales-daily") || source.chartId.startsWith("contracts-daily"))) {
      const kas = source.series.find((series) => series.seriesId === "KASUKABE"); const kos = source.series.find((series) => series.seriesId === "KOSHIGAYA");
      if (kas && kos) {
        const values = kas.values.map((point, index) => { const other = kos.values[index]; const value = point.value === null && other?.value === null ? null : (point.value ?? 0) + (other?.value ?? 0); return { ...point, value, formattedValue: value === null ? "—" : source.valueType === "currency" ? `¥${Math.round(value).toLocaleString("ja-JP")}` : value.toLocaleString("ja-JP"), availability: value === null ? "unavailable" as const : "available" as const }; });
        return { ...source, chartId: `${source.chartId}-town-overall`, series: [{ ...kas, seriesId: "overall", storeId: null, storeName: "Town対象全体", values }] };
      }
    }
    return { ...source, chartId: `${source.chartId}-${seriesId.toLowerCase()}`, series: source.series.filter((series) => series.seriesId === seriesId) };
  };
  const block = (scopeId: string, label: string, sourceCharts: DashboardChartDto[], scopeType: DashboardStoryScopeBlockDto["scopeType"], notes: string[] = []): DashboardStoryScopeBlockDto => ({ scopeId, scopeLabel: label, scopeType, charts: sourceCharts, notes, navigation: [] });
  return definitions.map((definition) => {
    const sourceCharts = definition.chartIds.map((id) => chartById.get(id)).filter((chart): chart is DashboardChartDto => Boolean(chart));
    const seriesIds = definition.scope === "town" ? ["overall", "KASUKABE", "KOSHIGAYA"] : definition.scope === "heaven" ? ["KASUKABE"] : ["overall", "KASUKABE", "KOSHIGAYA", "NODA"];
    const scopeBlocks = seriesIds.map((seriesId) => {
      const first = sourceCharts.find((chart) => chart.series.some((series) => series.seriesId === seriesId));
      if (!first) return null;
      const label = first.series.find((series) => series.seriesId === seriesId)?.storeName ?? seriesId;
      const chartsForScope = sourceCharts.map((chart) => makeChart(chart, seriesId, definition.scope === "town")).filter((chart) => chart.series.length > 0);
      const notes = definition.storyId === "operations_outcome" && seriesId !== "overall" && (seriesId === "KOSHIGAYA" || seriesId === "NODA") ? ["出勤時間は店舗計上上の制約があるため参考値です。補完・按分していません。"] : [];
      return block(seriesId.toLowerCase(), label, chartsForScope, definition.scope === "town" || definition.scope === "heaven" ? "media_scope" : seriesId === "overall" ? "overall" : "store", notes);
    }).filter((item): item is DashboardStoryScopeBlockDto => Boolean(item));
    const missingDates = [...new Set(scopeBlocks.flatMap((item) => item.charts.flatMap((chart) => chart.dataHealth.missingDates)))];
    const latestDate = scopeBlocks.flatMap((item) => item.charts.map((chart) => chart.dataHealth.latestDate)).filter((date): date is string => Boolean(date)).sort().at(-1) ?? null;
    const state: DashboardChartAvailability = scopeBlocks.length === 0 ? "unavailable" : missingDates.length > 0 ? "partial" : "available";
    return { storyId: definition.storyId, title: definition.title, description: definition.description, scopeBlocks, dataHealth: { state, latestDate, missingDates, explanation: missingDates.length ? `${missingDates.length}日が未取得または欠測です。` : "対象期間のデータを取得済みです。" } };
  });
}

const relationshipDirection = (left: number | null, leftPrev: number | null, right: number | null, rightPrev: number | null): RelationshipDirection => {
  if (left === null || leftPrev === null || right === null || rightPrev === null) return "insufficient_data";
  const dl = left - leftPrev; const dr = right - rightPrev;
  if (dl === 0 || dr === 0) return "unchanged";
  return Math.sign(dl) === Math.sign(dr) ? "same" : "opposite";
};
const formatRelationshipValue = (value: number | null, type: DashboardRelationshipAxisDto["valueType"]) => value === null ? "—" : type === "currency" ? `¥${Math.round(value).toLocaleString("ja-JP")}` : type === "hours" ? `${value.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}時間` : value.toLocaleString("ja-JP", { maximumFractionDigits: type === "decimal" ? 1 : 0 });

export function buildRelationshipCharts(charts: DashboardChartDto[]): DashboardRelationshipChartDto[] {
  const byId = new Map(charts.map((chart) => [chart.chartId, chart]));
  const dates = byId.get("sales-daily")?.xAxis.labels ?? [];
  const getSeries = (chartId: string, scopeId: string, townOverall = false) => {
    const chart = byId.get(chartId); if (!chart) return dates.map(() => null);
    if (townOverall && scopeId === "overall" && (chartId === "sales-daily" || chartId === "contracts-daily")) {
      const kas = chart.series.find((series) => series.seriesId === "KASUKABE"); const kos = chart.series.find((series) => series.seriesId === "KOSHIGAYA");
      return dates.map((_, index) => kas?.values[index]?.value === null && kos?.values[index]?.value === null ? null : (kas?.values[index]?.value ?? 0) + (kos?.values[index]?.value ?? 0));
    }
    return chart.series.find((series) => series.seriesId === scopeId)?.values.map((point) => point.value) ?? dates.map(() => null);
  };
  const defs: Array<{ id: DashboardRelationshipChartDto["relationshipId"]; title: string; description: string; left: DashboardRelationshipAxisDto; right: DashboardRelationshipAxisDto; leftChart: string; rightChart: string; scopes: string[]; scopeType: "overall" | "store" | "media_scope"; townOverall?: boolean; note?: string }> = [
    { id: "sales_contract", title: "売上と成約数", description: "売上と成約数の同日推移を確認します。動きが一致しない日は詳細確認対象です。因果関係は断定しません。", left: { metricId: "ctiSales", label: "売上", side: "left", renderType: "bar", valueType: "currency", unitLabel: "円", startAtZero: true, colorToken: "sales" }, right: { metricId: "contracts", label: "成約数", side: "right", renderType: "line", valueType: "integer", unitLabel: "件", startAtZero: true, colorToken: "contracts" }, leftChart: "sales-daily", rightChart: "contracts-daily", scopes: ["overall", "KASUKABE"], scopeType: "store" },
    { id: "sales_attendance", title: "売上と出勤人数", description: "売上と日別の延べ出勤人数を同じ営業日軸で観察します。", left: { metricId: "ctiSales", label: "売上", side: "left", renderType: "bar", valueType: "currency", unitLabel: "円", startAtZero: true, colorToken: "sales" }, right: { metricId: "ctiAttendanceCount", label: "出勤人数", side: "right", renderType: "line", valueType: "integer", unitLabel: "人", startAtZero: true, colorToken: "attendance" }, leftChart: "sales-daily", rightChart: "attendance-daily", scopes: ["overall"], scopeType: "store" },
    { id: "sales_working_hours", title: "売上と出勤時間", description: "売上と日別の出勤時間を観察します。", left: { metricId: "ctiSales", label: "売上", side: "left", renderType: "bar", valueType: "currency", unitLabel: "円", startAtZero: true, colorToken: "sales" }, right: { metricId: "ctiWorkHours", label: "出勤時間", side: "right", renderType: "line", valueType: "hours", unitLabel: "時間", startAtZero: true, colorToken: "workHours" }, leftChart: "sales-daily", rightChart: "work-hours-daily", scopes: ["overall"], scopeType: "store" },
    { id: "sales_town_pv", title: "売上とTown PV", description: "Townの閲覧量と同じ店舗範囲の売上を観察します。影響や因果は断定しません。", left: { metricId: "ctiSales", label: "売上", side: "left", renderType: "bar", valueType: "currency", unitLabel: "円", startAtZero: true, colorToken: "sales" }, right: { metricId: "townStorePv", label: "Town PV", side: "right", renderType: "line", valueType: "integer", unitLabel: "PV", startAtZero: true, colorToken: "townPv" }, leftChart: "sales-daily", rightChart: "town-pv-daily", scopes: ["overall", "KASUKABE", "KOSHIGAYA"], scopeType: "media_scope", townOverall: true },
    { id: "sales_town_uu", title: "売上とTown UU", description: "TownのUUと同じ店舗範囲の売上を観察します。影響や因果は断定しません。", left: { metricId: "ctiSales", label: "売上", side: "left", renderType: "bar", valueType: "currency", unitLabel: "円", startAtZero: true, colorToken: "sales" }, right: { metricId: "townStoreUu", label: "Town UU", side: "right", renderType: "line", valueType: "integer", unitLabel: "UU", startAtZero: true, colorToken: "townUu" }, leftChart: "sales-daily", rightChart: "town-uu-daily", scopes: ["overall", "KASUKABE", "KOSHIGAYA"], scopeType: "media_scope", townOverall: true },
    { id: "town_pv_contract", title: "Town PVと成約数", description: "Town PVと同じ店舗範囲の成約数を観察します。媒体から予約・成約への経路は特定しません。", left: { metricId: "contracts", label: "成約数", side: "left", renderType: "bar", valueType: "integer", unitLabel: "件", startAtZero: true, colorToken: "contracts" }, right: { metricId: "townStorePv", label: "Town PV", side: "right", renderType: "line", valueType: "integer", unitLabel: "PV", startAtZero: true, colorToken: "townPv" }, leftChart: "contracts-daily", rightChart: "town-pv-daily", scopes: ["overall", "KASUKABE", "KOSHIGAYA"], scopeType: "media_scope", townOverall: true },
    { id: "town_pv_uu", title: "Town PVとUU", description: "TownのPVとUUの同日推移を観察します。", left: { metricId: "townStorePv", label: "Town PV", side: "left", renderType: "bar", valueType: "integer", unitLabel: "PV", startAtZero: true, colorToken: "townPv" }, right: { metricId: "townStoreUu", label: "Town UU", side: "right", renderType: "line", valueType: "integer", unitLabel: "UU", startAtZero: true, colorToken: "townUu" }, leftChart: "town-pv-daily", rightChart: "town-uu-daily", scopes: ["KASUKABE", "KOSHIGAYA"], scopeType: "media_scope" },
    { id: "town_heaven_access", title: "Town PVとHeaven PAGE_ACCESS", description: "春日部のTown PVとHeaven PAGE_ACCESSを絶対値で観察します。定義は同一ではなく、媒体間の因果や移行は断定しません。", left: { metricId: "townStorePv", label: "Town PV", side: "left", renderType: "bar", valueType: "integer", unitLabel: "PV", startAtZero: true, colorToken: "townPv" }, right: { metricId: "heavenGirlPageAccess", label: "Heaven PAGE_ACCESS", side: "right", renderType: "line", valueType: "integer", unitLabel: "件", startAtZero: true, colorToken: "pageAccess" }, leftChart: "town-pv-daily", rightChart: "heaven-access-daily", scopes: ["KASUKABE"], scopeType: "media_scope" },
    { id: "diary_page_access", title: "PAGE_ACCESSとDIARY_POSTS", description: "Heavenの閲覧と投稿活動を同じ営業日軸で観察します。売上基準ではない補助グラフです。", left: { metricId: "heavenGirlPageAccess", label: "PAGE_ACCESS", side: "left", renderType: "bar", valueType: "integer", unitLabel: "件", startAtZero: true, colorToken: "pageAccess" }, right: { metricId: "heavenDiaryPostCount", label: "DIARY_POSTS", side: "right", renderType: "line", valueType: "integer", unitLabel: "件", startAtZero: true, colorToken: "diaryPosts" }, leftChart: "heaven-access-daily", rightChart: "heaven-diary-daily", scopes: ["KASUKABE"], scopeType: "media_scope" },
    { id: "page_access_mitene", title: "PAGE_ACCESSとMITENE_SENT", description: "Heavenの閲覧とミテネ送信の同日推移です。売上との直接比較は行いません。", left: { metricId: "heavenGirlPageAccess", label: "PAGE_ACCESS", side: "left", renderType: "bar", valueType: "integer", unitLabel: "件", startAtZero: true, colorToken: "pageAccess" }, right: { metricId: "heavenMiteneSent", label: "MITENE_SENT", side: "right", renderType: "line", valueType: "integer", unitLabel: "件", startAtZero: true, colorToken: "nominations" }, leftChart: "heaven-access-daily", rightChart: "heaven-mitene-daily", scopes: ["KASUKABE"], scopeType: "media_scope" },
    { id: "page_access_okini", title: "PAGE_ACCESSとOKINI_TALK_SENT", description: "Heavenの閲覧とオキニトーク送信の同日推移です。売上との直接比較は行いません。", left: { metricId: "heavenGirlPageAccess", label: "PAGE_ACCESS", side: "left", renderType: "bar", valueType: "integer", unitLabel: "件", startAtZero: true, colorToken: "pageAccess" }, right: { metricId: "heavenOkiniTalkSent", label: "OKINI_TALK_SENT", side: "right", renderType: "line", valueType: "integer", unitLabel: "件", startAtZero: true, colorToken: "diaryPosts" }, leftChart: "heaven-access-daily", rightChart: "heaven-okini-daily", scopes: ["KASUKABE"], scopeType: "media_scope" },
    { id: "sales_page_access", title: "売上とPAGE_ACCESS", description: "春日部CTI売上とHeavenページ閲覧の同日推移を観察します。因果関係は断定しません。", left: { metricId: "ctiSales", label: "売上", side: "left", renderType: "bar", valueType: "currency", unitLabel: "円", startAtZero: true, colorToken: "sales" }, right: { metricId: "heavenGirlPageAccess", label: "PAGE_ACCESS", side: "right", renderType: "line", valueType: "integer", unitLabel: "件", startAtZero: true, colorToken: "pageAccess" }, leftChart: "sales-daily", rightChart: "heaven-access-daily", scopes: ["KASUKABE"], scopeType: "media_scope" },
    { id: "contract_page_access", title: "成約数とPAGE_ACCESS", description: "春日部CTI成約数とHeavenページ閲覧の同日推移を観察します。因果関係は断定しません。", left: { metricId: "contracts", label: "成約数", side: "left", renderType: "bar", valueType: "integer", unitLabel: "件", startAtZero: true, colorToken: "contracts" }, right: { metricId: "heavenGirlPageAccess", label: "PAGE_ACCESS", side: "right", renderType: "line", valueType: "integer", unitLabel: "件", startAtZero: true, colorToken: "pageAccess" }, leftChart: "contracts-daily", rightChart: "heaven-access-daily", scopes: ["KASUKABE"], scopeType: "media_scope" },
    { id: "sales_nomination", title: "売上と本指名数", description: "売上と本指名数の同日推移を観察します。本指名率は別の補助指標で確認します。", left: { metricId: "ctiSales", label: "売上", side: "left", renderType: "bar", valueType: "currency", unitLabel: "円", startAtZero: true, colorToken: "sales" }, right: { metricId: "ctiNominationCount", label: "本指名数", side: "right", renderType: "line", valueType: "integer", unitLabel: "件", startAtZero: true, colorToken: "nominations" }, leftChart: "sales-daily", rightChart: "nomination-daily", scopes: ["overall", "KASUKABE", "KOSHIGAYA", "NODA"], scopeType: "store" },
  ];
  const navigation = [{ label: "推移分析", href: "/analytics/trend", description: "期間推移" }];
  return defs.flatMap((def) => def.scopes.flatMap((scopeId) => {
    // A relationship is only meaningful when both formal source series exist.
    // Do not manufacture an all-missing chart for metrics that are not connected
    // to the current official adapter (for example OKINI_TALK_SENT).
    if (!byId.has(def.leftChart) || !byId.has(def.rightChart)) return [];
    const left = getSeries(def.leftChart, scopeId, def.townOverall); const right = getSeries(def.rightChart, scopeId, def.townOverall); const leftChart = byId.get(def.leftChart); const label = scopeId === "overall" ? def.townOverall ? "Town対象全体" : "全体" : leftChart?.series.find((series) => series.seriesId === scopeId)?.storeName ?? "春日部";
    const values = dates.map((date, index) => { const prevLeft = index > 0 ? left[index - 1] : null; const prevRight = index > 0 ? right[index - 1] : null; const direction = relationshipDirection(left[index], prevLeft, right[index], prevRight); return { date, leftValue: left[index], leftFormattedValue: formatRelationshipValue(left[index], def.left.valueType), rightValue: right[index], rightFormattedValue: formatRelationshipValue(right[index], def.right.valueType), leftAvailability: left[index] === null ? "unavailable" as const : left[index] === 0 ? "available" as const : "available" as const, rightAvailability: right[index] === null ? "unavailable" as const : "available" as const, previousDayDirection: direction, previousDayLeftDifference: left[index] !== null && prevLeft !== null ? left[index] - prevLeft : null, previousDayRightDifference: right[index] !== null && prevRight !== null ? right[index] - prevRight : null, explanation: direction === "insufficient_data" ? "左右いずれかのデータが欠測です。" : direction === "same" ? "同方向に変化" : direction === "opposite" ? "逆方向に変化" : "変化なし" }; });
    const summaryCounts = values.reduce((acc, value) => { acc[value.previousDayDirection === "same" ? "same" : value.previousDayDirection === "opposite" ? "opposite" : value.previousDayDirection === "unchanged" ? "unchanged" : "insufficient"] += 1; return acc; }, { same: 0, opposite: 0, unchanged: 0, insufficient: 0 }); const comparableDays = summaryCounts.same + summaryCounts.opposite; const rate = comparableDays ? summaryCounts.same / comparableDays : null;
    const missingDates = dates.filter((_, index) => left[index] === null || right[index] === null); const hasValue = values.some((value) => value.leftValue !== null || value.rightValue !== null); const scopeType = def.scopeType; const town = def.townOverall && scopeId === "overall";
    return { chartId: `${def.id}-${scopeId.toLowerCase()}`, relationshipId: def.id, title: `${label}｜${def.title}`, description: def.description, scope: { scopeId: scopeId.toLowerCase(), scopeLabel: label, scopeType }, xAxis: { type: "business_date", dates, labels: dates }, leftAxis: def.left, rightAxis: def.right, values, relationshipSummary: { sameDirectionDays: summaryCounts.same, oppositeDirectionDays: summaryCounts.opposite, unchangedDays: summaryCounts.unchanged, insufficientDataDays: summaryCounts.insufficient, comparableDays, directionMatchRate: rate, explanation: "前日からの増減方向を比較した参考値です。因果関係や統計的相関を示すものではありません。" }, dataHealth: { state: !hasValue ? "unavailable" : missingDates.length ? "partial" : "available", latestDate: dates.filter((_, index) => values[index].leftValue !== null || values[index].rightValue !== null).at(-1) ?? null, missingDates, note: def.note ?? (town ? "Town対象全体は春日部＋越谷です。" : null) }, navigation };
  }));
}

export function buildStoryCards(
  relationships: DashboardRelationshipChartDto[],
  summary: ManagementDashboardDto["summary"],
  stores: StoreItem[],
  navigation: ManagementDashboardDto["navigation"],
  dailyCharts: DashboardChartDto[] = [],
): DashboardStoryCardDto[] {
  const byKey = new Map(relationships.map((chart) => [`${chart.relationshipId}:${chart.scope.scopeId.toLowerCase()}`, chart]));
  const scopeLabel = (scope: string, media = false) => scope === "overall" ? media ? "Town対象全体" : "全体" : relationships.find((chart) => chart.scope.scopeId === scope.toLowerCase())?.scope.scopeLabel ?? scope;
  const metricFor = (scope: string, key: string) => {
    const store = stores.find((item) => item.storeCode === scope);
    if (scope === "overall") {
      if (key === "sales") return summary.sales;
      if (key === "contracts") return summary.contractCount;
      if (key === "reservations") return summary.reservationCount;
      if (key === "attendance") return summary.averageDailyAttendance;
      if (key === "hours") return summary.workingHours;
      if (key === "nomination") return summary.nominationCount;
      if (key === "nominationRate") return summary.nominationRate;
      if (key === "townUu") return summary.sales.value === null ? null : null;
    }
    if (!store) return null;
    if (key === "sales") return store.volume.sales;
    if (key === "contracts") return store.volume.contracts;
    if (key === "reservations") return store.volume.reservations;
    if (key === "attendance") return store.sample.averageDailyAttendance;
    if (key === "hours") return store.volume.workHours;
    if (key === "nomination") return store.volume.nominationCount;
    if (key === "nominationRate") return store.efficiency.nominationRate;
    if (key === "townPv") return store.media.townPv;
    if (key === "townUu") return store.media.townUu;
    if (key === "access") return store.media.heavenAccess;
    if (key === "diary") return store.media.heavenDiaryPosts;
    return null;
  };
  const comparisonText = (value: DashboardMetric | null) => {
    const comparison = value?.previousMonthSamePeriod;
    if (!comparison || comparison.differenceRate === null || comparison.differenceRate === undefined) return "前月同期間比：データ不足";
    return `前月同期間比 ${(comparison.differenceRate * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1, signDisplay: "always" })}%`;
  };
  const card = (storyId: DashboardStoryCardDto["storyId"], scope: string, title: string, chartIds: Array<DashboardRelationshipChartDto["relationshipId"]>, metrics: Array<[string, string, string]>, description: string | null = null, notes: string[] = []): DashboardStoryCardDto | null => {
    const charts = chartIds.map((id) => byKey.get(`${id}:${scope.toLowerCase()}`)).filter((item): item is DashboardRelationshipChartDto => Boolean(item));
    if (!charts.length) return null;
    const headlineMetrics = metrics.map(([id, label, key]) => { const chartMetric = storyId === "town_performance" && scope === "overall" && (key === "sales" || key === "contracts" || key === "townUu" || key === "townPv") ? byKey.get(`${key === "townUu" ? "sales_town_uu" : key === "townPv" ? "town_pv_uu" : key === "sales" ? "sales_town_uu" : "town_pv_contract"}:overall`) : null; const chartValues = chartMetric?.values.map((value) => key === "townUu" ? value.rightValue : key === "townPv" ? value.leftValue : value.leftValue).filter((value): value is number => value !== null) ?? []; const m = chartMetric ? { value: chartValues.length ? chartValues.reduce((total, value) => total + value, 0) : null, availability: chartValues.length ? "VALUE" : "MISSING" } : metricFor(scope, key); const unit = key === "sales" ? "yen" : key === "hours" ? "hours" : key === "nominationRate" ? "percent" : "count"; const value = m?.value ?? null; const formattedValue = value === null ? "—" : unit === "yen" ? `¥${Math.round(value).toLocaleString("ja-JP")}` : unit === "hours" ? `${value.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}時間` : unit === "percent" ? `${(value * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%` : value.toLocaleString("ja-JP"); return { metricId: id, label, value, formattedValue, comparisonText: comparisonText(m as DashboardMetric | null), availability: m?.availability === "UNAVAILABLE" ? "not_applicable" : value === null ? "unavailable" : "available" } as DashboardStoryCardDto["headlineMetrics"][number]; });
    const summaries = charts.map((chart) => chart.relationshipSummary).filter((item) => item.directionMatchRate !== null);
    const first = summaries[0]; const second = summaries[1];
    const latest = charts.map((chart) => chart.dataHealth.latestDate).filter(Boolean).sort().at(-1) ?? null;
    const missingDates = [...new Set(charts.flatMap((chart) => chart.dataHealth.missingDates))].sort();
    const state: DashboardChartAvailability = charts.some((chart) => chart.dataHealth.state === "unavailable") ? "unavailable" : charts.some((chart) => chart.dataHealth.state === "partial") ? "partial" : "available";
    return { cardId: `${storyId}-${scope.toLowerCase()}`, storyId, scope: { scopeId: scope.toLowerCase(), scopeLabel: scopeLabel(scope, storyId === "town_performance"), scopeType: storyId === "town_performance" || storyId === "heaven_performance" ? "media_scope" : scope === "overall" ? "overall" : "store" }, title, description, headlineMetrics, charts, relationshipSummary: first ? { primaryText: `同方向 ${Math.round((first.directionMatchRate ?? 0) * 100)}%`, secondaryText: second ? `同方向 ${Math.round((second.directionMatchRate ?? 0) * 100)}%` : null, explanation: "前日差の方向一致率は同時変化の参考値であり、因果関係や統計的相関を示しません。" } : null, dataHealth: { state, latestDate: latest, missingDates, note: charts.find((chart) => chart.dataHealth.note)?.dataHealth.note ?? null }, notes, navigation, displayPolicy: { isVisible: true, reason: notes.length ? "business_data_constraint" : "supported" }, dataReliability: { level: notes.length ? "limited" : "official", explanation: notes.length ? notes.join(" ") : null } };
  };
  const trendCard = (scope: string): DashboardStoryCardDto | null => {
    const source = dailyCharts.find((chart) => chart.chartId === "sales-daily");
    const series = source?.series.find((item) => item.seriesId === scope || (scope === "overall" && item.seriesId === "overall"));
    if (!source || !series) return null;
    const sales = metricFor(scope, "sales");
    return { cardId: `sales-trend-${scope.toLowerCase()}`, storyId: "sales_trend", scope: { scopeId: scope.toLowerCase(), scopeLabel: scopeLabel(scope), scopeType: scope === "overall" ? "overall" : "store" }, title: `${scopeLabel(scope)}｜売上推移`, description: "売上だけの日別推移です。店舗を同じグラフへ重ねていません。", headlineMetrics: [{ metricId: "sales", label: "当月売上", value: sales?.value ?? null, formattedValue: sales?.value === null || sales?.value === undefined ? "—" : `¥${Math.round(sales.value).toLocaleString("ja-JP")}`, comparisonText: null, availability: sales?.value === null || sales?.value === undefined ? "unavailable" : "available" }], charts: [], trendCharts: [{ ...source, series: [series] }], relationshipSummary: null, dataHealth: { state: source.dataHealth.state, latestDate: source.dataHealth.latestDate, missingDates: source.dataHealth.missingDates, note: null }, notes: [], navigation, displayPolicy: { isVisible: true, reason: "supported" }, dataReliability: { level: "official", explanation: null } };
  };
  const cards: DashboardStoryCardDto[] = [];
  for (const scope of ["overall", "KASUKABE", "KOSHIGAYA", "NODA"]) { const c = trendCard(scope); if (c) cards.push(c); }
  for (const scope of ["overall", "KASUKABE"]) { const c = card("sales_outcome", scope, `${scopeLabel(scope)}｜売上と成約数`, ["sales_contract"], [["sales", "当月売上", "sales"], ["contracts", "当月成約数", "contracts"], ["reservations", "予約数", "reservations"]]); if (c) cards.push(c); }
  { const c = card("sales_operations", "overall", "全体｜売上と稼働", ["sales_attendance", "sales_working_hours"], [["sales", "全体売上", "sales"], ["attendance", "1日平均出勤人数", "attendance"], ["hours", "全体出勤時間", "hours"]]); if (c) cards.push(c); }
  for (const scope of ["KASUKABE", "KOSHIGAYA"]) { const c = card("town_performance", scope, `${scopeLabel(scope)}｜Town集客`, ["sales_town_uu", "sales_town_pv", "town_pv_uu"], [["sales", "当月売上", "sales"], ["townUu", "Town UU", "townUu"], ["townPv", "Town PV", "townPv"]]); if (c) cards.push(c); }
  { const c = card("heaven_performance", "KASUKABE", "春日部｜Heaven活動・閲覧・成果", ["sales_page_access", "diary_page_access", "page_access_mitene", "page_access_okini"], [["sales", "春日部売上", "sales"], ["access", "PAGE_ACCESS", "access"], ["diary", "DIARY_POSTS", "diary"]], "MITENEはPAGE_ACCESSと並べて表示します。OKINI_TALK_SENTは現行の正式DTOに接続されていないため表示対象外です。いずれも売上との直接比較は行いません。"); if (c) cards.push(c); }
  { const c = card("town_performance", "KASUKABE", "春日部｜Town・Heaven媒体推移", ["town_heaven_access"], [["townPv", "Town PV", "townPv"], ["access", "PAGE_ACCESS", "access"]], "Town PVとHeaven PAGE_ACCESSを絶対値で確認します。定義は同一ではなく、媒体の代替や因果は断定しません。"); if (c) cards.push(c); }
  for (const scope of ["overall", "KASUKABE"]) { const c = card("sales_nomination", scope, `${scopeLabel(scope)}｜売上と本指名`, ["sales_nomination"], [["sales", "当月売上", "sales"], ["nomination", "本指名数", "nomination"], ["nominationRate", "本指名率", "nominationRate"]], "本指名率は本指名数÷接客数です。日次率グラフは表示しません。"); if (c) cards.push(c); }
  return cards;
}

export async function getManagementDashboard(): Promise<ManagementDashboardDto> {
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const range = { from: formatDateOnly(from), to: formatDateOnly(to) };
  const comparisonKinds: ManagementComparison[] = ["previousDay", "previousWeekday", "previousMonthToDate"];
  const comparisonPeriods = Object.fromEntries(comparisonKinds.map((kind) => [kind, comparisonRange(range, kind)])) as Record<ManagementComparison, { from: string; to: string }>;
  const [snapshot, baselineSnapshots, health, storeHealthResults] = await Promise.all([
    fetchAnalyticsSnapshot({ from, to, storeCodes: ANALYTICS_STORE_CODES }),
    Promise.all(comparisonKinds.map(async (kind) => [kind, adaptSnapshot(await fetchAnalyticsSnapshot({ from: parseDateOnly(comparisonPeriods[kind].from), to: parseDateOnly(comparisonPeriods[kind].to), storeCodes: ANALYTICS_STORE_CODES }))] as const)),
    getDataHealth({ from, to, scope: "ALL", media: "ALL" }),
    Promise.all(ANALYTICS_STORE_CODES.map(async (code) => [code, await getDataHealth({ from, to, scope: code as "KASUKABE" | "KOSHIGAYA" | "NODA", media: "ALL" })] as const)),
  ]);
  const current = adaptSnapshot(snapshot); const baselines = new Map(baselineSnapshots); const allVolume = aggregateVolume(current.rows)[0]; const allEfficiency = calculateEfficiency(allVolume); const allSample = allVolume.sample;
  const make = (value: MetricValue, availability?: Availability) => metric(value, allSample, availability);
  const summary = { sales: make(allVolume.metrics.sales), contractCount: make(allVolume.metrics.contracts), reservationCount: make(allVolume.metrics.reservations), attendanceCountTotal: make(allVolume.metrics.attendancePeople), averageDailyAttendance: make(allSample.targetDays ? allSample.attendanceCount / allSample.targetDays : null, allSample.targetDays ? undefined : "UNCOMPUTABLE"), uniqueCastCount: make(allSample.uniqueCastCount), workingHours: make(allVolume.metrics.attendanceMinutes === null ? null : allVolume.metrics.attendanceMinutes / 60, allVolume.metricAvailability.attendanceMinutes), salesPerHour: make(allEfficiency.salesPerHour, allEfficiency.metricAvailability.salesPerHour), averageUnitPrice: make(allEfficiency.averageUnitPrice, allEfficiency.metricAvailability.averageUnitPrice), nominationCount: make(allVolume.metrics.regularNominations), nominationRate: make(allEfficiency.regularNominationRate, allEfficiency.metricAvailability.regularNominationRate) };
  const storeHealth = new Map(storeHealthResults);
  const overallPrevious = aggregateVolume(baselines.get("previousWeekday")?.rows ?? [])[0];
  const overallMonth = aggregateVolume(baselines.get("previousMonthToDate")?.rows ?? [])[0];
  const summaryComparison = (base: DashboardMetric, current: number | null, key: keyof typeof allVolume.metrics) => addComparisons(base, current, overallPrevious.metrics[key], overallMonth.metrics[key], comparisonPeriods.previousWeekday, comparisonPeriods.previousMonthToDate, allSample);
  summary.sales = summaryComparison(summary.sales, allVolume.metrics.sales, "sales");
  summary.contractCount = summaryComparison(summary.contractCount, allVolume.metrics.contracts, "contracts");
  summary.reservationCount = summaryComparison(summary.reservationCount, allVolume.metrics.reservations, "reservations");
  summary.attendanceCountTotal = summaryComparison(summary.attendanceCountTotal, allVolume.metrics.attendancePeople, "attendancePeople");
  summary.workingHours = addComparisons(summary.workingHours, allVolume.metrics.attendanceMinutes === null ? null : allVolume.metrics.attendanceMinutes / 60, overallPrevious.metrics.attendanceMinutes === null ? null : overallPrevious.metrics.attendanceMinutes / 60, overallMonth.metrics.attendanceMinutes === null ? null : overallMonth.metrics.attendanceMinutes / 60, comparisonPeriods.previousWeekday, comparisonPeriods.previousMonthToDate, allSample);
  const storeItems: StoreItem[] = current.stores.map((store) => {
    const rows = rowsForStore(current.rows, store.id); const volume = aggregateVolume(rows)[0]; const efficiency = calculateEfficiency(volume); const sample = volume.sample; const baseline = baselines.get("previousMonthToDate"); const baselineVolume = aggregateVolume(baseline ? rowsForStore(baseline.rows, store.id) : [])[0]; const c = toComparisonDto(compareValues(volume.metrics.sales, baselineVolume.metrics.sales, "previousMonthToDate"), comparisonPeriods.previousMonthToDate, baselineVolume.sample); const h = storeHealth.get(store.code as "KASUKABE" | "KOSHIGAYA" | "NODA"); const m = (key: keyof typeof volume.metrics) => metric(volume.metrics[key], sample, volume.metricAvailability[key]);
    return { storeId: store.id, storeName: store.shortName, storeCode: store.code, sample: { businessDays: metric(sample.targetDays, sample), attendanceCount: metric(sample.attendanceCount, sample), averageDailyAttendance: metric(sample.targetDays ? sample.attendanceCount / sample.targetDays : null, sample, sample.targetDays ? undefined : "UNCOMPUTABLE"), castCount: metric(sample.uniqueCastCount, sample), workHours: metric(sample.totalAttendanceHours, sample) }, efficiency: { salesPerHour: metric(efficiency.salesPerHour, sample, efficiency.metricAvailability.salesPerHour), nominationRate: metric(efficiency.regularNominationRate, sample, efficiency.metricAvailability.regularNominationRate), averageUnitPrice: metric(efficiency.averageUnitPrice, sample, efficiency.metricAvailability.averageUnitPrice) }, volume: { sales: m("sales"), reservations: m("reservations"), contracts: m("contracts"), attendanceCount: m("attendancePeople"), workHours: metric(volume.metrics.attendanceMinutes === null ? null : volume.metrics.attendanceMinutes / 60, sample, volume.metricAvailability.attendanceMinutes), nominationCount: m("regularNominations") }, media: { townPv: store.code === "NODA" ? emptyMetric(sample, "UNAVAILABLE") : m("townPv"), townUu: store.code === "NODA" ? emptyMetric(sample, "UNAVAILABLE") : m("townUu"), heavenAccess: store.code === "KASUKABE" ? m("heavenAccess") : emptyMetric(sample, "UNAVAILABLE"), heavenDiaryPosts: store.code === "KASUKABE" ? m("heavenDiaryPosts") : emptyMetric(sample, "UNAVAILABLE"), heavenMiteneSent: store.code === "KASUKABE" ? m("heavenMiteneSent") : emptyMetric(sample, "UNAVAILABLE") }, dataHealth: { status: h?.state ?? "対象外", latest: h?.summary.latestReflectedDate ?? null, pending: h?.summary.pendingBatches ?? 0, failed: h?.summary.failedBatches ?? 0, openErrors: h?.summary.warnings ?? 0 }, comparison: [c], detailUrls: { store: `/analytics/store?from=${range.from}&to=${range.to}&store=${store.code}`, trend: `/analytics/trend?from=${range.from}&to=${range.to}&store=${store.code}&comparison=previousMonthToDate`, time: `/analytics/time?from=${range.from}&to=${range.to}&store=${store.code}`, cast: `/analytics/casts/overview?from=${range.from}&to=${range.to}&store=${store.code}`, dataHealth: `/data-health?period=custom&from=${range.from}&to=${range.to}&scope=${store.code}` } };
  });
  // Attach the same previous-month-same-period comparison DTO to every
  // supported Store Overview metric. The UI only renders these prepared DTOs.
  for (const store of storeItems) {
    const currentVolume = aggregateVolume(rowsForStore(current.rows, store.storeId))[0];
    const previousVolume = aggregateVolume(rowsForStore(baselines.get("previousMonthToDate")?.rows ?? [], store.storeId))[0];
    const previousWeekdayVolume = aggregateVolume(rowsForStore(baselines.get("previousWeekday")?.rows ?? [], store.storeId))[0];
    const previousSample = previousVolume.sample;
    const attach = (metricValue: DashboardMetric, currentValue: number | null, weekdayValue: number | null, monthValue: number | null) => addComparisons(metricValue, currentValue, weekdayValue, monthValue, comparisonPeriods.previousWeekday, comparisonPeriods.previousMonthToDate, store.sample.businessDays.sample);
    store.volume.sales = attach(store.volume.sales, currentVolume.metrics.sales, previousWeekdayVolume.metrics.sales, previousVolume.metrics.sales);
    store.volume.contracts = attach(store.volume.contracts, currentVolume.metrics.contracts, previousWeekdayVolume.metrics.contracts, previousVolume.metrics.contracts);
    store.volume.reservations = attach(store.volume.reservations, currentVolume.metrics.reservations, previousWeekdayVolume.metrics.reservations, previousVolume.metrics.reservations);
    store.volume.attendanceCount = attach(store.volume.attendanceCount, currentVolume.metrics.attendancePeople, previousWeekdayVolume.metrics.attendancePeople, previousVolume.metrics.attendancePeople);
    store.volume.workHours = attach(store.volume.workHours, currentVolume.metrics.attendanceMinutes === null ? null : currentVolume.metrics.attendanceMinutes / 60, previousWeekdayVolume.metrics.attendanceMinutes === null ? null : previousWeekdayVolume.metrics.attendanceMinutes / 60, previousVolume.metrics.attendanceMinutes === null ? null : previousVolume.metrics.attendanceMinutes / 60);
    store.volume.nominationCount = attach(store.volume.nominationCount, currentVolume.metrics.regularNominations, previousWeekdayVolume.metrics.regularNominations, previousVolume.metrics.regularNominations);
    store.sample.averageDailyAttendance = attach(store.sample.averageDailyAttendance, currentVolume.sample.targetDays ? currentVolume.sample.attendanceCount / currentVolume.sample.targetDays : null, previousWeekdayVolume.sample.targetDays ? previousWeekdayVolume.sample.attendanceCount / previousWeekdayVolume.sample.targetDays : null, previousSample.targetDays ? previousSample.attendanceCount / previousSample.targetDays : null);
    store.efficiency.nominationRate = attach(store.efficiency.nominationRate, calculateEfficiency(currentVolume).regularNominationRate, calculateEfficiency(previousWeekdayVolume).regularNominationRate, calculateEfficiency(previousVolume).regularNominationRate);
    store.media.townPv = attach(store.media.townPv, currentVolume.metrics.townPv, previousWeekdayVolume.metrics.townPv, previousVolume.metrics.townPv);
    store.media.townUu = attach(store.media.townUu, currentVolume.metrics.townUu, previousWeekdayVolume.metrics.townUu, previousVolume.metrics.townUu);
    store.media.heavenAccess = attach(store.media.heavenAccess, currentVolume.metrics.heavenAccess, previousWeekdayVolume.metrics.heavenAccess, previousVolume.metrics.heavenAccess);
    store.media.heavenDiaryPosts = attach(store.media.heavenDiaryPosts, currentVolume.metrics.heavenDiaryPosts, previousWeekdayVolume.metrics.heavenDiaryPosts, previousVolume.metrics.heavenDiaryPosts);
  }
  const storeComposition = storeItems.map((store) => ({ storeId: store.storeId, storeName: store.storeName, sales: store.volume.sales, salesShare: metric(summary.sales.value && store.volume.sales.value !== null ? store.volume.sales.value / summary.sales.value : null, allSample, summary.sales.value === null ? "UNCOMPUTABLE" : undefined), contractCount: store.volume.contracts, contractShare: metric(allVolume.metrics.contracts && store.volume.contracts.value !== null ? store.volume.contracts.value / allVolume.metrics.contracts : null, allSample, allVolume.metrics.contracts === null ? "UNCOMPUTABLE" : undefined), attendanceCount: store.volume.attendanceCount, workHours: store.volume.workHours }));
  const storeStates = storeItems.map((store) => {
    const comparison = store.comparison[0];
    const baselineRows = baselines.get("previousMonthToDate") ? rowsForStore(baselines.get("previousMonthToDate")!.rows, store.storeId) : [];
    const baselineVolume = aggregateVolume(baselineRows)[0];
    const currentVolume = aggregateVolume(rowsForStore(current.rows, store.storeId))[0];
    const currentEfficiency = calculateEfficiency(currentVolume); const baselineEfficiency = calculateEfficiency(baselineVolume);
    const candidates: Array<[string, string, number | null, number | null]> = [
      ["sales", "売上", currentVolume.metrics.sales, baselineVolume.metrics.sales],
      ["contracts", "成約数", currentVolume.metrics.contracts, baselineVolume.metrics.contracts],
      ["reservations", "予約数", currentVolume.metrics.reservations, baselineVolume.metrics.reservations],
      ["attendance", "1日平均出勤人数", currentVolume.sample.targetDays ? currentVolume.sample.attendanceCount / currentVolume.sample.targetDays : null, baselineVolume.sample.targetDays ? baselineVolume.sample.attendanceCount / baselineVolume.sample.targetDays : null],
      ["work_hours", "出勤時間", currentVolume.metrics.attendanceMinutes === null ? null : currentVolume.metrics.attendanceMinutes / 60, baselineVolume.metrics.attendanceMinutes === null ? null : baselineVolume.metrics.attendanceMinutes / 60],
      ["nomination_rate", "本指名率", currentEfficiency.regularNominationRate, baselineEfficiency.regularNominationRate],
      ["town_pv", "Town PV", currentVolume.metrics.townPv, baselineVolume.metrics.townPv],
      ["town_uu", "Town UU", currentVolume.metrics.townUu, baselineVolume.metrics.townUu],
      ["heaven_access", "Heaven PAGE_ACCESS", store.storeCode === "KASUKABE" ? currentVolume.metrics.heavenAccess : null, store.storeCode === "KASUKABE" ? baselineVolume.metrics.heavenAccess : null],
      ["heaven_diary", "Heaven DIARY_POSTS", store.storeCode === "KASUKABE" ? currentVolume.metrics.heavenDiaryPosts : null, store.storeCode === "KASUKABE" ? baselineVolume.metrics.heavenDiaryPosts : null],
    ];
    const allowedByStore: Partial<Record<StoreCode, string[]>> = { KASUKABE: ["sales", "contracts", "reservations", "attendance", "work_hours", "nomination_rate", "town_pv", "town_uu", "heaven_access", "heaven_diary"], KOSHIGAYA: ["sales", "contracts", "reservations", "nomination_rate", "town_pv", "town_uu"], NODA: ["sales", "contracts", "reservations", "nomination_rate"] };
    const visibleCandidates = candidates.filter(([metricId]) => allowedByStore[store.storeCode]?.includes(metricId));
    const observations = visibleCandidates.map(([metricId, label, currentValue, baselineValue]) => { const dto = toComparisonDto(compareValues(currentValue, baselineValue, "previousMonthToDate"), comparisonPeriods.previousMonthToDate, baselineVolume.sample); const state = trendState(dto); return { metricId, label, currentValue, comparisonRate: dto.differenceRate, trendState: state, explanation: dto.differenceRate === null ? "比較できる値がありません。" : `前月同期間比 ${((dto.differenceRate) * 100).toFixed(1)}%` }; });
    const state = trendState(comparison); const upwardMetrics = observations.filter((item) => item.trendState === "improving"); const downwardMetrics = observations.filter((item) => item.trendState === "declining");
    return { storeId: store.storeId, storeName: store.storeName, dataState: dataState(store.dataHealth.status, store.volume.sales.value !== null), overallTrendState: state, observations, upwardMetrics, downwardMetrics, evidence: [`対象日数 ${store.sample.businessDays.value ?? 0}日`], detailLinks: [{ label: "店舗分析", href: store.detailUrls.store, description: "店舗の詳細実績" }, { label: "DATA HEALTH", href: store.detailUrls.dataHealth, description: "取込状態" }] };
  });
  const media = storeItems.map((s) => ({ storeId: s.storeId, storeName: s.storeName, ...s.media }));
  const storeOverview: StoreOverviewCardDto[] = storeItems.map((store) => ({ store, state: storeStates.find((item) => item.storeId === store.storeId)!, comparisonLabel: "前月同期間比", notes: store.storeCode === "KOSHIGAYA" ? ["勤務時間が春日部側に記録されるケースがあるため、越谷単独の稼働指標は表示していません。"] : [] }));
  const dailyCharts = buildDailyCharts(current, from, to);
  const relationships = buildRelationshipCharts(dailyCharts);
  // F-1E replaces the F-1D story renderer. Keep the field for DTO compatibility, but do not generate the retired layout.
  const storySections: DashboardStorySectionDto[] = [];
  const navigation = [{ label: "店舗分析", href: "/analytics/store", description: "店舗の詳細実績" }, { label: "推移分析", href: "/analytics/trend", description: "期間推移" }, { label: "曜日分析", href: "/analytics/time", description: "曜日別実績" }, { label: "キャスト分析", href: "/analytics/casts/overview", description: "キャスト別実績" }, { label: "DATA HEALTH", href: `/data-health?period=custom&from=${range.from}&to=${range.to}&scope=ALL`, description: "データ状態" }];
  const storyCards = buildStoryCards(relationships, summary, storeItems, navigation, dailyCharts);
  return { context: { businessMonth: range.from.slice(0, 7), from: range.from, to: range.to, latestReflectedDate: health.summary.latestReflectedDate, storeScope: "ALL_STORES", displayMode: "FIXED_CURRENT_MONTH" }, dataHealth: { status: health.state, pending: health.summary.pendingBatches, failed: health.summary.failedBatches, openErrors: health.summary.warnings, latest: health.summary.latestReflectedDate, detailUrl: `/data-health?period=custom&from=${range.from}&to=${range.to}&scope=ALL` }, summary, storeComposition, storeStates, stores: storeItems, storeOverview, navigation, media, dailyCharts, storySections, relationships, storyCards, notes: ["実績と変化を確認し、詳細は専門ページで確認してください。", "対象外・未取得・欠測は0として表示していません。", "媒体から予約・成約への直接経路は特定していません。", "越谷・野田の出勤時間は業務上の計上制約があるため参考値です。", "同じ営業日の同時変化を観察するもので、因果関係を断定しません。"] };
}
