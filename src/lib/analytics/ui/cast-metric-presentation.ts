import type { CastTrendMetricKey } from "@/lib/analytics/cast-trend/types";

export const CAST_METRIC_PRESENTATION: Record<CastTrendMetricKey, { label: string; unit: "円" | "件" | "日" | "時間" | "%" | "" }> = {
  femaleReward: { label: "女子報酬", unit: "円" }, hourlyReward: { label: "平均時給", unit: "円" }, contracts: { label: "成約数", unit: "件" }, attendanceDays: { label: "出勤日数", unit: "日" }, workingHours: { label: "稼働時間", unit: "時間" }, contractsPerDay: { label: "1日平均成約", unit: "件" }, contractsPerHour: { label: "1時間あたり成約", unit: "件" }, townPv: { label: "Town PV", unit: "" }, townUu: { label: "Town UU", unit: "" }, heavenPageAccess: { label: "Heavenアクセス", unit: "" }, heavenDiaryPosts: { label: "写メ日記投稿数", unit: "件" }, photoNominations: { label: "写真指名数", unit: "件" }, photoNominationShare: { label: "写真指名構成比", unit: "%" }, photoNominationsPerHour: { label: "1時間あたり写真指名", unit: "件" }, photoNominationsPer100Uu: { label: "100UUあたり写真指名", unit: "件" }, mainNominations: { label: "本指名数", unit: "件" }, mainNominationRate: { label: "本指名率", unit: "%" }, repeatCount: { label: "リピート数", unit: "件" }, repeatShare: { label: "リピート構成比", unit: "%" },
};

export const metricLabel = (key: string) => Object.hasOwn(CAST_METRIC_PRESENTATION, key) ? CAST_METRIC_PRESENTATION[key as CastTrendMetricKey].label : "未定義指標";
export const metricUnit = (key: string) => Object.hasOwn(CAST_METRIC_PRESENTATION, key) ? CAST_METRIC_PRESENTATION[key as CastTrendMetricKey].unit : "";
export const formatCastTrendValue = (key: string, value: number | null, suffix?: string) => {
  if (value === null || !Number.isFinite(value)) return "—";
  const unit = suffix ?? metricUnit(key);
  const presentationValue = unit === "%" ? value * 100 : value;
  const maximumFractionDigits = unit === "円" ? 1 : unit === "時間" || key.endsWith("PerHour") || key.endsWith("PerDay") ? 2 : unit === "%" ? 1 : 1;
  const formatted = presentationValue.toLocaleString("ja-JP", { maximumFractionDigits });
  return unit === "円" ? `${formatted}円` : `${formatted}${unit}`;
};

export const warningMessage = (code: string) => ({
  HEAVEN_DIARY_ALONE_NOT_PAGE_STATE: "写メ日記投稿数だけでは、ページ流入の状態を判断できません。",
  REPEAT_SAMPLE_LOW: "成約母数が少ないため、本指名・再来指標は参考値です。",
  PARTIAL_MONTH: "今月は途中実績のため、数値は暫定です。",
  MEDIA_DATA_MISSING: "媒体データが一部欠けているため、参考値を含みます。",
  BOOKING_TIME_NOT_AVAILABLE: "CTIでは実際の予約可能時間帯や空き時間を確認できません。",
  RESULT_METRICS_MIXED: "結果の補助指標が主指標と異なる状態です。主指標だけで判定を変更しません。",
}[code] ?? "追加確認が必要なデータがあります。");

export const uniqueWarningMessages = (codes: string[]) => [...new Set(codes)].map((code) => warningMessage(code));
