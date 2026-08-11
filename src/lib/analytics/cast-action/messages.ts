import type { ActionStageState, CastActionType } from "./types";

export const CAST_ACTION_VERSION = "cast-action-v1";
export const CAST_ACTION_LABELS: Record<CastActionType, string> = {
  MAINTAIN_CURRENT: "現状維持", REVIEW_PAGE_TRAFFIC: "ページ流入を確認", REVIEW_PROFILE_CONVERSION: "プロフィール転換を確認", REVIEW_REPEAT_CONVERSION: "本指名・再来への移行を確認", REVIEW_BOOKING_EFFICIENCY: "予約枠・出勤配置を確認", MONITOR_BORDERLINE: "境界指標を経過観察", WAIT_FOR_MORE_DATA: "実績の蓄積を待つ", MANUAL_REVIEW: "スタッフによる追加確認",
};
export const ACTION_STAGE_LABELS: Record<ActionStageState, string> = { GOOD: "◎ 良好", ADEQUATE: "○ 同水準", BORDERLINE: "△ 境界", LOW: "△ 差を確認", REFERENCE_ONLY: "※ 参考値", INSUFFICIENT: "データ不足" };
export const ACTION_RULE_LABELS: Record<string, string> = { RULE_0_INSUFFICIENT: "診断対象外・母数不足", RULE_1_RESULT_GOOD: "結果良好", RULE_2_PAGE_TRAFFIC: "ページ流入", RULE_3_PROFILE_CONVERSION: "プロフィール転換", RULE_4_REPEAT_CONVERSION: "再来転換", RULE_5_BOOKING_EFFICIENCY: "予約枠・出勤配置", RULE_6_BORDERLINE: "境界帯", RULE_7_PARTIAL_REFERENCE: "部分的な参考値", RULE_8_COMPLEX_OR_CONTRADICTORY: "矛盾・未分類" };
