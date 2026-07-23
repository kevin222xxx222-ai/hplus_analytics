"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const guides: Array<[string, string, string, string, string]> = [
  ["/data-health", "取込状態・未反映影響・日付カバレッジを監視する画面", "健全性状態と未確定Batch", "/", "HOMEへ戻る"],
  ["/analytics/casts/discovery", "強み・伸びしろ・改善候補をキャスト単位で探す画面", "判定基準と状態タグ", "/analytics/marketing-lab", "マーケティングLAB"],
  ["/analytics/marketing-lab", "活動と成果の関連傾向から施策仮説を探す画面", "HIGH/LOW分類とTOP10", "/analytics/casts/discovery", "CAST DISCOVERY"],
  ["/analytics/casts/overview", "1人ごとのCTI・Town・Heavenを横断比較する画面", "媒体別の存在・効率指標", "/analytics/casts/discovery", "CAST DISCOVERY"],
  ["/analytics/navigator", "目的別に分析画面を選び、指標の意味と次の確認先を整理する画面", "目的に近いカード", "/", "HOME"],
  ["/analytics/heaven/store", "Heaven店舗指標の期間推移を確認する画面", "DAILY_EVENTとSNAPSHOT", "/analytics/heaven/casts", "Heaven女子分析"],
  ["/analytics/heaven/casts", "Heaven女子の媒体活動と掲載状態を見る画面", "指標別の期間値と増減", "/analytics/casts/overview", "キャスト統合分析"],
  ["/analytics/town/stores", "Town店舗の掲載・閲覧・TELを確認する画面", "PV・UU・TELの対象範囲", "/analytics/town/casts", "タウン女子分析"],
  ["/analytics/town/casts", "Town女子の露出とTEL傾向を確認する画面", "PV・UU・TEL率", "/analytics/casts/discovery", "CAST DISCOVERY"],
  ["/settings/goals", "月次目標を設定し、HOMEの進捗へ反映する画面", "対象月・対象範囲・達成率", "/", "HOME"],
];

export function AnalyticsPageGuide() {
  const pathname = usePathname(); const match = guides.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!match && pathname !== "/") return null;
  const [,, first, next, nextLabel] = match ?? ["/", "全体状況と目標差を確認する画面", "目標差と媒体対象範囲", "/analytics/navigator", "分析ナビゲーター"];
  const description = match?.[1] ?? "全体状況と目標差を確認する画面";
  return <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"><span className="font-semibold">この画面で分かること：</span>{description}<span className="mx-2 text-emerald-400">|</span><span className="text-emerald-900">最初に：{first}</span><span className="mx-2 text-emerald-400">|</span><Link href={next} className="font-medium text-emerald-800 underline">次に見る：{nextLabel}</Link><span className="mx-2 text-emerald-400">|</span><Link href="/data-health" className="text-emerald-800 underline">DATA HEALTH</Link><span className="mx-2 text-emerald-400">|</span><Link href="/analytics/navigator" className="text-emerald-800 underline">ナビゲーター</Link><span className="mx-2 text-emerald-400">|</span><Link href="/help/metrics" className="text-emerald-800 underline">指標ガイド</Link></div>;
}
