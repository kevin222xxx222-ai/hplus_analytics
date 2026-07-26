import type { Availability, Confidence } from "@/lib/analytics/engine";
import { getDataHealth, type HealthScope } from "@/lib/analytics/data-health";
import { formatDateOnly, parseDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { buildHomeComparisons, type HomeComparisonRow, type HomeDailyMetricInput } from "./home-comparison";
import { addUtcDays, daysInclusive, endOfMonth, resolveEvaluationDate, tokyoToday } from "./home-dates";
import { getGoalBasedBenchmarks, type GoalBenchmarksDto } from "./goal-benchmarks";
import { getMonthlyMediaBenchmarks, type MonthlyMediaBenchmark } from "./monthly-media-benchmarks";

export type BriefMetric = {
  value: number | null;
  availability: Availability;
  confidence?: Confidence;
  unit?: "yen" | "count" | "hours" | "percent";
};

export type DailyBriefAction = {
  id: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  category: "DATA_HEALTH" | "SALES" | "RESERVATION" | "ATTENDANCE" | "WORK_HOURS" | "MEDIA" | "CAST" | "GOAL";
  title: string;
  situation: string;
  evidence: string[];
  recommendedCheck: string;
  storeId: string | null;
  castId: string | null;
  detailUrl: string;
  availability: Availability;
  confidence: Confidence;
};

export type HomeDecisionSignal = {
  key: HomeComparisonRow["key"] | "dataHealth" | "goal";
  label: string;
  rate: number;
  basis: "当月平均" | "同曜日平均" | "目標" | "DATA HEALTH";
  direction: "上昇" | "低下";
  kind: "強み" | "要確認";
  previousDay: BriefMetric;
  baseline: BriefMetric;
  difference: BriefMetric;
  confidence: Confidence;
  sampleDays: number;
};

export type DailyManagementStatus = "達成ペース" | "維持" | "十分" | "目安内" | "不足" | "要確認" | "データ不足" | "サンプル不足" | "算出不能" | "対象外";

export type GoalPaceDto = {
  monthlyTarget: BriefMetric;
  currentSales: BriefMetric;
  achievementRate: BriefMetric;
  forecast: BriefMetric;
  latestConfirmedDate: string | null;
  elapsedDays: number;
  remainingDays: number;
  remainingAmount: BriefMetric;
  currentDailyAverage: BriefMetric;
  requiredDailyAverage: BriefMetric;
  dailyAverageGap: BriefMetric;
  paceStatus: DailyManagementStatus;
  minimumMaintenanceSales: BriefMetric;
  availability: Availability;
  sampleDays: number;
  confidence: Confidence;
  explanation: string;
};

export type DailyManagementCheckItem = {
  metricId: string;
  label: string;
  category: "売上・目標" | "稼働" | "予約・成約" | "集客" | "更新活動";
  actualValue: BriefMetric;
  monthlyAverage: BriefMetric;
  /** Explicit name for consumers that need the current-month daily average. */
  currentMonthlyAverage: BriefMetric;
  weekdayAverage: BriefMetric;
  requiredValue: BriefMetric;
  gapFromRequired: BriefMetric;
  monthlyDifference: BriefMetric;
  monthlyDifferenceRate: BriefMetric;
  weekdayDifference: BriefMetric;
  weekdayDifferenceRate: BriefMetric;
  status: DailyManagementStatus;
  /** Canonical semantic status; `status` remains for backwards compatibility. */
  semanticStatus: DailyManagementStatus;
  explanation: string;
};

export type DailyManagementCheckDto = {
  evaluationDate: string | null;
  scope: HealthScope;
  goalPace: GoalPaceDto;
  checks: DailyManagementCheckItem[];
  availability: Availability;
  generatedAt: string;
  goalBenchmarks: GoalBenchmarksDto;
};

export type DailyBriefDto = {
  meta: { from: string; to: string; store: HealthScope; generatedAt: string; latestDataAt: string | null; timezone: string; availability: Availability; confidence: Confidence };
  dataHealth: { level: "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN"; label: string; latestConfirmedDate: string | null; pendingBatchCount: number; failedBatchCount: number; openErrorCount: number; affectedSources: string[]; message: string; detailUrl: string };
  evaluation: { date: string | null; label: "前日" | "評価対象日"; latestConfirmedDate: string | null; note: string | null; availability: Availability };
  priorityActions: DailyBriefAction[];
  previousDay: { businessDate: string; sales: BriefMetric; reservations: BriefMetric; contracts: BriefMetric; attendanceCount: BriefMetric; workHours: BriefMetric; nominationRate: BriefMetric; townPv: BriefMetric; townUu: BriefMetric; heavenCastAccess: BriefMetric; ctiDiaryPosts: BriefMetric; heavenDiaryPosts: BriefMetric };
  comparisons: HomeComparisonRow[];
  nextMonthFocus: Array<{ key: HomeComparisonRow["key"]; label: string; kind: "要確認" | "強み"; rate: number; basis: "当月平均" | "同曜日平均"; sampleDays: number; confidence: Confidence; recentAverage: BriefMetric; belowAverageDays: number; consecutiveDeclineDays: number; evidence: string }>;
  kpiSignals: HomeDecisionSignal[];
  todayTop5: HomeDecisionSignal[];
  nextMonthTop5: Array<{ key: HomeComparisonRow["key"]; label: string; kind: "改善候補" | "要確認"; monthAverage: BriefMetric; weekdayAverage: BriefMetric; goal: BriefMetric; rate: number; basis: "当月平均" | "同曜日平均"; confidence: Confidence; sampleDays: number }>;
  decisionSupport: { kpiSignalEmptyReason: string; todayTop5EmptyReason: string; nextMonthTop5EmptyReason: string };
  management: DailyManagementCheckDto;
  monthProgress: { currentSales: BriefMetric; currentReward: BriefMetric; currentProfit: BriefMetric; currentReservations: BriefMetric; currentContracts: BriefMetric; currentAttendance: BriefMetric; currentDiaryPosts: BriefMetric; goalSales: BriefMetric; achievementRate: BriefMetric; projectedSales: BriefMetric; remainingGap: BriefMetric; requiredDailySales: BriefMetric; remainingDays: number | null; periodEnd: string; elapsedDays: number; availability: Availability };
  storeIssues: Array<{ storeId: string; storeName: string; situation: string; evidence: string[]; priority: "HIGH" | "MEDIUM" | "LOW"; detailUrl: string }>;
  castIssues: Array<{ castId: string; castName: string; storeName: string | null; situation: string; evidence: string[]; confidence: Confidence; detailUrl: string }>;
  mediaActivity: { townShopPv: BriefMetric; townShopUu: BriefMetric; townCastPagePv: BriefMetric; townDiaryPv: BriefMetric; townDiaryUu: BriefMetric; heavenShopAccess: BriefMetric; heavenCastAccess: BriefMetric; heavenDiaryPosts: BriefMetric; ctiDiaryPosts: BriefMetric; notes: string[]; monthlyBenchmarks: MonthlyMediaBenchmark[] };
  trend?: { daily: HomeTrendPoint[] };
  quickLinks: Array<{ label: string; href: string; description: string }>;
};

/** Home graph input. Derived values are prepared in Integration, not in the page. */
export type HomeTrendPoint = {
  date: string;
  sales: number;
  attendance: number;
  hours: number;
  minutes: number;
  contracts: number;
  cumulative: number;
  target: number | null;
  forecast: number | null;
  targetGap: number | null;
  salesPerAttendance: number | null;
  salesPerHour: number | null;
};

type CtiRow = { castId: string; storeId: string; businessDate: Date; attendanceCount: number; attendanceMinutes: number; salesAmount: number | null; castRewardAmount: number | null; ctiProfitAmount: number | null; reservationCount: number; contractCount: number; regularNominationCount: number; diaryCountCti: number };

const metric = (value: number | null, unit: BriefMetric["unit"], confidence: Confidence = "High"): BriefMetric => ({ value, unit, confidence, availability: value === null ? "MISSING" : value === 0 ? "ZERO" : "VALUE" });
const pct = (value: number | null): BriefMetric => ({ value, unit: "percent", confidence: "High", availability: value === null ? "UNCOMPUTABLE" : value === 0 ? "ZERO" : "VALUE" });
const sum = (rows: Array<number | null>) => rows.every((value) => value === null) ? null : rows.reduce<number>((total, value) => total + (value ?? 0), 0);
const gapMetric = (actual: BriefMetric, required: BriefMetric): BriefMetric => {
  if (actual.value === null || required.value === null) return metric(null, actual.unit, "Insufficient");
  return metric(actual.value - required.value, actual.unit, actual.confidence ?? "High");
};


export async function getDailyBrief(input: { from: string; to: string; scope?: HealthScope }): Promise<DailyBriefDto> {
  const from = parseDateOnly(input.from); const to = parseDateOnly(input.to); const scope = input.scope ?? "ALL";
  const yesterday = addUtcDays(tokyoToday(), -1); const queryTo = to < yesterday ? to : yesterday; const queryFrom = from;
  const stores = await prisma.store.findMany({ where: { code: scope === "ALL" ? { in: ["KASUKABE", "KOSHIGAYA", "NODA"] } : scope }, select: { id: true, code: true, shortName: true }, orderBy: { displayOrder: "asc" } });
  const storeIds = stores.map((store) => store.id);
  const [ctiRows, townStore, heaven, health, monthlyGoal] = await Promise.all([
    prisma.ctiCastDaily.findMany({ where: { businessDate: { gte: queryFrom, lte: queryTo }, storeId: { in: storeIds }, cast: { mergedIntoCastId: null } }, select: { castId: true, storeId: true, businessDate: true, attendanceCount: true, attendanceMinutes: true, salesAmount: true, castRewardAmount: true, ctiProfitAmount: true, reservationCount: true, contractCount: true, regularNominationCount: true, diaryCountCti: true } }),
    prisma.townStoreDaily.findMany({ where: { date: { gte: queryFrom, lte: queryTo }, storeId: { in: storeIds } }, select: { date: true, storeId: true, pv: true, uu: true } }),
    prisma.heavenCastDaily.findMany({ where: { businessDate: { gte: queryFrom, lte: queryTo }, storeId: { in: storeIds }, castId: { not: null }, cast: { mergedIntoCastId: null } }, select: { castId: true, storeId: true, businessDate: true, metricKey: true, rawValue: true, rawValueStatus: true, valueKind: true } }),
    getDataHealth({ from: queryFrom, to: queryTo, scope, media: "ALL" }),
    prisma.monthlyGoal.findUnique({ where: { targetMonth_scopeKey: { targetMonth: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)), scopeKey: "OVERALL" } } }),
  ]);
  const candidateDates = [...new Set([...ctiRows.map((row) => formatDateOnly(row.businessDate)), ...townStore.map((row) => formatDateOnly(row.date)), ...heaven.map((row) => formatDateOnly(row.businessDate))])].map(parseDateOnly);
  const evaluationResolution = resolveEvaluationDate({ today: new Date(), selectedFrom: from, selectedTo: to, confirmedDates: candidateDates });
  const evaluationDate = evaluationResolution.date;
  const evaluationDateText = evaluationDate ? formatDateOnly(evaluationDate) : null;
  const evaluationLabel = evaluationResolution.label;
  const evaluationNote = evaluationResolution.note;
  const previousDate = evaluationDate ?? queryTo;
  const cti = ctiRows.filter((row) => row.businessDate >= from && row.businessDate <= previousDate);
  const previous = evaluationDate ? ctiRows.filter((row) => formatDateOnly(row.businessDate) === evaluationDateText) : [];
  const total = (rows: CtiRow[]) => ({ sales: sum(rows.map((row) => row.salesAmount)), reward: sum(rows.map((row) => row.castRewardAmount)), profit: sum(rows.map((row) => row.ctiProfitAmount)), reservations: sum(rows.map((row) => row.reservationCount)), contracts: sum(rows.map((row) => row.contractCount)), attendance: new Set(rows.filter((row) => row.attendanceCount > 0).map((row) => `${row.businessDate.toISOString().slice(0, 10)}:${row.castId}`)).size, minutes: sum(rows.map((row) => row.attendanceMinutes)), regular: sum(rows.map((row) => row.regularNominationCount)), diaryPosts: sum(rows.map((row) => row.diaryCountCti)) });
  const current = total(cti); const prior = total(previous); const confidence: Confidence = cti.length >= 20 ? "High" : cti.length >= 10 ? "Medium" : cti.length >= 5 ? "Low" : "Insufficient";
  const heavenAccess = heaven.filter((row) => row.metricKey === "page_access" && row.rawValueStatus === "VALUE"); const diaryPosts = heaven.filter((row) => row.metricKey === "diary_posts" && row.rawValueStatus === "VALUE");
  const dailyDates = [...new Set([...ctiRows.map((row) => formatDateOnly(row.businessDate)), ...townStore.map((row) => formatDateOnly(row.date)), ...heaven.map((row) => formatDateOnly(row.businessDate))])].sort();
  const dailyComparisonInput: HomeDailyMetricInput[] = dailyDates.map((date) => {
    const ctiDay = ctiRows.filter((row) => formatDateOnly(row.businessDate) === date); const townDay = townStore.filter((row) => formatDateOnly(row.date) === date); const heavenDay = heaven.filter((row) => formatDateOnly(row.businessDate) === date);
    return { date: parseDateOnly(date), sales: sum(ctiDay.map((row) => row.salesAmount)), reservations: sum(ctiDay.map((row) => row.reservationCount)), contracts: sum(ctiDay.map((row) => row.contractCount)), attendance: ctiDay.length ? new Set(ctiDay.filter((row) => row.attendanceCount > 0).map((row) => row.castId)).size : null, minutes: sum(ctiDay.map((row) => row.attendanceMinutes)), townPv: sum(townDay.map((row) => row.pv)), townUu: sum(townDay.map((row) => row.uu)), heavenAccess: sum(heavenDay.filter((row) => row.metricKey === "page_access" && row.rawValueStatus === "VALUE").map((row) => Number(row.rawValue))), ctiDiaryPosts: sum(ctiDay.map((row) => row.diaryCountCti)), heavenDiaryPosts: sum(heavenDay.filter((row) => row.metricKey === "diary_posts" && row.rawValueStatus === "VALUE").map((row) => Number(row.rawValue))) };
  });
  const comparisons = buildHomeComparisons({ previousDate, from, to, daily: dailyComparisonInput });
  const recentMetricValue = (item: HomeDailyMetricInput, key: HomeComparisonRow["key"]): number | null => key === "sales" ? item.sales ?? null : key === "reservations" ? item.reservations ?? null : key === "attendance" ? item.attendance ?? null : key === "hours" ? item.minutes === null || item.minutes === undefined ? null : item.minutes / 60 : key === "townPv" ? item.townPv ?? null : key === "townUu" ? item.townUu ?? null : key === "heavenAccess" ? item.heavenAccess ?? null : key === "heavenDiaryPosts" ? item.heavenDiaryPosts ?? null : null;
  const nextMonthFocus = comparisons
    .map((row) => {
      const recentFrom = addUtcDays(previousDate, -6);
      const recent = dailyComparisonInput.filter((item) => item.date >= recentFrom && item.date <= previousDate).map((item) => recentMetricValue(item, row.key)).filter((item): item is number => item !== null);
      const baseline = row.monthAverage.value;
      if (recent.length < 3 || baseline === null || baseline === 0 || row.vsMonthAverage.confidence === "Insufficient") return null;
      const recentValue = recent.reduce((total, item) => total + item, 0) / recent.length;
      const rate = (recentValue - baseline) / Math.abs(baseline);
      const belowAverageDays = recent.filter((item) => item < baseline).length;
      let consecutiveDeclineDays = 0;
      for (let index = recent.length - 1; index >= 0 && recent[index] < baseline; index -= 1) consecutiveDeclineDays += 1;
      if (belowAverageDays < 2 && rate >= 0) return null;
      return { key: row.key, label: row.label, kind: rate < 0 ? "要確認" as const : "強み" as const, rate, basis: "当月平均" as const, sampleDays: recent.length, confidence: row.vsMonthAverage.confidence, recentAverage: metric(recentValue, row.unit, row.vsMonthAverage.confidence), belowAverageDays, consecutiveDeclineDays, evidence: `直近${recent.length}日のうち${belowAverageDays}日が当月平均以下` };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))
    .slice(0, 5);
  const comparisonValue = (key: HomeComparisonRow["key"]) => comparisons.find((row) => row.key === key)?.previousDay.value ?? null;
  const previousDay = { businessDate: formatDateOnly(previousDate), sales: metric(prior.sales, "yen", confidence), reservations: metric(prior.reservations, "count", confidence), contracts: metric(prior.contracts, "count", confidence), attendanceCount: metric(prior.attendance, "count", confidence), workHours: metric(prior.minutes === null ? null : prior.minutes / 60, "hours", confidence), nominationRate: pct(prior.contracts && prior.regular !== null ? prior.regular / prior.contracts : null), townPv: metric(comparisonValue("townPv"), "count", confidence), townUu: metric(comparisonValue("townUu"), "count", confidence), heavenCastAccess: metric(comparisonValue("heavenAccess"), "count", confidence), ctiDiaryPosts: metric(comparisonValue("ctiDiaryPosts"), "count", confidence), heavenDiaryPosts: metric(comparisonValue("heavenDiaryPosts"), "count", confidence) };
  const healthLevel = health.summary.failedBatches > 0 || health.summary.pendingBatches > 0 ? (health.summary.failedBatches > 0 ? "CRITICAL" : "WARNING") : "HEALTHY";
  const healthLabel = healthLevel === "HEALTHY" ? "正常" : healthLevel === "WARNING" ? "一部確認が必要" : "重要なデータ不足";
  const actions: DailyBriefAction[] = [];
  if (health.summary.failedBatches > 0 || health.summary.pendingBatches > 0) actions.push({ id: "data-health", priority: "HIGH", category: "DATA_HEALTH", title: "データ状態を確認", situation: "未確定または失敗した取込があります", evidence: [`未確定Batch ${health.summary.pendingBatches}件`, `FAILED ${health.summary.failedBatches}件`], recommendedCheck: "DATA HEALTHで対象期間と媒体を確認してください。", storeId: null, castId: null, detailUrl: `/data-health?period=custom&from=${input.from}&to=${input.to}&scope=${scope}`, availability: "VALUE", confidence: "High" });
  if (current.sales !== null && prior.sales !== null && prior.sales > 0 && current.sales < prior.sales * 0.8) actions.push({ id: "sales-drop", priority: "HIGH", category: "SALES", title: "前日の売上低下を確認", situation: "対象期間の売上が比較日より低下しています", evidence: [`対象期間 ${current.sales.toLocaleString("ja-JP")}円`, `比較日 ${prior.sales.toLocaleString("ja-JP")}円`], recommendedCheck: "店舗別の出勤量と効率を確認してください。", storeId: null, castId: null, detailUrl: `/analytics/trend?from=${input.from}&to=${input.to}&store=${scope}&comparison=previousDay`, availability: "VALUE", confidence });
  if (current.reservations !== null && prior.reservations !== null && prior.reservations > 0 && current.reservations < prior.reservations * 0.8) actions.push({ id: "reservation-drop", priority: "MEDIUM", category: "RESERVATION", title: "予約数の変化を確認", situation: "予約数が比較日より低下しています", evidence: [`対象期間 ${current.reservations}件`, `比較日 ${prior.reservations}件`], recommendedCheck: "出勤人数・店舗状況・掲載状態を確認してください。媒体経由予約は特定しません。", storeId: null, castId: null, detailUrl: `/analytics/performance?from=${input.from}&to=${input.to}&store=${scope}`, availability: "VALUE", confidence });
  const storeIssues = stores.map((store) => { const rows = cti.filter((row) => row.storeId === store.id); const sales = sum(rows.map((row) => row.salesAmount)); const reservations = sum(rows.map((row) => row.reservationCount)); return { storeId: store.id, storeName: store.shortName, situation: rows.length ? "実績を確認できます" : "対象期間のCTI実績がありません", evidence: rows.length ? [`売上 ${sales?.toLocaleString("ja-JP")}円`, `予約 ${reservations ?? 0}件`] : ["CTIデータ不足"], priority: rows.length ? "LOW" as const : "MEDIUM" as const, detailUrl: `/analytics/store?from=${input.from}&to=${input.to}&store=${store.code}` }; }).filter((item) => item.priority !== "LOW" || actions.length < 3);
  // Cast candidates are intentionally delegated to Cast Analytics. Keep the legacy DTO field empty for compatibility.
  const castIssues: DailyBriefDto["castIssues"] = [];
  const townMetric = (field: "pv" | "uu") => metric(sum(townStore.map((row) => row[field])), "count", townStore.length >= 20 ? "High" : confidence);
  const periodEnd = from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth() ? endOfMonth(from) : to;
  const days = daysInclusive(from, periodEnd); const sales = current.sales; const goal = monthlyGoal?.salesTarget === null || monthlyGoal?.salesTarget === undefined ? null : Number(monthlyGoal.salesTarget); const elapsed = evaluationDate && evaluationDate >= from ? Math.min(days, daysInclusive(from, evaluationDate)) : 0; const projected = sales === null || elapsed === 0 ? null : sales / elapsed * days; const remainingDays = evaluationDate && evaluationDate < periodEnd ? daysInclusive(addUtcDays(evaluationDate, 1), periodEnd) : 0; const remainingGap = goal !== null && sales !== null ? Math.max(0, goal - sales) : null; const requiredDailySales = remainingDays > 0 && remainingGap !== null ? remainingGap / remainingDays : null;
  const signalFor = (row: HomeComparisonRow): HomeDecisionSignal | null => {
    const candidates = [{ rate: row.vsMonthAverage.differenceRate.value, basis: "当月平均" as const, baseline: row.monthAverage, difference: row.vsMonthAverage.difference, sampleDays: row.vsMonthAverage.sampleDays, confidence: row.vsMonthAverage.confidence }, { rate: row.vsWeekdayAverage.differenceRate.value, basis: "同曜日平均" as const, baseline: row.weekdayAverage, difference: row.vsWeekdayAverage.difference, sampleDays: row.vsWeekdayAverage.sampleDays, confidence: row.vsWeekdayAverage.confidence }].filter((item): item is typeof item & { rate: number } => item.rate !== null && item.sampleDays >= 5);
    if (!candidates.length) return null;
    const selected = candidates.sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))[0];
    return { key: row.key, label: row.label, rate: selected.rate, basis: selected.basis, direction: selected.rate < 0 ? "低下" : "上昇", kind: selected.rate < 0 ? "要確認" : "強み", previousDay: row.previousDay, baseline: selected.baseline, difference: selected.difference, confidence: selected.confidence, sampleDays: selected.sampleDays };
  };
  const kpiSignals = comparisons.map(signalFor).filter((item): item is HomeDecisionSignal => item !== null && Math.abs(item.rate) >= 0.1).sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate));
  const todayTop5 = [...kpiSignals.filter((item) => item.rate < 0)];
  if (health.summary.failedBatches > 0 || health.summary.pendingBatches > 0) todayTop5.unshift({ key: "dataHealth", label: "DATA HEALTH", rate: -1, basis: "DATA HEALTH", direction: "低下", kind: "要確認", previousDay: metric(null, "count", "Insufficient"), baseline: metric(null, "count", "Insufficient"), difference: metric(null, "count", "Insufficient"), confidence: "High", sampleDays: 0 });
  if (goal !== null && sales !== null && goal > 0 && sales < goal) todayTop5.push({ key: "goal", label: "目標乖離", rate: (sales - goal) / goal, basis: "目標", direction: "低下", kind: "要確認", previousDay: metric(sales, "yen", confidence), baseline: metric(goal, "yen", confidence), difference: metric(sales - goal, "yen", confidence), confidence, sampleDays: cti.length });
  const todaySignals = todayTop5.sort((a, b) => a.key === "dataHealth" ? -1 : b.key === "dataHealth" ? 1 : Math.abs(b.rate) - Math.abs(a.rate)).slice(0, 5);
  const nextMonthTop5 = nextMonthFocus.filter((item) => item.rate < 0).map((item) => { const row = comparisons.find((candidate) => candidate.key === item.key)!; return { key: item.key, label: item.label, kind: "改善候補" as const, monthAverage: row.monthAverage, weekdayAverage: row.weekdayAverage, goal: item.key === "sales" ? metric(goal, "yen", goal === null ? "Insufficient" : confidence) : metric(null, row.unit, "Insufficient"), rate: item.rate, basis: item.basis, confidence: item.confidence, sampleDays: item.sampleDays }; });
  const allInsufficient = comparisons.length === 0 || comparisons.every((row) => row.vsMonthAverage.sampleDays < 5 && row.vsWeekdayAverage.sampleDays < 5);
  const decisionSupport = { kpiSignalEmptyReason: allInsufficient ? "比較に必要なサンプルが不足しているため、判定できません。" : "一定以上の差がある指標はありません。", todayTop5EmptyReason: healthLevel === "CRITICAL" ? "DATA HEALTH異常があるため、比較判定を優先できません。" : allInsufficient ? "比較に必要なサンプルが不足しています。" : "現在、確認優先度の高い指標はありません。", nextMonthTop5EmptyReason: allInsufficient ? "比較データが不足しているため、改善候補を判定できません。" : "現在、十分なサンプルを伴う改善候補はありません。" };
  const ctiSampleDays = new Set(cti.map((row) => formatDateOnly(row.businessDate))).size;
  const paceConfidence: Confidence = ctiSampleDays >= 20 ? "High" : ctiSampleDays >= 10 ? "Medium" : ctiSampleDays >= 5 ? "Low" : "Insufficient";
  const currentDailyAverage = elapsed > 0 && sales !== null ? metric(sales / elapsed, "yen", paceConfidence) : metric(null, "yen", "Insufficient");
  const requiredDailyAverage = requiredDailySales !== null ? metric(requiredDailySales, "yen", paceConfidence) : metric(null, "yen", "Insufficient");
  const dailyAverageGap = gapMetric(currentDailyAverage, requiredDailyAverage);
  const paceStatus: DailyManagementStatus = goal === null || sales === null ? "データ不足" : remainingDays === 0 ? (sales >= goal ? "達成ペース" : "要確認") : requiredDailySales === null || currentDailyAverage.value === null ? "算出不能" : currentDailyAverage.value - requiredDailySales >= requiredDailySales * 0.05 ? "達成ペース" : currentDailyAverage.value - requiredDailySales <= -(requiredDailySales * 0.05) ? "不足" : "維持";
  const goalPace: GoalPaceDto = { monthlyTarget: metric(goal, "yen", paceConfidence), currentSales: metric(sales, "yen", paceConfidence), achievementRate: pct(goal !== null && goal > 0 && sales !== null ? sales / goal : null), forecast: metric(projected, "yen", paceConfidence), latestConfirmedDate: evaluationDateText, elapsedDays: elapsed, remainingDays, remainingAmount: metric(remainingGap, "yen", paceConfidence), currentDailyAverage, requiredDailyAverage, dailyAverageGap, paceStatus, minimumMaintenanceSales: requiredDailyAverage, availability: sales === null ? "MISSING" : "VALUE", sampleDays: ctiSampleDays, confidence: paceConfidence, explanation: goal === null ? "月目標が設定されていません。" : "最新確定日までの当月実績を基準にした運営目安です。保証値ではありません。" };
  const rowByKey = (key: HomeComparisonRow["key"]) => comparisons.find((row) => row.key === key);
  const checkFromRow = (metricId: string, category: DailyManagementCheckItem["category"], row: HomeComparisonRow | undefined, requiredValue: BriefMetric, explanation: string): DailyManagementCheckItem => {
    if (!row) {
      const unavailable = metric(null, requiredValue.unit, "Insufficient");
      return { metricId, label: metricId, category, actualValue: unavailable, monthlyAverage: unavailable, currentMonthlyAverage: unavailable, weekdayAverage: unavailable, requiredValue, gapFromRequired: unavailable, monthlyDifference: unavailable, monthlyDifferenceRate: pct(null), weekdayDifference: unavailable, weekdayDifferenceRate: pct(null), status: "データ不足", semanticStatus: "データ不足", explanation };
    }
    const gapFromRequired = gapMetric(row.monthAverage, requiredValue);
    const status: DailyManagementStatus = row.monthAverage.availability === "MISSING" || requiredValue.availability === "MISSING" ? "データ不足" : requiredValue.value === null || row.monthAverage.value === null ? "算出不能" : row.monthAverage.value >= requiredValue.value ? "十分" : "不足";
    return { metricId, label: row.label, category, actualValue: row.previousDay, monthlyAverage: row.monthAverage, currentMonthlyAverage: row.monthAverage, weekdayAverage: row.weekdayAverage, requiredValue, gapFromRequired, monthlyDifference: row.vsMonthAverage.difference, monthlyDifferenceRate: row.vsMonthAverage.differenceRate, weekdayDifference: row.vsWeekdayAverage.difference, weekdayDifferenceRate: row.vsWeekdayAverage.differenceRate, status, semanticStatus: status, explanation: `${explanation} 現在の当月日平均と、残り期間で必要な日次目安との差を表示しています。` };
  };
  const salesPerAttendance = current.attendance > 0 && sales !== null ? sales / current.attendance : null;
  const salesPerContract = current.contracts !== null && current.contracts > 0 && sales !== null ? sales / current.contracts : null;
  const salesPerHour = current.minutes !== null && current.minutes > 0 && sales !== null ? sales / (current.minutes / 60) : null;
  const safeRequired = (ratio: number | null): BriefMetric => requiredDailySales !== null && ratio !== null && ratio > 0 && paceConfidence !== "Insufficient" ? metric(Math.ceil(requiredDailySales / ratio), "count", paceConfidence) : metric(null, "count", ratio === null ? "Insufficient" : "Insufficient");
  const requiredAttendance = safeRequired(salesPerAttendance);
  const requiredContracts = safeRequired(salesPerContract);
  const requiredHours = requiredDailySales !== null && salesPerHour !== null && salesPerHour > 0 && paceConfidence !== "Insufficient" ? metric(Math.ceil(requiredDailySales / salesPerHour), "hours", paceConfidence) : metric(null, "hours", "Insufficient");
  const managementChecks: DailyManagementCheckItem[] = [
    checkFromRow("sales", "売上・目標", rowByKey("sales"), requiredDailyAverage, "当月目標達成に必要な日平均との比較です。"),
    checkFromRow("attendance", "稼働", rowByKey("attendance"), requiredAttendance, "当月の実績売上と延べ出勤母数を基準にした運営目安です。保証値ではありません。"),
    checkFromRow("hours", "稼働", rowByKey("hours"), requiredHours, "売上／時間が利用可能な場合だけ算出する運営目安です。保証値ではありません。"),
    checkFromRow("contracts", "予約・成約", rowByKey("contracts"), requiredContracts, "成約1件あたりの当月実績売上を基準にした運営目安です。予約経路は推定しません。"),
  ];
  const goalBenchmarks = await getGoalBasedBenchmarks({ from: input.from, to: input.to, scope, evaluationDate: evaluationDateText, monthlyTarget: goal, requiredDailyAverage: requiredDailyAverage.value, remainingAmount: remainingGap, remainingDays, requiredValues: { attendance: requiredAttendance.value, hours: requiredHours.value, contracts: requiredContracts.value } });
  const monthlyMediaBenchmarks = await getMonthlyMediaBenchmarks({ from: input.from, to: input.to, scope, evaluationDate: evaluationDateText });
  const management: DailyManagementCheckDto = { evaluationDate: evaluationDateText, scope, goalPace, checks: managementChecks, availability: evaluationDate ? "VALUE" : "MISSING", generatedAt: new Date().toISOString(), goalBenchmarks };
  let cumulative = 0;
  const trend = [...new Set(cti.map((row) => formatDateOnly(row.businessDate)))].sort().map((date, index, dates): HomeTrendPoint => {
    const day = cti.filter((row) => formatDateOnly(row.businessDate) === date);
    const daySales = sum(day.map((row) => row.salesAmount)) ?? 0;
    const attendance = new Set(day.filter((row) => row.attendanceCount > 0).map((row) => row.castId)).size;
    const minutes = sum(day.map((row) => row.attendanceMinutes)) ?? 0;
    cumulative += daySales;
    const target = goal === null ? null : goal * ((index + 1) / Math.max(1, days));
    return { date, sales: daySales, attendance, hours: minutes / 60, minutes, contracts: sum(day.map((row) => row.contractCount)) ?? 0, cumulative, target, forecast: index === dates.length - 1 ? projected : null, targetGap: target === null ? null : cumulative - target, salesPerAttendance: attendance ? daySales / attendance : null, salesPerHour: minutes ? daySales / (minutes / 60) : null };
  });
  return { meta: { from: input.from, to: input.to, store: scope, generatedAt: new Date().toISOString(), latestDataAt: health.summary.latestReflectedDate, timezone: "Asia/Tokyo", availability: cti.length ? "VALUE" : "MISSING", confidence }, evaluation: { date: evaluationDateText, label: evaluationLabel, latestConfirmedDate: health.summary.latestReflectedDate, note: evaluationNote, availability: evaluationDate ? "VALUE" : "MISSING" }, dataHealth: { level: healthLevel, label: healthLabel, latestConfirmedDate: health.summary.latestReflectedDate, pendingBatchCount: health.summary.pendingBatches, failedBatchCount: health.summary.failedBatches, openErrorCount: health.summary.warnings, affectedSources: health.mediaCards.filter((card) => card.pending || card.failed).map((card) => card.media), message: healthLevel === "HEALTHY" ? "主要データは確認済みです。" : "未確定データがあるため、一部の実績が反映されていない可能性があります。", detailUrl: `/data-health?period=custom&from=${input.from}&to=${input.to}&scope=${scope}` }, priorityActions: actions.slice(0, 3), previousDay, comparisons, kpiSignals, todayTop5: todaySignals, nextMonthFocus, nextMonthTop5, decisionSupport, management, monthProgress: { currentSales: metric(sales, "yen", confidence), currentReward: metric(current.reward, "yen", confidence), currentProfit: metric(current.profit, "yen", confidence), currentReservations: metric(current.reservations, "count", confidence), currentContracts: metric(current.contracts, "count", confidence), currentAttendance: metric(current.attendance, "count", confidence), currentDiaryPosts: metric(current.diaryPosts, "count", confidence), goalSales: metric(goal, "yen", goal === null ? "Insufficient" : confidence), achievementRate: pct(goal && sales !== null ? sales / goal : null), projectedSales: metric(projected, "yen", confidence), remainingGap: metric(remainingGap, "yen", confidence), requiredDailySales: metric(requiredDailySales, "yen", confidence), remainingDays, periodEnd: formatDateOnly(periodEnd), elapsedDays: elapsed, availability: sales === null ? "MISSING" : "VALUE" }, storeIssues, castIssues, mediaActivity: { townShopPv: townMetric("pv"), townShopUu: townMetric("uu"), townCastPagePv: metric(null, "count", "Insufficient"), townDiaryPv: metric(null, "count", "Insufficient"), townDiaryUu: metric(null, "count", "Insufficient"), heavenShopAccess: metric(null, "count", "Insufficient"), heavenCastAccess: metric(sum(heavenAccess.map((row) => row.rawValueStatus === "VALUE" ? Number(row.rawValue) : null)), "count", confidence), heavenDiaryPosts: metric(sum(diaryPosts.map((row) => row.rawValueStatus === "VALUE" ? Number(row.rawValue) : null)), "count", confidence), ctiDiaryPosts: metric(sum(cti.map((row) => row.diaryCountCti)), "count", confidence), monthlyBenchmarks: monthlyMediaBenchmarks, notes: ["媒体から予約・成約への直接経路は特定していません。", "Heavenの未取得指標は0ではなくデータ不足として表示します。", "Heaven写メ日記PVは正式データがないため表示していません。"] }, trend: { daily: trend }, quickLinks: [{ label: "DATA HEALTH", href: `/data-health?period=custom&from=${input.from}&to=${formatDateOnly(periodEnd)}&scope=${scope}`, description: "データ状態を確認" }, { label: "店舗分析", href: `/analytics/store?from=${input.from}&to=${input.to}&store=${scope}`, description: "店舗別の根拠を見る" }, { label: "キャスト分析", href: `/analytics/cast?from=${input.from}&to=${input.to}&store=${scope}`, description: "キャスト別の根拠を見る" }, { label: "推移", href: `/analytics/trend?from=${input.from}&to=${input.to}&store=${scope}`, description: "推移を見る" }, { label: "曜日分析", href: `/analytics/time?from=${input.from}&to=${input.to}&store=${scope}`, description: "曜日別効率を見る" }, { label: "目標管理", href: "/settings/goals", description: "目標を設定" }] };
}
