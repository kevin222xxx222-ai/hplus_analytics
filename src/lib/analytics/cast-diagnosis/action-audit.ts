import type { CastEngineCast, CastMetricComparison } from "./types";

export type ActionStageState = "GOOD" | "ADEQUATE" | "BORDERLINE" | "LOW" | "REFERENCE_ONLY" | "INSUFFICIENT";
export type CastActionType = "MAINTAIN_CURRENT" | "REVIEW_PAGE_TRAFFIC" | "REVIEW_PROFILE_CONVERSION" | "REVIEW_REPEAT_CONVERSION" | "REVIEW_BOOKING_EFFICIENCY" | "MONITOR_BORDERLINE" | "WAIT_FOR_MORE_DATA" | "MANUAL_REVIEW";
export type ActionPriority = "HIGH" | "MEDIUM" | "LOW" | "NONE";
export type ActionStageStates = { result: ActionStageState; pageTraffic: ActionStageState; photoConversion: ActionStageState; repeatConversion: ActionStageState };
export type CastActionAuditCandidate = {
  castId: string; castName: string; storeLabels: string[];
  currentDiagnosis: { primaryType: string; confidence: string };
  stageStates: ActionStageStates;
  proposedAction: { type: CastActionType; priority: ActionPriority; title: string; conclusion: string };
  keepItems: Array<{ key: string; label: string; reason: string; evidenceMetricKeys: string[] }>;
  reviewItems: Array<{ key: string; label: string; reason: string; evidenceMetricKeys: string[]; humanJudgmentRequired: boolean }>;
  avoidItems: Array<{ key: string; label: string; reason: string }>;
  nextMonthFocus: Array<{ metricKey: string; direction: "MAINTAIN" | "IMPROVE" | "MONITOR"; reason: string }>;
  appliedRule: string; confidence: string; warnings: string[];
};

const ACTION_LABELS: Record<CastActionType, string> = {
  MAINTAIN_CURRENT: "現状維持", REVIEW_PAGE_TRAFFIC: "ページ流入を確認", REVIEW_PROFILE_CONVERSION: "プロフィール転換を確認", REVIEW_REPEAT_CONVERSION: "本指名・再来への移行を確認", REVIEW_BOOKING_EFFICIENCY: "予約枠・出勤配置を確認", MONITOR_BORDERLINE: "境界指標を経過観察", WAIT_FOR_MORE_DATA: "実績の蓄積を待つ", MANUAL_REVIEW: "スタッフによる追加確認",
};

const comparison = (cast: CastEngineCast, key: string) => cast.comparisons.find((item) => item.metricKey === key);
const stateFromComparison = (item: CastMetricComparison | undefined, thresholds?: { adequate: number; borderline: number }): ActionStageState => {
  if (!item || item.peerMedianMetric.availability === "MISSING" || item.peerMedianMetric.availability === "UNAVAILABLE" || item.peerMedianMetric.availability === "UNCOMPUTABLE" || item.relativeRatio === null) return "INSUFFICIENT";
  if (item.diagnosticUsage === "REFERENCE_ONLY") return "REFERENCE_ONLY";
  if (item.relativeRatio >= 1) return "GOOD";
  const adequate = thresholds?.adequate ?? 0.8; const borderline = thresholds?.borderline ?? 0.6;
  if (thresholds ? item.relativeRatio >= adequate : item.status === "COMPARABLE" || item.relativeRatio >= adequate) return "ADEQUATE";
  if (thresholds ? item.relativeRatio >= borderline : item.status === "INTERMEDIATE" || item.relativeRatio >= borderline) return "BORDERLINE";
  return "LOW";
};

export function deriveActionStageStates(cast: CastEngineCast, thresholds?: { adequate: number; borderline: number }): ActionStageStates {
  const repeat = comparison(cast, "mainNominationRate");
  const repeatState = (cast.fact.contracts.value ?? 0) < 10 || repeat?.diagnosticUsage === "REFERENCE_ONLY" ? (repeat?.peerMedianMetric.availability === "UNAVAILABLE" || repeat?.peerMedianMetric.availability === "MISSING" ? "INSUFFICIENT" : "REFERENCE_ONLY") : stateFromComparison(repeat);
  const photo = comparison(cast, "photoNominationsPer100Uu");
  const photoState = cast.fact.townUu.value !== null && cast.fact.townUu.value < 100 ? "REFERENCE_ONLY" : stateFromComparison(photo, thresholds);
  return { result: stateFromComparison(comparison(cast, "hourlyReward"), thresholds), pageTraffic: stateFromComparison(comparison(cast, "townUu"), thresholds), photoConversion: photoState, repeatConversion: repeatState };
}

const stageGood = (state: ActionStageState) => state === "GOOD" || state === "ADEQUATE";
const action = (type: CastActionType, priority: ActionPriority, conclusion: string) => ({ type, priority, title: ACTION_LABELS[type], conclusion });

export function buildActionAuditCandidate(cast: CastEngineCast, thresholds?: { adequate: number; borderline: number }): CastActionAuditCandidate {
  const stageStates = deriveActionStageStates(cast, thresholds); const { result, pageTraffic, photoConversion, repeatConversion } = stageStates; const warnings: string[] = [];
  const keepItems: CastActionAuditCandidate["keepItems"] = []; const reviewItems: CastActionAuditCandidate["reviewItems"] = []; const avoidItems: CastActionAuditCandidate["avoidItems"] = []; const nextMonthFocus: CastActionAuditCandidate["nextMonthFocus"] = [];
  if (stageGood(pageTraffic)) { keepItems.push({ key: "PAGE_TRAFFIC", label: "媒体流入", reason: "比較基準以上のため、現在の媒体露出を維持します。", evidenceMetricKeys: ["townUu", "townPv"] }); nextMonthFocus.push({ metricKey: "townUu", direction: "MAINTAIN", reason: "媒体流入を維持" }); }
  if (stageGood(photoConversion)) { keepItems.push({ key: "PHOTO_CONVERSION", label: "写真指名転換", reason: "写真指名効率は比較基準以上のため、現状運用を維持します。", evidenceMetricKeys: ["photoNominationsPer100Uu", "photoNominationsPerHour"] }); nextMonthFocus.push({ metricKey: "photoNominationsPer100Uu", direction: "MAINTAIN", reason: "写真指名効率を維持" }); }
  if (stageGood(repeatConversion)) { keepItems.push({ key: "REPEAT_CONVERSION", label: "本指名・再来", reason: "本指名・再来指標は比較基準以上のため、大幅変更を避けます。", evidenceMetricKeys: ["mainNominationRate", "repeatShare"] }); nextMonthFocus.push({ metricKey: "mainNominationRate", direction: "MAINTAIN", reason: "本指名率を維持" }); }
  if (result === "LOW" || result === "BORDERLINE") nextMonthFocus.push({ metricKey: "hourlyReward", direction: "IMPROVE", reason: "結果指標に比較差があるため確認" });
  if (repeatConversion === "LOW") { reviewItems.push({ key: "REPEAT_STATUS", label: "本指名・リピート状況", reason: "写真指名転換に対して本指名・再来に比較差があります。接客評価は断定せず、現場情報を確認します。", evidenceMetricKeys: ["mainNominationRate", "repeatShare", "repeatCount"], humanJudgmentRequired: true }); nextMonthFocus.push({ metricKey: "mainNominationRate", direction: "IMPROVE", reason: "本指名率を確認" }, { metricKey: "repeatShare", direction: "IMPROVE", reason: "リピート構成比を確認" }); }
  if (pageTraffic === "LOW") reviewItems.push({ key: "PAGE_TRAFFIC", label: "ページ流入", reason: "Town UUに比較差があります。掲載・露出の確認が必要です。", evidenceMetricKeys: ["townUu", "townPv"], humanJudgmentRequired: true });
  if (photoConversion === "LOW") reviewItems.push({ key: "PROFILE_CONVERSION", label: "プロフィール転換", reason: "流入に対する写真指名効率に比較差があります。原因は断定せず確認します。", evidenceMetricKeys: ["photoNominationsPer100Uu", "photoNominationsPerHour"], humanJudgmentRequired: true });
  if (result === "LOW" || result === "BORDERLINE") avoidItems.push({ key: "NO_AUTOMATIC_TARGET", label: "自動目標設定", reason: "出勤時間や売上の具体目標は自動設定しません。" });
  if (pageTraffic === "LOW" && photoConversion === "LOW") warnings.push("流入と転換の両方に差があるため、流入確認を優先し転換原因を断定しません。");
  if (repeatConversion === "REFERENCE_ONLY") warnings.push("本指名・再来は成約母数不足の参考値です。");
  let proposed = action("MANUAL_REVIEW", "MEDIUM", "複数指標をスタッフが確認してください。"); let appliedRule = "RULE_8_COMPLEX_OR_CONTRADICTORY";
  if (cast.diagnosis.primaryType === "INSUFFICIENT_DATA") { proposed = action("WAIT_FOR_MORE_DATA", "LOW", "診断母数または比較対象が不足しているため、実績の蓄積を待ちます。"); appliedRule = "RULE_7_INSUFFICIENT"; }
  else if (result === "GOOD" || result === "ADEQUATE") { proposed = action("MAINTAIN_CURRENT", result === "GOOD" ? "NONE" : "LOW", "結果指標は大きな改善対象ではありません。現状を維持します。"); appliedRule = "RULE_1_RESULT_GOOD"; }
  else if (pageTraffic === "LOW") { proposed = action("REVIEW_PAGE_TRAFFIC", "HIGH", "ページ流入の確認を優先します。見られていない段階で転換原因は断定しません。"); appliedRule = "RULE_2_PAGE_TRAFFIC"; }
  else if (stageGood(pageTraffic) && photoConversion === "LOW") { proposed = action("REVIEW_PROFILE_CONVERSION", "HIGH", "流入は確保されているため、プロフィール転換の確認を優先します。"); appliedRule = "RULE_3_PROFILE_CONVERSION"; }
  else if (stageGood(pageTraffic) && stageGood(photoConversion) && repeatConversion === "LOW") { proposed = action("REVIEW_REPEAT_CONVERSION", "HIGH", "本指名・再来への移行を確認します。接客の良し悪しは断定しません。"); appliedRule = "RULE_4_REPEAT_CONVERSION"; }
  else if ((result === "LOW" || result === "BORDERLINE") && stageGood(pageTraffic) && stageGood(photoConversion) && stageGood(repeatConversion)) { proposed = action("REVIEW_BOOKING_EFFICIENCY", "MEDIUM", "予約枠・出勤配置をスタッフが確認します。CTIだけでは空き時間を断定できません。"); appliedRule = "RULE_5_BOOKING_EFFICIENCY"; warnings.push("出勤開始・終了時刻や空き時間はCTIで取得できないため、スタッフ確認が必要です。"); }
  else if ([result, pageTraffic, photoConversion, repeatConversion].filter((state) => state === "BORDERLINE").length >= 2 && ![result, pageTraffic, photoConversion, repeatConversion].includes("LOW")) { proposed = action("MONITOR_BORDERLINE", "MEDIUM", "境界指標の推移を確認し、大幅変更せず経過観察します。"); appliedRule = "RULE_6_BORDERLINE"; }
  else if ([result, pageTraffic, photoConversion, repeatConversion].some((state) => state === "INSUFFICIENT")) { proposed = action("WAIT_FOR_MORE_DATA", "LOW", "母数または比較対象が不足しているため、実績の蓄積を待ちます。"); appliedRule = "RULE_7_INSUFFICIENT"; }
  return { castId: cast.fact.castId, castName: cast.fact.castName, storeLabels: cast.fact.storeLabels, currentDiagnosis: { primaryType: cast.diagnosis.primaryType, confidence: cast.confidence.overall.level }, stageStates, proposedAction: proposed, keepItems, reviewItems, avoidItems, nextMonthFocus, appliedRule, confidence: cast.confidence.overall.level, warnings };
}

export const actionTypeLabels = ACTION_LABELS;
