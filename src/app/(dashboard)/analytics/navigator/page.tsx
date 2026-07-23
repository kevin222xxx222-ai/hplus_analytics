import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";

const cards = [
  ["DATA HEALTH", "未確定Batch・未反映影響・日付カバレッジを確認", "/data-health"],
  ["ホーム", "全体の売上・目標・健康状態", "/"],
  ["キャスト発見", "効率、伸びしろ、ボトルネック", "/analytics/casts/discovery"],
  ["マーケティングLAB", "仮説と施策候補の検証", "/analytics/marketing-lab"],
  ["キャスト統合分析", "CTI・Town・Heavenを1行で比較", "/analytics/casts/overview"],
  ["Town分析", "掲載・閲覧・TELの動き", "/analytics/town/casts"],
  ["Heaven分析", "店舗・女子の媒体指標", "/analytics/heaven/store"],
  ["目標管理", "月次目標と変更履歴", "/settings/goals"],
  ["指標ガイド", "定義・式・注意点", "/help/metrics"],
];

export default async function NavigatorPage() {
  await requireUser();
  return <><PageHeader eyebrow="ANALYTICS NAVIGATOR" title="分析ナビゲーター" description="目的から分析画面を選び、全体の状況から詳細へドリルダウンします。"/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([title, desc, href]) => <Link key={href} href={href} className="panel p-5 transition hover:-translate-y-0.5 hover:border-emerald-300"><p className="font-semibold text-slate-900">{title}</p><p className="mt-2 text-sm text-slate-500">{desc}</p><span className="mt-4 inline-block text-sm font-medium text-emerald-700">開く →</span></Link>)}</div><div className="panel mt-6 p-5 text-sm text-slate-600"><p className="font-semibold text-slate-900">見る順番の目安</p><p className="mt-2">①ホームで全体と目標 ②キャスト発見で効率・課題 ③マーケティングLABで施策仮説 ④各媒体の詳細で根拠を確認。</p></div></>;
}
