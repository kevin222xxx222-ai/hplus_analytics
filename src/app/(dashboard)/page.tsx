import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { MetricHelp } from "@/components/metric-help";
import { DailyBrief } from "@/components/daily-brief";
import { DashboardChartCard, DashboardCumulativeSalesChart, DashboardDailySalesAttendanceChart } from "@/components/dashboard-chart-card";
import { getDailyBrief } from "@/lib/analytics/integration/daily-brief";
import { requireUser } from "@/lib/auth";
import { formatDateOnly, parseDateOnly } from "@/lib/date";

type Query = { period?: string; from?: string; to?: string; scope?: string };

function selectedRange(query: Query) {
  const today = new Date();
  const currentEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  const previousEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  const end = query.period === "previous" ? previousEnd : currentEnd;
  const from = query.period === "custom" && query.from
    ? parseDateOnly(query.from)
    : query.period === "3m"
      ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 2, 1))
      : query.period === "6m"
        ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 5, 1))
        : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const to = query.period === "custom" && query.to ? parseDateOnly(query.to) : end;
  return { fromText: formatDateOnly(from), toText: formatDateOnly(to) };
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireUser();
  const query = await searchParams;
  const range = selectedRange(query);
  const scope = query.scope === "KASUKABE" || query.scope === "KOSHIGAYA" || query.scope === "NODA" ? query.scope : "ALL";
  const brief = await getDailyBrief({ from: range.fromText, to: range.toText, scope });
  const daily = brief.trend?.daily ?? [];
  return <>
    <PageHeader eyebrow="MARKETING MANAGEMENT OS" title="店舗運営・マーケティング司令塔" description="全体状況と目標差を確認し、今日の確認事項から詳細分析へ進む画面です。" />
    <div className="mb-4 flex flex-wrap gap-3 text-sm"><Link href="/analytics/navigator" className="text-emerald-700 underline">分析ナビゲーター</Link><Link href="/help/analytics-guide" className="text-emerald-700 underline">分析ガイド</Link><MetricHelp metric="sales" /></div>
    <form className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4" method="get"><label className="form-label">期間<select name="period" defaultValue={query.period ?? "current"} className="form-input mt-1"><option value="current">当月</option><option value="previous">前月</option><option value="3m">過去3か月</option><option value="6m">過去6か月</option><option value="custom">任意期間</option></select></label><label className="form-label">店舗<select name="scope" defaultValue={scope} className="form-input mt-1"><option value="ALL">全体</option><option value="KASUKABE">春日部</option><option value="KOSHIGAYA">越谷</option><option value="NODA">野田（CTI補助）</option></select></label><div className="self-end text-sm text-slate-500">{range.fromText}〜{range.toText}</div><button className="primary-button" type="submit">表示</button></form>
    <DailyBrief brief={brief} />
    <section aria-labelledby="home-trend-title" className="mb-6"><h2 id="home-trend-title" className="sr-only">簡易トレンド</h2><div className="grid min-w-0 gap-6 xl:grid-cols-2"><DashboardChartCard title="累積売上・着地見込み" metric="sales" description="Daily Briefと同じ統合DTOの日別売上を表示します。" note="未来日の実績は補完しません。着地見込みが利用できない場合は表示しません。"><DashboardCumulativeSalesChart points={daily} /></DashboardChartCard><DashboardChartCard title="日別売上・出勤人数" metric="sales" description="売上と出勤人数を同じ期間で確認します。因果関係は示しません。" note="同日に複数店舗へ出勤したキャストは1名として扱います。"><DashboardDailySalesAttendanceChart points={daily} /></DashboardChartCard></div></section>
    <p className="text-xs text-slate-500">詳細な店舗・キャスト・媒体分析は、Daily Briefのリンク先で確認してください。データ状態・信頼度・比較条件を維持したまま遷移します。</p>
  </>;
}
