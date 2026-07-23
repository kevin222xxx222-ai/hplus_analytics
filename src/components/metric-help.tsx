import Link from "next/link";
import { metricDefinition } from "@/lib/analytics/metric-definitions";

export function MetricHelp({ metric, compact = false }: { metric: string; compact?: boolean }) {
  const definition = metricDefinition(metric);
  return <details id={`metric-help-${definition.key}`} className={`relative group ${compact ? "inline-block" : "mt-1"}`}><summary className="cursor-pointer list-none text-xs text-slate-500 underline decoration-dotted underline-offset-2">{compact ? "?" : "指標の意味"}</summary><div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg"><p className="font-semibold text-slate-900">{definition.label}</p><p className="mt-1"><strong>意味：</strong>{definition.meaning}</p>{definition.formula && <p className="mt-1"><strong>計算式：</strong><span className="font-mono">{definition.formula}</span></p>}<p className="mt-1"><strong>見るポイント：</strong>{definition.whatToSee}</p><p className="mt-1 text-amber-700"><strong>注意：</strong>{definition.caution}</p><Link href={`/help/metrics#${definition.key}`} className="mt-2 inline-block text-emerald-700 underline">詳細ガイドを見る</Link></div></details>;
}
