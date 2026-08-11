"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { formatMetric } from "@/lib/analytics/ui";
import type { StoreDayDetailDto } from "@/lib/analytics/integration/store-day-detail";

type SortKey = "reward" | "contracts" | "nominations" | "nominationRate" | "attendanceHours" | "averageHourlyReward" | "contractsPerHour" | "name";
type DetailCast = Extract<StoreDayDetailDto, { available: true }>["casts"][number];
type Metric = { value: number | null; availability?: string };

const display = (metric: Metric | undefined, suffix = "") => metric?.value === null || metric?.value === undefined ? "—" : `${formatMetric(metric.value, "integer")}${suffix}`;
const currency = (metric: Metric | number | null | undefined) => { const value = typeof metric === "number" ? metric : metric?.value; return value === null || value === undefined ? "—" : formatMetric(value, "currency"); };
const formatCountMetric = (metric: Metric | undefined) => !metric || metric.availability === "MISSING" ? "—" : `${formatMetric(metric.value ?? 0, "integer")}本`;
const formatDiaryMetric = (metric: Metric | undefined) => !metric || metric.availability === "MISSING" ? "—" : metric.availability === "UNAVAILABLE" ? "掲載対象外" : `${formatMetric(metric.value ?? 0, "integer")}件`;
const sortValue = (cast: DetailCast, key: SortKey): number | null => { if (key === "name") return null; const value = cast[key]; return typeof value === "number" ? value : value && typeof value === "object" && "value" in value ? value.value : null; };

function BreakdownMetric({ metric }: { metric: Metric | undefined }) {
  return <div className="flex items-center gap-2"><span>{formatCountMetric(metric)}</span>{metric?.availability === "PARTIAL" ? <span className="text-[10px] font-normal text-amber-700">一部欠測</span> : null}</div>;
}

export function StoreDayDetailDrawer({ date, store, onClose, onNavigate }: { date: string | null; store: string; onClose: () => void; onNavigate: (date: string) => void }) {
  const [data, setData] = useState<StoreDayDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("reward");
  const [castStore, setCastStore] = useState(store);
  const scrollTopRef = useRef(0);
  const bodyStyleRef = useRef<{ position: string; top: string; width: string; overflow: string } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isOpen = Boolean(date);

  useEffect(() => {
    if (!isOpen) return;
    scrollTopRef.current = window.scrollY;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = document.body;
    bodyStyleRef.current = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    body.style.position = "fixed"; body.style.top = `-${scrollTopRef.current}px`; body.style.width = "100%"; body.style.overflow = "hidden";
    return () => {
      const saved = bodyStyleRef.current;
      if (saved) { body.style.position = saved.position; body.style.top = saved.top; body.style.width = saved.width; body.style.overflow = saved.overflow; }
      window.requestAnimationFrame(() => { window.scrollTo(0, scrollTopRef.current); returnFocusRef.current?.focus({ preventScroll: true }); });
    };
  }, [isOpen]);
  useEffect(() => { (document.querySelector('[role="dialog"][aria-label="店舗日次詳細"] main') as HTMLElement | null)?.scrollTo({ top: 0, behavior: "auto" }); }, [date]);
  // Loading/error state is synchronized with the external day-detail request.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!date) return; let cancelled = false; setLoading(true); setError(null); setData(null); fetch(`/api/analytics/store/day-detail?date=${date}&store=${castStore}`).then(async (response) => { if (!response.ok) throw new Error("日次詳細の取得に失敗しました。"); return response.json() as Promise<StoreDayDetailDto>; }).then((value) => { if (!cancelled) setData(value); }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "日次詳細の取得に失敗しました。"); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [date, castStore]);
  useEffect(() => { if (!date) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", onKeyDown); return () => document.removeEventListener("keydown", onKeyDown); }, [date, onClose]);

  const sortedCasts = useMemo(() => { if (!data?.available) return []; return [...data.casts].sort((a, b) => { if (sort === "name") return a.name.localeCompare(b.name, "ja"); const av = sortValue(a, sort); const bv = sortValue(b, sort); if (av === null && bv === null) return a.name.localeCompare(b.name, "ja"); if (av === null) return 1; if (bv === null) return -1; return bv - av || (b.contracts.value ?? -1) - (a.contracts.value ?? -1) || (b.nominations.value ?? -1) - (a.nominations.value ?? -1) || a.name.localeCompare(b.name, "ja"); }); }, [data, sort]);
  if (!date) return null;
  const dateLabel = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00+09:00`));
  const storeLabel = store === "ALL" ? "全体" : store === "KASUKABE" ? "春日部" : store === "KOSHIGAYA" ? "越谷" : "野田";
  const panel = (title: string, metric: Metric | undefined) => <article className="panel p-3"><p className="text-xs text-slate-500">{title}</p><p className="mt-1 text-lg font-bold text-slate-900"><BreakdownMetric metric={metric} /></p></article>;

  return typeof document === "undefined" ? null : createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-6" role="dialog" aria-modal="true" aria-label="店舗日次詳細">
      <button type="button" className="absolute inset-0 bg-slate-900/35" aria-label="閉じる" onClick={onClose} />
      <aside className="relative flex h-full w-full flex-col overflow-hidden bg-slate-50 shadow-2xl md:h-[92vh] md:w-[90vw] md:max-w-[1600px] md:rounded-2xl">
        <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 md:px-6"><div><p className="text-xs font-semibold tracking-wide text-emerald-700">店舗日次詳細</p><h2 className="text-xl font-bold text-slate-900">{dateLabel}</h2><p className="text-xs text-slate-500">対象範囲：{storeLabel}{data?.available && data.featureLabels.length ? ` / ${data.featureLabels.join("・")}` : ""}</p></div><div className="flex items-center gap-2"><button type="button" className="secondary-button" onClick={() => { const previous = new Date(`${date}T00:00:00Z`); previous.setUTCDate(previous.getUTCDate() - 1); onNavigate(previous.toISOString().slice(0, 10)); }}>前日へ</button><button type="button" className="secondary-button" onClick={() => { const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); const value = next.toISOString().slice(0, 10); if (value <= new Date().toISOString().slice(0, 10)) onNavigate(value); }}>翌日へ</button><button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>×</button></div></header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">{loading ? <div className="space-y-4" aria-live="polite"><div className="h-24 animate-pulse rounded-2xl bg-slate-200" /><div className="h-64 animate-pulse rounded-2xl bg-slate-200" /><p className="text-sm text-slate-500">日次詳細を読み込んでいます…</p></div> : error ? <div className="panel p-6"><p className="text-sm text-red-700">{error}</p></div> : data && !data.available ? <div className="panel p-8 text-center"><p className="text-sm text-slate-600">{data.reason}</p></div> : data?.available ? <div className="space-y-5">
          <section><h3 className="mb-3 text-lg font-semibold">当日サマリー</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{[["売上", currency(data.summary.sales)], ["成約本数", display(data.summary.contracts, "本")], ["女子報酬", currency(data.summary.femaleReward)], ["本指名数", display(data.summary.nominationCount, "本")], ["本指名率", data.summary.nominationRate.value === null ? "—" : `${(data.summary.nominationRate.value * 100).toFixed(1)}%`], ["出勤人数", display(data.summary.attendanceCount, "人")], ["出勤時間", display(data.summary.workingHours, "時間")], ["Town PV", display(data.summary.townPv)], ["Town UU", display(data.summary.townUu)], ["Heavenアクセス", display(data.summary.heavenAccess)]].map(([title, result]) => <article className="panel p-3" key={title}><p className="text-xs text-slate-500">{title}</p><p className="mt-1 text-lg font-bold text-slate-900">{result}</p></article>)}</div></section>
          <section><h3 className="mb-3 text-lg font-semibold">店舗別内訳</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{data.storeBreakdown.map((item) => <article className="panel p-4" key={item.storeCode}><h4 className="font-semibold">{item.storeCode === "KASUKABE" ? "春日部" : item.storeCode === "KOSHIGAYA" ? "越谷" : item.storeCode === "NODA" ? "野田" : "全体"}</h4><p className="mt-2 text-sm">売上 {currency(item.sales)}</p><p className="text-sm">成約本数 {display(item.contracts, "本")}</p><p className="text-sm">本指名数 {display(item.nominations, "本")}</p><p className="text-sm">出勤 {display(item.attendancePeople, "人")}</p><p className="text-sm">出勤時間 {display(item.attendanceHours, "時間")}</p></article>)}</div></section>
          <section><h3 className="mb-3 text-lg font-semibold">成約構成</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{panel("本指名", data.contractBreakdown.nominationCount)}{panel("写真指名", data.contractBreakdown.photoNominationCount)}{panel("フリー", data.contractBreakdown.freeCount)}{panel("新規", data.contractBreakdown.newCount)}{panel("リピート", data.contractBreakdown.repeatCount)}{panel("キャンセル", data.contractBreakdown.cancelCount)}</div>{data.contractBreakdownConsistency.isConsistent === false ? <p className="mt-2 text-xs text-amber-700">成約本数と指名区分合計に差があります</p> : null}</section>
          <section><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">出勤キャスト</h3><p className="text-xs text-slate-500">事実内訳のみを表示します。評価・順位付けは行いません。</p></div><div className="flex items-center gap-2"><label className="text-xs text-slate-500" htmlFor="day-detail-store">店舗</label><select id="day-detail-store" className="compact-input" value={castStore} onChange={(event) => setCastStore(event.target.value)}><option value="ALL">全体</option><option value="KASUKABE">春日部</option><option value="KOSHIGAYA">越谷</option><option value="NODA">野田</option></select><label className="text-xs text-slate-500" htmlFor="day-detail-sort">並び順</label><select id="day-detail-sort" className="compact-input" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}><option value="reward">女子報酬</option><option value="contracts">成約本数</option><option value="nominations">本指名数</option><option value="nominationRate">本指名率</option><option value="attendanceHours">出勤時間</option><option value="averageHourlyReward">平均時給</option><option value="contractsPerHour">1時間あたり成約</option><option value="name">キャスト名</option></select></div></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{sortedCasts.map((cast) => <article className="panel min-w-0 p-4" key={cast.castId}><h4 className="font-semibold text-slate-900">{cast.name}</h4><p className="text-xs text-slate-500">{cast.storeCode === "KASUKABE" ? "春日部" : cast.storeCode === "KOSHIGAYA" ? "越谷" : cast.storeCode === "NODA" ? "野田" : "全体"}</p><dl className="mt-3 space-y-1 text-sm"><div className="flex justify-between gap-2"><dt>女子報酬</dt><dd className="font-semibold">{currency(cast.reward)}</dd></div><div className="flex justify-between gap-2"><dt>成約本数</dt><dd>{display(cast.contracts, "本")}</dd></div><div className="flex justify-between gap-2"><dt>本指名数</dt><dd>{display(cast.nominations, "本")}</dd></div><div className="flex justify-between gap-2"><dt>写真指名数</dt><dd>{formatCountMetric(cast.photoNominations)}</dd></div><div className="flex justify-between gap-2"><dt>フリー数</dt><dd>{formatCountMetric(cast.free)}</dd></div><div className="flex justify-between gap-2"><dt>新規数</dt><dd>{formatCountMetric(cast.newCount)}</dd></div><div className="flex justify-between gap-2"><dt>リピート数</dt><dd>{formatCountMetric(cast.repeat)}</dd></div><div className="flex justify-between gap-2"><dt>本指名率</dt><dd>{cast.nominationRate.value === null ? "—" : `${(cast.nominationRate.value * 100).toFixed(1)}%`}</dd></div><div className="flex justify-between gap-2"><dt>出勤時間</dt><dd>{display(cast.attendanceHours, "時間")}</dd></div><div className="flex justify-between gap-2"><dt>平均時給</dt><dd>{currency(cast.averageHourlyReward)}</dd></div><div className="flex justify-between gap-2"><dt>写メ日記</dt><dd>{formatDiaryMetric(cast.photoDiaryCount)}</dd></div></dl><Link className="mt-3 inline-block text-xs text-emerald-700 underline" href={`/analytics/cast?castId=${cast.castId}&from=${date}&to=${date}`}>キャスト分析を見る</Link></article>)}</div>{!sortedCasts.length ? <div className="panel p-6 text-center text-sm text-slate-500">この日に確認できる出勤キャスト実績はありません。</div> : null}</section>
          <section><h3 className="text-lg font-semibold">媒体データ</h3><p className="mt-2 text-sm text-slate-600">Town PV {display(data.media.townPv)} / UU {display(data.media.townUu)} / Heavenアクセス {display(data.media.heavenAccess)}</p></section>
        </div> : null}</main>
      </aside>
    </div>, document.body);
}
