import { AvailabilityBadge } from "./availability-badge";
import { ConfidenceBadge } from "./confidence-badge";
import { GrowthPotentialBadge } from "./growth-potential-badge";
import type { GrowthPotential, UiAvailability, UiConfidence } from "@/lib/analytics/ui";

export function GrowthPotentialCard({ classification, reason, evidence = [], availability, confidence, score, actionable }: { classification: GrowthPotential; reason?: string | null; evidence?: string[]; availability?: UiAvailability; confidence?: UiConfidence; score?: number; actionable?: boolean }) {
  return <article className="panel min-w-0 p-4" aria-label="Growth Potential"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-800">成長余地</h3><GrowthPotentialBadge value={classification} /></div>{reason && <p className="mt-3 text-sm text-slate-700">{reason}</p>}<ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">{evidence.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul><div className="mt-3 flex flex-wrap gap-2">{availability && <AvailabilityBadge value={availability} />}{confidence && <ConfidenceBadge value={confidence} />}{typeof score === "number" && <span className="text-xs text-slate-500">スコア: {score}</span>}<span className="text-xs text-slate-500">提案: {actionable === false ? "不要／判定不可" : "確認可能"}</span></div></article>;
}
