import type { NextBestActionViewModel } from "@/lib/analytics/ui";
import { AvailabilityBadge } from "./availability-badge";
import { ConfidenceBadge } from "./confidence-badge";

export function NextBestActionCard({ result }: { result: NextBestActionViewModel }) {
  const isDataInsufficient = result.availability === "INSUFFICIENT_SAMPLE" || result.status === "DataInsufficient";
  const title = isDataInsufficient ? "データ不足で判定不可" : result.actionLevel === "REFERENCE" ? "参考提案" : result.actionLevel === "NONE" ? "提案なし" : "次に検討する一手";
  return <article className="panel min-w-0 p-4" aria-label="Next Best Action"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-800">{title}</h3>{result.availability && <AvailabilityBadge value={result.availability} />}</div>{!isDataInsufficient && result.cause && <div className="mt-3 grid gap-3 sm:grid-cols-3"><div><p className="text-xs font-bold text-slate-500">原因</p><p className="mt-1 text-sm">{result.cause}</p></div><div><p className="text-xs font-bold text-slate-500">根拠</p><ul className="mt-1 list-disc pl-4 text-sm text-slate-700">{(result.evidence ?? []).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div><div><p className="text-xs font-bold text-slate-500">提案</p><p className="mt-1 text-sm">{result.action || "提案なし"}</p></div></div>}{isDataInsufficient && <p className="mt-3 text-sm text-slate-600">必要な母数または入力データが揃っていないため、強い提案は表示しません。</p>}<div className="mt-3 flex flex-wrap gap-2">{result.confidence && <ConfidenceBadge value={result.confidence} />}{result.actionLevel === "REFERENCE" && <span className="text-xs text-amber-700">参考レベル</span>}</div></article>;
}
