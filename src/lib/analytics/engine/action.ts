import type { GrowthResult, NextBestAction, SampleSummary } from "./types";

export function nextBestAction(growth: GrowthResult, sample: SampleSummary): NextBestAction {
  if (growth.classification === "Data不足") return { classification: growth.classification, cause: "分析に必要な母数が不足", evidence: growth.evidence, action: null, recommendationLevel: "NONE", confidence: sample.confidence, status: "DataInsufficient" };
  const actions: Record<Exclude<GrowthResult["classification"], "Data不足"> , string> = {
    "Exposure不足": "掲載内容・更新頻度・露出機会を確認",
    "Activity不足": "出勤日数・出勤時間の確保を検討",
    "Efficiency改善余地": "成果と分母を確認し、接客・プロフィール改善を検討",
    "Schedule制約": "アクセス増加より出勤時間・日数の拡大余地を確認",
    "Capacity上限": "追加露出よりCapacityとシフト上限を確認",
    "安定維持": "現状の強い指標を維持し、変化を定期確認",
  };
  const level = sample.confidence === "Low" ? "REFERENCE" : growth.classification === "安定維持" ? "NONE" : "ACTION";
  return { classification: growth.classification, cause: growth.evidence[0] ?? "比較基準との差を確認", evidence: growth.evidence, action: level === "NONE" ? null : actions[growth.classification], recommendationLevel: level, confidence: sample.confidence, status: growth.status };
}
