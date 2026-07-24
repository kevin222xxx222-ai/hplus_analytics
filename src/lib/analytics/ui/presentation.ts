import type { GrowthPotential, TrendDirection, UiAvailability, UiConfidence } from "./types";

export const availabilityPresentation: Record<UiAvailability, { label: string; description: string; tone: string; icon: string }> = {
  VALUE: { label: "利用可能", description: "分析に利用できる値です。", tone: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: "✓" },
  ZERO: { label: "実績0", description: "取得できた実績が0件です。", tone: "text-slate-700 bg-slate-100 border-slate-200", icon: "0" },
  MISSING: { label: "データ未取得", description: "対象データが取得されていません。", tone: "text-amber-800 bg-amber-50 border-amber-200", icon: "!" },
  UNCOMPUTABLE: { label: "算出不能", description: "必要な分母などがなく算出できません。", tone: "text-amber-800 bg-amber-50 border-amber-200", icon: "—" },
  UNAVAILABLE: { label: "未対応", description: "入力元または機能が未接続です。", tone: "text-slate-600 bg-slate-100 border-slate-200", icon: "×" },
  INSUFFICIENT_SAMPLE: { label: "母数不足", description: "判定に必要な実績件数が不足しています。", tone: "text-orange-800 bg-orange-50 border-orange-200", icon: "n" },
};

export const confidencePresentation: Record<UiConfidence, { label: string; description: string; tone: string }> = {
  High: { label: "信頼度 高", description: "十分なサンプルに基づく結果です。", tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  Medium: { label: "信頼度 中", description: "一定のサンプルに基づく参考結果です。", tone: "text-blue-700 bg-blue-50 border-blue-200" },
  Low: { label: "参考値", description: "母数が少ないため断定せず参考値として扱います。", tone: "text-amber-800 bg-amber-50 border-amber-200" },
  Insufficient: { label: "判定不可", description: "判定に必要な母数が不足しています。", tone: "text-slate-600 bg-slate-100 border-slate-200" },
};

export const growthPresentation: Record<GrowthPotential, { label: string; description: string; actionable: boolean; tone: string }> = {
  "Data不足": { label: "データ不足", description: "必要な母数または入力が不足しています。", actionable: false, tone: "text-slate-700 bg-slate-100 border-slate-200" },
  "Capacity上限": { label: "Capacity上限", description: "受入可能枠や稼働が上限に近い状態です。", actionable: true, tone: "text-purple-800 bg-purple-50 border-purple-200" },
  "Schedule制約": { label: "Schedule制約", description: "高効率でも出勤条件が制約になっている可能性があります。", actionable: true, tone: "text-indigo-800 bg-indigo-50 border-indigo-200" },
  "Exposure不足": { label: "露出不足", description: "活動や効率を比較でき、露出が基準を下回っています。", actionable: true, tone: "text-blue-800 bg-blue-50 border-blue-200" },
  "Activity不足": { label: "活動不足", description: "出勤・更新などの活動量が基準を下回っています。", actionable: true, tone: "text-cyan-800 bg-cyan-50 border-cyan-200" },
  "Efficiency改善余地": { label: "効率改善余地", description: "サンプルと活動量があり、効率に改善余地があります。", actionable: true, tone: "text-orange-800 bg-orange-50 border-orange-200" },
  "安定維持": { label: "安定維持", description: "重大な不足や制約は確認されていません。", actionable: false, tone: "text-emerald-800 bg-emerald-50 border-emerald-200" },
};

export const trendPresentation: Record<TrendDirection, { label: string; icon: string }> = {
  INCREASE: { label: "増加", icon: "↑" }, DECREASE: { label: "減少", icon: "↓" }, FLAT: { label: "横ばい", icon: "→" }, UNAVAILABLE: { label: "比較不能", icon: "—" },
};
