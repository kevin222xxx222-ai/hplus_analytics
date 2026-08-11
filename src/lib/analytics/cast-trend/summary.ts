import { actionFocusFor } from "./action-focus";
import { type CastMonthlyTrendPoint, type CastTrendDirection, type CastTrendMetricKey, type CastTrendResult } from "./types";
import { CAST_METRIC_PRESENTATION, metricLabel, warningMessage } from "@/lib/analytics/ui/cast-metric-presentation";

export type TrendSummaryAvailability = "VALUE" | "PARTIAL" | "INSUFFICIENT";
export type TrendSummaryStatus = "RISING" | "FLAT" | "FALLING" | "VOLATILE" | "INSUFFICIENT_DATA";
export type PublicCastTrendSummaryMetric = {
  key: CastTrendMetricKey;
  label: string;
  unit: "円" | "件" | "日" | "時間" | "%" | "";
  current: { month: string; value: number | null; availability: CastMonthlyTrendPoint["metrics"][CastTrendMetricKey]["availability"]; status: "CONFIRMED" | "PROVISIONAL" | "UNAVAILABLE" };
  currentMonth: { month: string; value: number | null; availability: CastMonthlyTrendPoint["metrics"][CastTrendMetricKey]["availability"]; status: "COMPLETE" | "PARTIAL" };
  latestConfirmed: { month: string | null; value: number | null; availability: CastMonthlyTrendPoint["metrics"][CastTrendMetricKey]["availability"] | null };
  displayValueSource: "CURRENT_MONTH" | "LATEST_CONFIRMED" | "NONE";
  previousComparison: CastMonthlyTrendPoint["previous"][CastTrendMetricKey];
  rollingThreeMonth: CastMonthlyTrendPoint["rolling3"][CastTrendMetricKey];
  direction: { value: CastTrendDirection; label: string };
  directionDescription: string;
  displayValue: number | null;
  rollingThreeMonthDifference: { value: number | null; kind: "POINT" | "PERCENT" };
  extrema: CastMonthlyTrendPoint["extrema"][CastTrendMetricKey];
  focusDirection: "IMPROVE" | "MAINTAIN" | "MONITOR";
  reason: string;
  warnings: string[];
};
export type PublicCastTrendSummary = {
  period: { fromMonth: string; toMonth: string; monthCount: number; completeMonthCount: number; includesPartialMonth: boolean };
  overallMessage: { title: string; description: string; availability: TrendSummaryAvailability };
  focusReason: { actionType: string | null; actionLabel: string; description: string };
  metrics: PublicCastTrendSummaryMetric[];
  availableMonthCount: number;
  warnings: Array<{ code: string; label: string }>;
  detailUrl: string;
  managerComment: { title: string; body: string; actionPreserved: true };
};

const labels: Record<CastTrendDirection, string> = { RISING: "↗ 上昇", FLAT: "→ 横ばい", FALLING: "↘ 下降", VOLATILE: "↕ 変動大", INSUFFICIENT_DATA: "— 判断できません" };
const directionDescriptions: Record<CastTrendDirection, string> = { RISING: "改善傾向", FLAT: "横ばい", FALLING: "下降傾向", VOLATILE: "月ごとの差が大きい", INSUFFICIENT_DATA: "有効な月数が不足しており判断できません" };
const rateKeys = new Set<CastTrendMetricKey>(["photoNominationShare", "mainNominationRate", "repeatShare"]);
const units = Object.fromEntries(Object.entries(CAST_METRIC_PRESENTATION).map(([key, value]) => [key, value.unit])) as Record<CastTrendMetricKey, PublicCastTrendSummaryMetric["unit"]>;
const actionLabels: Record<string, string> = { REVIEW_REPEAT_CONVERSION: "本指名・再来を確認", REVIEW_PAGE_TRAFFIC: "ページ流入を確認", REVIEW_PROFILE_CONVERSION: "プロフィール転換を確認", REVIEW_BOOKING_EFFICIENCY: "予約効率を確認", MAINTAIN_CURRENT: "現在の実績を維持", WAIT_FOR_MORE_DATA: "データを蓄積", MANUAL_REVIEW: "個別に確認", MONITOR_BORDERLINE: "境界値の推移を確認" };
const unavailable = new Set(["MISSING", "UNAVAILABLE", "UNCOMPUTABLE"]);
const summaryFocusFor = (actionType: string | null) => {
  const base = actionFocusFor(actionType);
  const overrides: Record<string, { primaryMetricKeys: CastTrendMetricKey[]; maintainMetricKeys: CastTrendMetricKey[]; monitorMetricKeys: CastTrendMetricKey[] }> = {
    REVIEW_PAGE_TRAFFIC: { primaryMetricKeys: ["townUu", "townPv", "heavenPageAccess", "hourlyReward"], maintainMetricKeys: ["photoNominationsPer100Uu"], monitorMetricKeys: ["contracts"] },
    REVIEW_PROFILE_CONVERSION: { primaryMetricKeys: ["photoNominationsPer100Uu", "photoNominationsPerHour", "photoNominations"], maintainMetricKeys: ["townUu", "townPv"], monitorMetricKeys: ["contracts"] },
    REVIEW_BOOKING_EFFICIENCY: { primaryMetricKeys: ["hourlyReward", "contractsPerHour", "contractsPerDay", "mainNominationRate"], maintainMetricKeys: ["workingHours"], monitorMetricKeys: ["contracts"] },
    WAIT_FOR_MORE_DATA: { primaryMetricKeys: ["attendanceDays", "workingHours", "contracts", "hourlyReward"], maintainMetricKeys: [], monitorMetricKeys: [] },
    MANUAL_REVIEW: { primaryMetricKeys: [], maintainMetricKeys: [], monitorMetricKeys: ["hourlyReward", "townUu", "mainNominationRate"] },
    MONITOR_BORDERLINE: { primaryMetricKeys: [], maintainMetricKeys: [], monitorMetricKeys: ["hourlyReward", "townUu", "mainNominationRate"] },
  };
  return { ...base, ...(overrides[actionType ?? ""] ?? {}) };
};

const hasUsableMetric = (point: CastMonthlyTrendPoint) => Object.values(point.metrics).some((metric) => metric.value !== null && !unavailable.has(metric.availability));
const trimLeadingUnavailable = (months: CastMonthlyTrendPoint[]) => { const first = months.findIndex(hasUsableMetric); return first < 0 ? [] : months.slice(first); };
const confirmedValue = (months: CastMonthlyTrendPoint[], key: CastTrendMetricKey) => [...months].reverse().find((point) => point.status === "COMPLETE" && ["VALUE", "ZERO"].includes(point.metrics[key].availability) && point.metrics[key].value !== null);
const reasonFor = (direction: CastTrendDirection, focus: "IMPROVE" | "MAINTAIN" | "MONITOR") => focus === "IMPROVE" ? "改善方針に関係する指標の推移を確認します。" : focus === "MAINTAIN" ? "現在の実績を維持できているか確認します。" : direction === "INSUFFICIENT_DATA" ? "確定した傾向を判断できる月数がありません。" : "変動を確認します。";
const managerCommentFor = (actionType: string | null, metrics: PublicCastTrendSummaryMetric[], availability: TrendSummaryAvailability) => {
  const primary = metrics[0];
  if (!primary || availability === "INSUFFICIENT" || primary.direction.value === "INSUFFICIENT_DATA") return { title: "店長コメント", body: "有効な月数が不足しているため、現在は判断を保留します。", actionPreserved: true as const };
  const label = primary.label;
  if (actionType === "MAINTAIN_CURRENT") return { title: "店長コメント", body: `${label}の推移を確認しながら、現在の改善方針を維持してください。`, actionPreserved: true as const };
  if (actionType === "REVIEW_BOOKING_EFFICIENCY") return { title: "店長コメント", body: `予約効率に関係する${label}を継続確認してください。現在の方針は変更しません。`, actionPreserved: true as const };
  if (actionType === "REVIEW_REPEAT_CONVERSION") return { title: "店長コメント", body: `${label}は${primary.directionDescription}です。現在の改善方針を維持し、次の確定実績でも推移を確認してください。`, actionPreserved: true as const };
  if (actionType === "WAIT_FOR_MORE_DATA") return { title: "店長コメント", body: "実績が蓄積するまで、現在の方針を変更せず次月も確認してください。", actionPreserved: true as const };
  return { title: "店長コメント", body: `${label}は${primary.directionDescription}です。現在の方針を維持し、次の確定実績で継続確認してください。`, actionPreserved: true as const };
};

export function buildPublicCastTrendSummary(input: { trend: CastTrendResult; actionType?: string | null; castId: string }): PublicCastTrendSummary {
  const months = trimLeadingUnavailable(input.trend.months);
  const latest = months.at(-1);
  const actionFocus = summaryFocusFor(input.actionType ?? input.trend.actionFocus.actionType);
  const ordered = [...actionFocus.primaryMetricKeys, ...actionFocus.maintainMetricKeys, ...actionFocus.monitorMetricKeys];
  const keys = ordered.filter((key, index, all) => all.indexOf(key) === index).filter((key) => latest && latest.metrics[key].availability !== "UNAVAILABLE").slice(0, 4);
  const metrics = keys.map((key): PublicCastTrendSummaryMetric => {
    const summary = latest ? { latest: latest.metrics[key], previous: latest.previous[key], rolling3: latest.rolling3[key], direction: latest.direction[key], extrema: latest.extrema[key], record: latest.records[key] } : input.trend.summaries[key];
    const confirmed = latest ? confirmedValue(months.slice(0, -1), key) : undefined;
    const displayValueSource = summary.latest.availability === "VALUE" || summary.latest.availability === "ZERO" ? "CURRENT_MONTH" : latest?.status === "PARTIAL" && summary.latest.availability === "MISSING" && confirmed ? "LATEST_CONFIRMED" : "NONE";
    const currentDisplayStatus = latest?.status === "PARTIAL" ? "PROVISIONAL" : latest?.metrics[key].availability === "UNAVAILABLE" ? "UNAVAILABLE" : "CONFIRMED";
    const focusDirection = actionFocus.primaryMetricKeys.includes(key) ? "IMPROVE" : actionFocus.maintainMetricKeys.includes(key) ? "MAINTAIN" : "MONITOR";
    const displayValue = displayValueSource === "LATEST_CONFIRMED" ? confirmed?.metrics[key].value ?? null : summary.latest.value;
    const averageValue = summary.rolling3.value;
    const rollingThreeMonthDifference = displayValue === null || averageValue === null ? null : rateKeys.has(key) ? (displayValue - averageValue) * 100 : averageValue === 0 ? null : ((displayValue - averageValue) / Math.abs(averageValue)) * 100;
    const warningCodes = latest?.status === "PARTIAL" ? ["PARTIAL_MONTH"] : [];
    return { key, label: metricLabel(key), unit: units[key], current: { month: latest?.month ?? input.trend.period.to.slice(0, 7), value: summary.latest.value, availability: summary.latest.availability, status: currentDisplayStatus }, currentMonth: { month: latest?.month ?? input.trend.period.to.slice(0, 7), value: summary.latest.value, availability: summary.latest.availability, status: latest?.status ?? "COMPLETE" }, latestConfirmed: { month: confirmed?.month ?? null, value: confirmed?.metrics[key].value ?? null, availability: confirmed?.metrics[key].availability ?? null }, displayValueSource, displayValue, rollingThreeMonthDifference: { value: rollingThreeMonthDifference, kind: rateKeys.has(key) ? "POINT" : "PERCENT" }, previousComparison: summary.previous, rollingThreeMonth: summary.rolling3, direction: { value: summary.direction, label: labels[summary.direction] }, directionDescription: directionDescriptions[summary.direction], extrema: summary.extrema, focusDirection, reason: reasonFor(summary.direction, focusDirection), warnings: warningCodes.map(warningMessage) };
  });
  const completeMonthCount = months.filter((month) => month.status === "COMPLETE").length;
  const includesPartialMonth = months.some((month) => month.status === "PARTIAL");
  const availability: TrendSummaryAvailability = !months.length || completeMonthCount === 0 ? "INSUFFICIENT" : includesPartialMonth ? "PARTIAL" : "VALUE";
  const hasCurrentMissing = Boolean(latest?.status === "PARTIAL" && latest && Object.values(latest.metrics).some((metric) => metric.availability === "VALUE" || metric.availability === "ZERO") === false);
  const hasConfirmed = months.slice(0, -1).some((month) => Object.values(month.metrics).some((metric) => ["VALUE", "ZERO"].includes(metric.availability)));
  const overallMessage = availability === "INSUFFICIENT" ? { title: "推移を確認できません", description: "有効な確定月が不足しているため、推移を判断できません。", availability } : hasCurrentMissing && hasConfirmed ? { title: "直近の実績推移", description: "今月はまだ実績がありません。最新の確定実績を表示しています。", availability } : availability === "PARTIAL" ? { title: "直近の実績推移", description: "今月は暫定値を含みます。確定した傾向は完了月で確認してください。", availability } : { title: "直近の実績推移", description: "選択月までの月次実績から、改善・維持・変動の傾向を確認します。", availability };
  return { period: { fromMonth: months[0]?.month ?? input.trend.period.from.slice(0, 7), toMonth: months.at(-1)?.month ?? input.trend.period.to.slice(0, 7), monthCount: months.length, completeMonthCount, includesPartialMonth }, overallMessage, focusReason: { actionType: input.actionType ?? null, actionLabel: actionLabels[input.actionType ?? ""] ?? "主要な実績推移を確認", description: actionFocus.reason }, metrics, availableMonthCount: months.length, warnings: input.trend.warnings, detailUrl: `/analytics/cast/${encodeURIComponent(input.castId)}/trend?from=${months[0]?.month ?? input.trend.period.from.slice(0, 7)}-01&to=${input.trend.period.to}`, managerComment: managerCommentFor(input.actionType ?? null, metrics, availability) };
}
