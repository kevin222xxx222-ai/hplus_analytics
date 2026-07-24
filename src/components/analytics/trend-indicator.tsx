import { trendPresentation } from "@/lib/analytics/ui";
import type { TrendDirection, UiAvailability, UiConfidence } from "@/lib/analytics/ui";
import { formatPercent } from "@/lib/analytics/ui";

export function TrendIndicator({ direction, difference, rate, baselineLabel, comparisonPeriod, positiveIsBetter, availability, confidence }: { direction: TrendDirection; difference?: string | number | null; rate?: number | null; baselineLabel?: string; comparisonPeriod?: string; positiveIsBetter?: boolean; availability?: UiAvailability; confidence?: UiConfidence }) {
  const item = trendPresentation[direction];
  const outcome = direction === "UNAVAILABLE" ? "比較不能" : direction === "FLAT" ? "横ばい" : direction === "INCREASE" ? (positiveIsBetter === false ? "増加（注意）" : "増加") : (positiveIsBetter === false ? "減少（改善）" : "減少");
  return <div className="flex flex-wrap items-center gap-2 text-sm" aria-label={`トレンド: ${outcome}`}><span aria-hidden="true" className="font-bold">{item.icon}</span><span className="font-semibold">{outcome}</span>{difference !== undefined && <span className="text-slate-600">差 {typeof difference === "number" ? difference.toLocaleString("ja-JP") : difference}</span>}{rate !== undefined && <span className="text-slate-600">{formatPercent(rate)}</span>}{baselineLabel && <span className="text-xs text-slate-500">基準: {baselineLabel}</span>}{comparisonPeriod && <span className="text-xs text-slate-500">{comparisonPeriod}</span>}{availability && <span className="text-xs text-slate-500">{availability}</span>}{confidence && <span className="text-xs text-slate-500">{confidence}</span>}</div>;
}
