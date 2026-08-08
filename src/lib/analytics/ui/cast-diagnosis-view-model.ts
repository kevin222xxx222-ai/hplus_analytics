import type { CastDiagnosisEngineResult, CastEngineCast, CastDiagnosisType, CastReviewPriority } from "@/lib/analytics/cast-diagnosis/types";

export const diagnosisLabels: Record<CastDiagnosisType, string> = {
  STABLE_HIGH_EFFICIENCY: "安定高効率",
  LIMITED_BY_AVAILABILITY: "稼働量による収入差",
  LOW_PAGE_TRAFFIC: "ページ流入を確認",
  LOW_PROFILE_CONVERSION: "プロフィール転換を確認",
  LOW_REPEAT_CONVERSION: "再来状況を確認",
  LOW_NEW_CUSTOMER_ACQUISITION: "新規獲得を確認",
  OTHER_REVIEW: "追加確認",
  INSUFFICIENT_DATA: "データ不足",
};
export const priorityLabels: Record<CastReviewPriority, string> = { PRIORITY: "優先確認", REVIEW: "確認対象", WATCH: "経過観察", HEALTHY: "問題なし", INSUFFICIENT: "データ不足" };
export const targetLabels: Record<string, string> = { LISTING_PHOTO: "一覧写真", LISTING_COPY: "一覧コピー", MEDIA_EXPOSURE: "媒体露出", DIARY_POSTING: "写メ日記投稿", PROFILE_PHOTOS: "プロフィール写真", PROFILE_COPY: "キャッチコピー", PROFILE_TEXT: "プロフィール本文", DIARY_CONTENT: "写メ日記内容", REPEAT_STATUS: "本指名・リピート状況", STAFF_REVIEW: "接客後の再来状況を確認", CANCELLATIONS: "予約と成約・キャンセル状況", DATA_INTEGRITY: "成約・報酬・指名内訳を確認", NONE: "現在大きな確認対象はありません" };
export const otherReasonLabels: Record<string, string> = { HIGH_EFFICIENCY_LOW_SAMPLE: "高効率・母数は参考値", PHOTO_EFFICIENCY_GOOD_REPEAT_SAMPLE_LOW: "写真指名効率は良好・再来判定の母数不足", INTERMEDIATE_THRESHOLDS: "複数指標が境界値付近", LOW_HOURLY_REWARD_WITHOUT_CLEAR_BOTTLENECK: "時給差はあるが明確なボトルネック未特定", NO_EXPLICIT_DIAGNOSIS_MATCH: "明示診断条件には該当せず" };
export const insufficientReasonLabels: Record<string, string> = { ATTENDANCE_0_DAYS: "出勤0日", ATTENDANCE_1_DAY: "出勤1日", HOURS_BELOW_MINIMUM: "稼働時間不足", HOURLY_REWARD_UNCOMPUTABLE: "時給算出不可", INSUFFICIENT_COMPARISON_GROUP: "比較群不足", CTI_MAJOR_DATA_MISSING: "CTI主要値不足", OTHER: "その他" };

export function priorityForCast(cast: CastEngineCast | undefined): CastReviewPriority {
  if (!cast) return "INSUFFICIENT";
  if (!cast.isMainAttendanceCast || cast.diagnosis.primaryType === "INSUFFICIENT_DATA") return "INSUFFICIENT";
  if (cast.diagnosis.primaryType === "STABLE_HIGH_EFFICIENCY" || cast.diagnosis.primaryType === "LIMITED_BY_AVAILABILITY") return "HEALTHY";
  if (cast.confidence.overall.level === "LOW") return "WATCH";
  if (cast.priority === "PRIORITY") return "PRIORITY";
  if (cast.priority === "REVIEW") return "REVIEW";
  return "WATCH";
}

export function formatAvailability(value: number | null, availability: string, unit = "") {
  if (availability === "UNAVAILABLE") return "掲載対象外";
  if (availability === "UNCOMPUTABLE") return "算出不可";
  if (availability === "MISSING" || availability === "INSUFFICIENT_SAMPLE" || value === null || value === undefined) return "—";
  return `${typeof value === "number" ? value.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) : value}${unit}`;
}

/** Display-only precision policy. Calculation values remain untouched. */
export function formatCastMetricValue(metricKey: string, value: number | null, unit = "") {
  if (value === null || value === undefined) return "—";
  const key = metricKey.toLowerCase();
  const percent = unit === "%" || key.includes("rate") || key.includes("share") || key.includes("ratio");
  const decimals = percent ? 1 : key.includes("per100") ? 2 : key.includes("perday") || key.includes("perhour") || key.includes("hourly") || key.includes("workinghours") ? (key.includes("perhour") ? 2 : 1) : 0;
  return `${value.toLocaleString("ja-JP", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${unit}`;
}

export function formatCastMetric(metricKey: string, value: number | null, availability: string, unit = "") {
  if (availability === "UNAVAILABLE") return "掲載対象外";
  if (availability === "UNCOMPUTABLE") return "算出不可";
  if (availability === "MISSING" || availability === "INSUFFICIENT_SAMPLE" || value === null || value === undefined) return "—";
  return formatCastMetricValue(metricKey, value, unit);
}

export function diagnosisCastList(result: CastDiagnosisEngineResult, store: string, search: string) {
  return result.casts.filter((cast) => cast.isMainAttendanceCast).filter((cast) => store === "ALL" || cast.fact.storeIds.includes(store) || cast.fact.storeLabels.includes(store)).filter((cast) => !search || cast.fact.castName.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
}

export function countPriorities(casts: CastEngineCast[]) {
  return casts.filter((cast) => cast.isMainAttendanceCast).reduce<Record<CastReviewPriority, number>>((counts, cast) => { const key = priorityForCast(cast); counts[key] += 1; return counts; }, { PRIORITY: 0, REVIEW: 0, WATCH: 0, HEALTHY: 0, INSUFFICIENT: 0 });
}
