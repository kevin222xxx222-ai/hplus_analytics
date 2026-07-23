import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";

const scenarios = [
  ["月目標に届かなそう", "/", "現在売上・達成率・着地予測・必要売上/日", "着地予測が目標を下回るなら、不足見込みと残り日数を確認します。", "/analytics/casts/discovery", "単純ペース予測であり、曜日補正や施策効果を含みません。"],
  ["出勤人数が不足", "/", "出勤日数・出勤時間・平均稼働キャスト", "出勤機会の不足候補を確認し、出勤増加候補へ進みます。", "/analytics/casts/discovery?tab=attendance", "候補は本人の出勤可能性を確認してから検討します。"],
  ["売上効率が高いキャストを探す", "/analytics/casts/discovery", "売上/出勤日・売上/出勤時間・LOW_SAMPLE", "中央値・上位25%と比較し、効率の高いキャストと根拠を確認します。", "/analytics/casts/overview", "出勤1日は値が不安定です。"],
  ["出勤が多いのに売上が弱い", "/analytics/casts/discovery?tab=buried", "売上/出勤日・PV/出勤日・予約・成約", "埋もれ候補のタイプと根拠指標を確認します。", "/analytics/marketing-lab", "原因を断定せず、プロフィール・導線・接客を追加確認します。"],
  ["日記を投稿しているのにPVが弱い", "/analytics/marketing-lab", "DIARY_POSTS・Town PV・Heaven PAGE_ACCESS", "活動量と露出の傾向を並べ、日記活動改善候補を確認します。", "/analytics/heaven/casts", "投稿とPV、予約・成約は顧客単位で直接対応しません。"],
  ["媒体未掲載・データ不足", "/analytics/casts/discovery?tab=all", "状態タグ・掲載状態・データ有無", "0ではなく—で表示される媒体範囲と状態タグを先に確認します。", "/analytics/navigator", "データ不足を改善候補や成約率の分母に混ぜません。"],
] as const;

export default async function AnalyticsGuidePage() {
  await requireUser();
  return <><PageHeader eyebrow="ANALYTICS GUIDE" title="分析の使い方" description="目的別の確認シナリオです。まず全体、次に効率と根拠、最後に施策仮説の順で確認します。"/><div className="panel mb-6 p-5"><h2 className="font-semibold text-slate-900">基本ルール</h2><p className="mt-2 text-sm leading-6 text-slate-700">分母0・未掲載・未取得は「—」。LOW_SAMPLEは単独判断しません。Town・Heavenの閲覧とCTI予約・成約は顧客単位で直接対応せず、相関や効率は参考値です。</p></div><div className="grid gap-4">{scenarios.map(([title, first, metrics, judgement, next, caution], i) => <article className="panel p-5" key={title}><h2 className="font-semibold text-slate-900">シナリオ{i + 1}：{title}</h2><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[9rem_1fr]"><dt className="text-slate-500">最初に見るページ</dt><dd><Link href={first} className="text-emerald-700 underline">{first}</Link></dd><dt className="text-slate-500">確認指標</dt><dd>{metrics}</dd><dt className="text-slate-500">判断例</dt><dd>{judgement}</dd><dt className="text-slate-500">次に進むページ</dt><dd><Link href={next} className="text-emerald-700 underline">{next}</Link></dd><dt className="text-slate-500">注意事項</dt><dd className="text-amber-700">{caution}</dd></dl></article>)}</div><Link href="/analytics/navigator" className="mt-6 inline-block text-emerald-700 underline">分析ナビゲーターへ</Link></>;
}
