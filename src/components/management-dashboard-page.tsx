import Link from "next/link";
import type { DashboardMetric, ManagementDashboardDto, StoreOverviewCardDto } from "@/lib/analytics/integration/management-dashboard";
import { ManagementDashboardCharts } from "./management-dashboard-charts";

const number = (value: number | null, digits = 0) => value === null ? "—" : value.toLocaleString("ja-JP", { maximumFractionDigits: digits });
const yen = (value: number | null) => value === null ? "—" : `¥${number(value)}`;
const availability: Record<string, string> = { VALUE: "利用可能", ZERO: "0件", MISSING: "データ不足", UNAVAILABLE: "対象外", UNCOMPUTABLE: "算出不能", INSUFFICIENT_SAMPLE: "サンプル不足" };
function Metric({ metric, unit = "count" }: { metric: DashboardMetric; unit?: "yen" | "hours" | "percent" | "count" }) {
  const value = unit === "yen" ? yen(metric.value) : unit === "hours" ? `${number(metric.value, 1)}時間` : unit === "percent" ? `${number(metric.value === null ? null : metric.value * 100, 1)}%` : number(metric.value);
  return <span className="whitespace-nowrap">{value}{metric.value === null && <small className="ml-1 text-xs text-slate-500">{availability[metric.availability] ?? "データ状態"}</small>}</span>;
}
function Comparison({ metric, unit = "count" }: { metric: DashboardMetric; unit?: "yen" | "hours" | "percent" | "count" }) {
  const comparison = metric.previousMonthSamePeriod;
  if (!comparison || comparison.differenceRate === null || comparison.differenceRate === undefined) return <span className="text-xs text-slate-500">データ不足</span>;
  const color = comparison.direction === "increase" ? "text-emerald-700" : comparison.direction === "decrease" ? "text-red-700" : "text-slate-600";
  if (unit === "percent" && comparison.pointDifference !== null && comparison.pointDifference !== undefined) return <span className={`text-xs ${color}`}>{(comparison.pointDifference * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1, signDisplay: "always" })}pt</span>;
  const rate = `${(comparison.differenceRate * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1, signDisplay: "always" })}%`;
  return <span className={`text-xs ${color}`}>{rate}</span>;
}
function TrendBadge({ state }: { state: string }) { const label = state === "improving" ? "上昇" : state === "declining" ? "低下" : state === "stable" ? "横ばい" : "データ不足"; const className = state === "improving" ? "bg-emerald-50 text-emerald-700" : state === "declining" ? "bg-red-50 text-red-700" : state === "stable" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-800"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{label}</span>; }
function StoreOverview({ item, composition }: { item: StoreOverviewCardDto; composition: ManagementDashboardDto["storeComposition"][number] | undefined }) {
  const { store, state } = item;
  const isKas = store.storeCode === "KASUKABE";
  const isTown = isKas || store.storeCode === "KOSHIGAYA";
  const rows: Array<[string, DashboardMetric, "yen" | "hours" | "percent" | "count"]> = [
    ["売上", store.volume.sales, "yen"],
    ["売上構成比", composition?.salesShare ?? store.volume.sales, "percent"],
    ["成約数", store.volume.contracts, "count"],
    ["予約数", store.volume.reservations, "count"],
  ];
  if (composition?.contractShare) rows.splice(3, 0, ["成約構成比", composition.contractShare, "percent"]);
  if (isKas) rows.push(["1日平均出勤人数", store.sample.averageDailyAttendance, "count"], ["延べ出勤人数", store.volume.attendanceCount, "count"], ["出勤時間", store.volume.workHours, "hours"]);
  if (isTown) rows.push(["Town PV", store.media.townPv, "count"], ["Town UU", store.media.townUu, "count"]);
  if (isKas) rows.push(["Heaven PAGE_ACCESS", store.media.heavenAccess, "count"], ["Heaven DIARY_POSTS", store.media.heavenDiaryPosts, "count"]);
  rows.push(["本指名数", store.volume.nominationCount, "count"], ["本指名率", store.efficiency.nominationRate, "percent"]);
  return <article className="panel min-w-0 p-4" aria-labelledby={`store-overview-${store.storeId}`}>
    <header className="flex items-center justify-between gap-3"><div><h3 id={`store-overview-${store.storeId}`} className="font-semibold">{store.storeName}</h3><p className="text-xs text-slate-500">比較基準：{item.comparisonLabel}</p></div><TrendBadge state={state.overallTrendState} /></header>
    <p className="mt-2 text-xs text-slate-500">データ状態：{state.dataState === "available" ? "利用可能" : state.dataState === "partial" ? "一部欠測" : state.dataState === "unavailable" ? "未取得" : "対象外"}</p>
    <div className="mt-3 grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-x-3"><span className="hidden text-slate-600 sm:block">指標</span><span className="hidden text-right text-xs text-slate-500 sm:block">当月</span><span className="hidden text-right text-xs text-slate-500 sm:block">前月同期間比</span>{rows.map(([label, metric, unit]) => <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 sm:contents" key={label}><span>{label}</span><strong className="text-right"><Metric metric={metric} unit={unit} /></strong><span className="text-right"><Comparison metric={metric} unit={unit} /></span></div>)}</div>
    {item.notes.map((note) => <p className="mt-3 text-xs text-slate-500" key={note}>{note}</p>)}
    {store.dataHealth.status !== "正常" && <p className="mt-2 text-xs text-amber-700">データ状態：{store.dataHealth.status}</p>}
    <nav className="mt-3 flex flex-wrap gap-3">{Object.entries({ 店舗分析: store.detailUrls.store, 推移分析: store.detailUrls.trend, DATA_HEALTH: store.detailUrls.dataHealth }).map(([label, href]) => <Link className="text-sm text-emerald-700 underline" href={href} key={href}>{label}</Link>)}</nav>
  </article>;
}

export function ManagementDashboardPage({ data }: { data: ManagementDashboardDto }) {
  const summaryCards: Array<[string, DashboardMetric, "yen" | "hours" | "percent" | "count"]> = [["店舗売上", data.summary.sales, "yen"], ["成約数", data.summary.contractCount, "count"], ["予約数", data.summary.reservationCount, "count"], ["延べ出勤人数", data.summary.attendanceCountTotal, "count"], ["出勤時間", data.summary.workingHours, "hours"], ["本指名率", data.summary.nominationRate, "percent"]];
  return <div className="mx-auto max-w-[1500px] space-y-6">
    <header className="space-y-2"><p className="eyebrow">MANAGEMENT DASHBOARD</p><h1 className="text-2xl font-semibold">店舗ダッシュボード</h1><p className="muted">店舗別の実績と、売上・成約・稼働・集客・媒体活動の変化を同じ営業日軸で確認します。</p><p className="text-xs text-slate-500">対象営業月：{data.context.businessMonth} / 全店舗 / 最新反映日：{data.context.latestReflectedDate ?? "—"}</p></header>
    <section className={`rounded-xl border p-4 text-sm ${data.dataHealth.status === "要対応" ? "border-red-200 bg-red-50" : data.dataHealth.status === "注意" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><strong>データ状態：{data.dataHealth.status}</strong><span className="ml-3">未確定 {data.dataHealth.pending}件 / FAILED {data.dataHealth.failed}件 / OPENエラー {data.dataHealth.openErrors}件</span><Link className="ml-3 underline" href={data.dataHealth.detailUrl}>DATA HEALTHを確認</Link></section>
    <section aria-labelledby="management-summary"><h2 id="management-summary" className="mb-3 text-lg font-semibold">全店舗サマリー</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{summaryCards.map(([label, metric, unit]) => <article className="panel p-4" key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold"><Metric metric={metric} unit={unit} /></p><p className="mt-1 text-xs text-slate-500">前月同期間比：<Comparison metric={metric} unit={unit} /></p></article>)}</div><p className="mt-2 text-xs text-slate-500">延べ出勤人数は各営業日の出勤人数合計、期間内ユニーク出勤者は{number(data.summary.uniqueCastCount.value)}名です。</p></section>
    <section aria-labelledby="store-overview-title"><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 id="store-overview-title" className="text-lg font-semibold">店舗概要</h2><p className="text-sm text-slate-500">店舗状態と店舗実績を統合しています。状態・比較は前月同期間比です。</p></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.storeOverview.map((item) => <StoreOverview item={item} composition={data.storeComposition.find((composition) => composition.storeId === item.store.storeId)} key={item.store.storeId} />)}</div></section>
    <ManagementDashboardCharts storyCards={data.storyCards} />
    <section aria-labelledby="business-constraint-title" className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 id="business-constraint-title" className="font-semibold text-amber-900">業務データ制約</h2><p className="mt-1 text-sm text-amber-900">越谷・野田は勤務時間が春日部側に記録されるケースがあるため、店舗別の稼働分析を主要表示していません。これはImport Errorではなく、正式な業務データ範囲に基づく非表示です。</p></section>
    <p className="text-xs text-slate-500">HeavenのMITENEはPAGE_ACCESSとの活動比較として表示しています。OKINI_TALK_SENTは正式な入力指標が現行DTOに存在しないため、空グラフを生成せず未接続として扱います。媒体間の因果関係は断定していません。</p>
    <section aria-labelledby="nav-title"><h2 id="nav-title" className="mb-3 text-lg font-semibold">詳細分析へ進む</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{data.navigation.map((link) => <Link className="panel p-4 text-sm hover:border-emerald-300" href={link.href} key={link.href}><span className="font-semibold text-emerald-700">{link.label}</span><span className="mt-1 block text-xs text-slate-500">{link.description}</span></Link>)}</div></section>
    <p className="text-xs text-slate-500">{data.notes.join(" ")}</p>
  </div>;
}
