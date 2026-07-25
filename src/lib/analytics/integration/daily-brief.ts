import type { Availability, Confidence } from "@/lib/analytics/engine";
import { getDataHealth, type HealthScope } from "@/lib/analytics/data-health";
import { formatDateOnly, parseDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";

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

export type DailyBriefDto = {
  meta: { from: string; to: string; store: HealthScope; generatedAt: string; latestDataAt: string | null; timezone: string; availability: Availability; confidence: Confidence };
  dataHealth: { level: "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN"; label: string; latestConfirmedDate: string | null; pendingBatchCount: number; failedBatchCount: number; openErrorCount: number; affectedSources: string[]; message: string; detailUrl: string };
  priorityActions: DailyBriefAction[];
  previousDay: { businessDate: string; sales: BriefMetric; reservations: BriefMetric; contracts: BriefMetric; attendanceCount: BriefMetric; workHours: BriefMetric; nominationRate: BriefMetric };
  monthProgress: { currentSales: BriefMetric; goalSales: BriefMetric; achievementRate: BriefMetric; projectedSales: BriefMetric; remainingGap: BriefMetric; remainingDays: number | null; availability: Availability };
  storeIssues: Array<{ storeId: string; storeName: string; situation: string; evidence: string[]; priority: "HIGH" | "MEDIUM" | "LOW"; detailUrl: string }>;
  castIssues: Array<{ castId: string; castName: string; storeName: string | null; situation: string; evidence: string[]; confidence: Confidence; detailUrl: string }>;
  mediaActivity: { townShopPv: BriefMetric; townShopUu: BriefMetric; townCastPagePv: BriefMetric; townDiaryPv: BriefMetric; townDiaryUu: BriefMetric; heavenShopAccess: BriefMetric; heavenCastAccess: BriefMetric; heavenDiaryPosts: BriefMetric; ctiDiaryPosts: BriefMetric; notes: string[] };
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

type CtiRow = { castId: string; storeId: string; businessDate: Date; attendanceCount: number; attendanceMinutes: number; salesAmount: number | null; reservationCount: number; contractCount: number; regularNominationCount: number };

const metric = (value: number | null, unit: BriefMetric["unit"], confidence: Confidence = "High"): BriefMetric => ({ value, unit, confidence, availability: value === null ? "MISSING" : value === 0 ? "ZERO" : "VALUE" });
const pct = (value: number | null): BriefMetric => ({ value, unit: "percent", confidence: "High", availability: value === null ? "UNCOMPUTABLE" : value === 0 ? "ZERO" : "VALUE" });
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; };
const sum = (rows: Array<number | null>) => rows.every((value) => value === null) ? null : rows.reduce<number>((total, value) => total + (value ?? 0), 0);


export async function getDailyBrief(input: { from: string; to: string; scope?: HealthScope }): Promise<DailyBriefDto> {
  const from = parseDateOnly(input.from); const to = parseDateOnly(input.to); const scope = input.scope ?? "ALL";
  const previousDate = addDays(to, -1); const stores = await prisma.store.findMany({ where: { code: scope === "ALL" ? { in: ["KASUKABE", "KOSHIGAYA", "NODA"] } : scope }, select: { id: true, code: true, shortName: true }, orderBy: { displayOrder: "asc" } });
  const storeIds = stores.map((store) => store.id);
  const cti = await prisma.ctiCastDaily.findMany({ where: { businessDate: { gte: from, lte: to }, storeId: { in: storeIds }, cast: { mergedIntoCastId: null } }, select: { castId: true, storeId: true, businessDate: true, attendanceCount: true, attendanceMinutes: true, salesAmount: true, reservationCount: true, contractCount: true, regularNominationCount: true } });
  const previous = await prisma.ctiCastDaily.findMany({ where: { businessDate: { gte: previousDate, lte: previousDate }, storeId: { in: storeIds }, cast: { mergedIntoCastId: null } }, select: { castId: true, storeId: true, businessDate: true, attendanceCount: true, attendanceMinutes: true, salesAmount: true, reservationCount: true, contractCount: true, regularNominationCount: true } });
  const [town, heaven, health, monthlyGoal, casts] = await Promise.all([
    prisma.townCastDaily.findMany({ where: { date: { gte: from, lte: to }, storeId: { in: storeIds }, cast: { mergedIntoCastId: null } }, select: { castId: true, storeId: true, date: true, pv: true, uu: true, telTapUu: true } }),
    prisma.heavenCastDaily.findMany({ where: { businessDate: { gte: from, lte: to }, storeId: { in: storeIds }, castId: { not: null }, cast: { mergedIntoCastId: null } }, select: { castId: true, storeId: true, businessDate: true, metricKey: true, rawValue: true, rawValueStatus: true, valueKind: true } }),
    getDataHealth({ from, to, scope, media: "ALL" }),
    prisma.monthlyGoal.findUnique({ where: { targetMonth_scopeKey: { targetMonth: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)), scopeKey: "OVERALL" } } }),
    prisma.cast.findMany({ where: { id: { in: [...new Set(cti.map((row) => row.castId))] }, mergedIntoCastId: null }, select: { id: true, displayName: true, primaryStore: { select: { shortName: true } } } }),
  ]);
  const total = (rows: CtiRow[]) => ({ sales: sum(rows.map((row) => row.salesAmount)), reservations: sum(rows.map((row) => row.reservationCount)), contracts: sum(rows.map((row) => row.contractCount)), attendance: new Set(rows.filter((row) => row.attendanceCount > 0).map((row) => `${row.businessDate.toISOString().slice(0, 10)}:${row.castId}`)).size, minutes: sum(rows.map((row) => row.attendanceMinutes)), regular: sum(rows.map((row) => row.regularNominationCount)) });
  const current = total(cti); const prior = total(previous); const confidence: Confidence = cti.length >= 20 ? "High" : cti.length >= 10 ? "Medium" : cti.length >= 5 ? "Low" : "Insufficient";
  const previousDay = { businessDate: formatDateOnly(previousDate), sales: metric(prior.sales, "yen", confidence), reservations: metric(prior.reservations, "count", confidence), contracts: metric(prior.contracts, "count", confidence), attendanceCount: metric(prior.attendance, "count", confidence), workHours: metric(prior.minutes === null ? null : prior.minutes / 60, "hours", confidence), nominationRate: pct(prior.contracts && prior.regular !== null ? prior.regular / prior.contracts : null) };
  const healthLevel = health.summary.failedBatches > 0 || health.summary.pendingBatches > 0 ? (health.summary.failedBatches > 0 ? "CRITICAL" : "WARNING") : "HEALTHY";
  const healthLabel = healthLevel === "HEALTHY" ? "正常" : healthLevel === "WARNING" ? "一部確認が必要" : "重要なデータ不足";
  const actions: DailyBriefAction[] = [];
  if (health.summary.failedBatches > 0 || health.summary.pendingBatches > 0) actions.push({ id: "data-health", priority: "HIGH", category: "DATA_HEALTH", title: "データ状態を確認", situation: "未確定または失敗した取込があります", evidence: [`未確定Batch ${health.summary.pendingBatches}件`, `FAILED ${health.summary.failedBatches}件`], recommendedCheck: "DATA HEALTHで対象期間と媒体を確認してください。", storeId: null, castId: null, detailUrl: `/data-health?period=custom&from=${input.from}&to=${input.to}&scope=${scope}`, availability: "VALUE", confidence: "High" });
  if (current.sales !== null && prior.sales !== null && prior.sales > 0 && current.sales < prior.sales * 0.8) actions.push({ id: "sales-drop", priority: "HIGH", category: "SALES", title: "前日の売上低下を確認", situation: "対象期間の売上が比較日より低下しています", evidence: [`対象期間 ${current.sales.toLocaleString("ja-JP")}円`, `比較日 ${prior.sales.toLocaleString("ja-JP")}円`], recommendedCheck: "店舗別の出勤量と効率を確認してください。", storeId: null, castId: null, detailUrl: `/analytics/trend?from=${input.from}&to=${input.to}&store=${scope}&comparison=previousDay`, availability: "VALUE", confidence });
  if (current.reservations !== null && prior.reservations !== null && prior.reservations > 0 && current.reservations < prior.reservations * 0.8) actions.push({ id: "reservation-drop", priority: "MEDIUM", category: "RESERVATION", title: "予約数の変化を確認", situation: "予約数が比較日より低下しています", evidence: [`対象期間 ${current.reservations}件`, `比較日 ${prior.reservations}件`], recommendedCheck: "出勤人数・店舗状況・掲載状態を確認してください。媒体経由予約は特定しません。", storeId: null, castId: null, detailUrl: `/analytics/performance?from=${input.from}&to=${input.to}&store=${scope}`, availability: "VALUE", confidence });
  const storeIssues = stores.map((store) => { const rows = cti.filter((row) => row.storeId === store.id); const sales = sum(rows.map((row) => row.salesAmount)); const reservations = sum(rows.map((row) => row.reservationCount)); return { storeId: store.id, storeName: store.shortName, situation: rows.length ? "実績を確認できます" : "対象期間のCTI実績がありません", evidence: rows.length ? [`売上 ${sales?.toLocaleString("ja-JP")}円`, `予約 ${reservations ?? 0}件`] : ["CTIデータ不足"], priority: rows.length ? "LOW" as const : "MEDIUM" as const, detailUrl: `/analytics/store?from=${input.from}&to=${input.to}&store=${store.code}` }; }).filter((item) => item.priority !== "LOW" || actions.length < 3);
  const castById = new Map(casts.map((cast) => [cast.id, cast])); const castIssues = [...new Set(cti.map((row) => row.castId))].map((castId) => { const rows = cti.filter((row) => row.castId === castId); const sales = sum(rows.map((row) => row.salesAmount)); const cast = castById.get(castId); return cast ? { castId, castName: cast.displayName, storeName: cast.primaryStore?.shortName ?? null, situation: "対象期間の実績を確認してください", evidence: [`売上 ${sales?.toLocaleString("ja-JP")}円`, `出勤 ${new Set(rows.map((row) => formatDateOnly(row.businessDate))).size}日`], confidence, detailUrl: `/analytics/cast?cast=${castId}&from=${input.from}&to=${input.to}` } : null; }).filter((item): item is NonNullable<typeof item> => Boolean(item)).slice(0, 5);
  const townMetric = (field: "pv" | "uu") => metric(sum(town.map((row) => row[field])), "count", town.length >= 20 ? "High" : confidence);
  const heavenAccess = heaven.filter((row) => row.metricKey === "page_access" && row.rawValueStatus === "VALUE"); const diaryPosts = heaven.filter((row) => row.metricKey === "diary_posts" && row.rawValueStatus === "VALUE");
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1); const sales = current.sales; const goal = monthlyGoal?.salesTarget === null || monthlyGoal?.salesTarget === undefined ? null : Number(monthlyGoal.salesTarget); const elapsed = Math.max(1, Math.min(days, Math.ceil((Date.now() - from.getTime()) / 86400000))); const projected = sales === null ? null : sales / elapsed * days; const remainingDays = Math.max(0, days - elapsed);
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
  return { meta: { from: input.from, to: input.to, store: scope, generatedAt: new Date().toISOString(), latestDataAt: health.summary.latestReflectedDate, timezone: "Asia/Tokyo", availability: cti.length ? "VALUE" : "MISSING", confidence }, dataHealth: { level: healthLevel, label: healthLabel, latestConfirmedDate: health.summary.latestReflectedDate, pendingBatchCount: health.summary.pendingBatches, failedBatchCount: health.summary.failedBatches, openErrorCount: health.summary.warnings, affectedSources: health.mediaCards.filter((card) => card.pending || card.failed).map((card) => card.media), message: healthLevel === "HEALTHY" ? "主要データは確認済みです。" : "未確定データがあるため、一部の実績が反映されていない可能性があります。", detailUrl: `/data-health?period=custom&from=${input.from}&to=${input.to}&scope=${scope}` }, priorityActions: actions.slice(0, 3), previousDay, monthProgress: { currentSales: metric(sales, "yen", confidence), goalSales: metric(goal, "yen", goal === null ? "Insufficient" : confidence), achievementRate: pct(goal && sales !== null ? sales / goal : null), projectedSales: metric(projected, "yen", confidence), remainingGap: metric(goal !== null && sales !== null ? Math.max(0, goal - sales) : null, "yen", confidence), remainingDays, availability: sales === null ? "MISSING" : "VALUE" }, storeIssues, castIssues, mediaActivity: { townShopPv: townMetric("pv"), townShopUu: townMetric("uu"), townCastPagePv: metric(null, "count", "Insufficient"), townDiaryPv: metric(null, "count", "Insufficient"), townDiaryUu: metric(null, "count", "Insufficient"), heavenShopAccess: metric(null, "count", "Insufficient"), heavenCastAccess: metric(sum(heavenAccess.map((row) => row.rawValueStatus === "VALUE" ? Number(row.rawValue) : null)), "count", confidence), heavenDiaryPosts: metric(sum(diaryPosts.map((row) => row.rawValueStatus === "VALUE" ? Number(row.rawValue) : null)), "count", confidence), ctiDiaryPosts: metric(null, "count", "Insufficient"), notes: ["媒体から予約・成約への直接経路は特定していません。", "Heavenの未取得指標は0ではなくデータ不足として表示します。"] }, trend: { daily: trend }, quickLinks: [{ label: "DATA HEALTH", href: `/data-health?period=custom&from=${input.from}&to=${input.to}&scope=${scope}`, description: "データ状態を確認" }, { label: "店舗分析", href: `/analytics/store?from=${input.from}&to=${input.to}&store=${scope}`, description: "店舗別の根拠を見る" }, { label: "キャスト分析", href: `/analytics/cast?from=${input.from}&to=${input.to}&store=${scope}`, description: "キャスト別の根拠を見る" }, { label: "推移", href: `/analytics/trend?from=${input.from}&to=${input.to}&store=${scope}`, description: "期間推移を見る" }, { label: "曜日分析", href: `/analytics/time?from=${input.from}&to=${input.to}&store=${scope}`, description: "曜日別効率を見る" }, { label: "目標管理", href: "/settings/goals", description: "目標を設定" }] };
}
