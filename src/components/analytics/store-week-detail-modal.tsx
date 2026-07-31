"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Metric } from "@/lib/analytics/integration/store-week-detail";
import { formatMetric, formatSignedPercent } from "@/lib/analytics/ui";

type WeekDto = Awaited<
  ReturnType<
    typeof import("@/lib/analytics/integration/store-week-detail").getStoreWeekDetail
  >
>;

const formatValue = (
  metric: Metric | undefined,
  kind: "integer" | "currency" | "hours" = "integer",
) =>
  metric?.value === null || metric?.value === undefined
    ? "—"
    : formatMetric(metric.value, kind);

const formatCount = (metric: Metric | undefined) =>
  metric?.value === null || metric?.value === undefined
    ? "—"
    : `${formatMetric(metric.value, "integer")}本`;

const formatPercent = (metric: Metric | undefined) =>
  metric?.value === null || metric?.value === undefined
    ? "—"
    : formatMetric(metric.value * 100, "percent");

const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : formatMetric(value, "integer");

const formatDiary = (metric: Metric | undefined) =>
  metric?.availability === "UNAVAILABLE"
    ? "掲載対象外"
    : metric?.value === null || metric?.value === undefined
    ? "—"
    : `${formatMetric(metric.value, "integer")}件`;

const toJapaneseDate = (value: string) =>
  value.replace(
    /^(\d{4})-(\d{2})-(\d{2})$/,
    (_, year, month, day) => `${year}年${Number(month)}月${Number(day)}日`,
  );

const weekLabel = (from: string, to: string) =>
  `${toJapaneseDate(from)}〜${toJapaneseDate(to)}`;

const scopeLabel = (scope: string) =>
  ({ ALL: "全体", KASUKABE: "春日部", KOSHIGAYA: "越谷", NODA: "野田" } as Record<
    string,
    string
  >)[scope] ?? scope;

type Props = {
  week: string | null;
  store: string;
  onClose: () => void;
  onNavigate: (week: string) => void;
  onOpenDay: (day: string) => void;
};

export function StoreWeekDetailModal({
  week,
  store,
  onClose,
  onNavigate,
  onOpenDay,
}: Props) {
  const [data, setData] = useState<WeekDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(store);
  const [sort, setSort] = useState("reward");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const open = Boolean(week);
  const showLoading = loading || (open && !data && !error);

  useEffect(() => {
    if (!week) return;
    let cancelled = false;
    // Request state is intentionally reset when the external week query changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/analytics/store/week-detail?week=${week}&store=${filter}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("週次詳細の取得に失敗しました。");
        return (await response.json()) as WeekDto;
      })
      .then((value) => {
        if (!cancelled) {
          setData(value);
          setError(null);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setLoading(false);
          setError(
            reason instanceof Error
              ? reason.message
              : "週次詳細の取得に失敗しました。",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [week, filter]);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const scrollY = window.scrollY;
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open || !openerRef.current) return;
    const opener = openerRef.current;
    openerRef.current = null;
    window.requestAnimationFrame(() => opener.focus());
  }, [open]);

  const casts = useMemo(() => {
    if (!data?.casts) return [];
    return [...data.casts].sort((a, b) => {
      if (sort === "contracts") {
        return (b.contracts.value ?? -1) - (a.contracts.value ?? -1);
      }
      if (sort === "nominations") {
        return (b.nominations.value ?? -1) - (a.nominations.value ?? -1);
      }
      return (b.reward.value ?? -1) - (a.reward.value ?? -1);
    });
  }, [data, sort]);

  if (!week || typeof document === "undefined") return null;

  const previousWeek = new Date(`${week}T00:00:00Z`);
  previousWeek.setUTCDate(previousWeek.getUTCDate() - 7);
  const nextWeek = new Date(`${week}T00:00:00Z`);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const next = nextWeek.toISOString().slice(0, 10);

  const summaryItems: Array<[string, string]> = data
    ? [
        ["売上", formatValue(data.summary.sales, "currency")],
        ["成約", formatCount(data.summary.contracts)],
        ["女子報酬", formatValue(data.summary.femaleReward, "currency")],
        ["本指名", formatCount(data.summary.nominationCount)],
        ["本指名率", formatPercent(data.summary.nominationRate)],
        ["出勤延べ人数", formatValue(data.summary.attendanceCount)],
        ["実出勤キャスト数", formatValue(data.summary.uniqueAttendanceCount)],
        ["出勤時間", formatValue(data.summary.workingHours, "hours")],
        ["Town PV", formatValue(data.summary.townPv)],
        ["Town UU", formatValue(data.summary.townUu)],
        ["Heavenアクセス", formatValue(data.summary.heavenAccess)],
      ]
    : [];
  const averageItems: Array<[string, string]> = data
    ? [
        ["売上", formatValue(data.averages.salesPerValidDay, "currency")],
        ["成約", formatCount(data.averages.contractsPerValidDay)],
        ["女子報酬", formatValue(data.averages.rewardPerValidDay, "currency")],
        ["出勤時間", formatValue(data.averages.workingHoursPerValidDay, "hours")],
        ["Town PV", formatValue(data.averages.townPvPerValidDay)],
        ["Town UU", formatValue(data.averages.townUuPerValidDay)],
        ["Heaven", formatValue(data.averages.heavenPerValidDay)],
      ]
    : [];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="店舗週次詳細"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/35"
        aria-label="閉じる"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full flex-col overflow-hidden bg-slate-50 shadow-2xl md:h-[92vh] md:w-[90vw] md:max-w-[1600px] md:rounded-2xl">
        <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 md:px-6">
          <div>
            <p className="text-xs font-semibold tracking-wide text-emerald-700">店舗週次詳細</p>
            <h2 className="text-xl font-bold text-slate-900">{data ? weekLabel(data.weekStart, data.weekEnd) : week}</h2>
            <p className="text-xs text-slate-500">{scopeLabel(filter)} / {data?.isCompleteWeek ? "完全週" : "不完全週"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="secondary-button" onClick={() => onNavigate(previousWeek.toISOString().slice(0, 10))}>前週へ</button>
            <button type="button" className="secondary-button" disabled={next > new Date().toISOString().slice(0, 10)} onClick={() => onNavigate(next)}>翌週へ</button>
            <button ref={closeButtonRef} type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>×</button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {showLoading ? (
            <div className="space-y-4" aria-live="polite">
              <div className="h-32 animate-pulse rounded-2xl bg-slate-200" />
              <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
              <p className="text-sm text-slate-500">週次詳細を集計しています…</p>
            </div>
          ) : error ? (
            <div className="panel p-6"><p className="text-sm text-red-700">{error}</p></div>
          ) : data ? (
            <div className="space-y-5">
              <section>
                <h3 className="mb-3 text-lg font-semibold">週サマリー</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {summaryItems.map(([label, result]) => <article className="panel p-3" key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-bold">{result}</p></article>)}
                </div>
                <p className="mt-2 text-xs text-slate-500">有効日：CTI {data.validDayCounts.cti}日 / Town PV {data.validDayCounts.townPv}日 / Heaven {data.validDayCounts.heaven}日</p>
              </section>

              <section>
                <h3 className="mb-3 text-lg font-semibold">1日平均</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {averageItems.map(([label, result]) => <div className="rounded-lg bg-white p-3" key={label}><p className="text-xs text-slate-500">{label}</p><p className="font-semibold">{result}</p></div>)}
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-lg font-semibold">日別内訳</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {data.dailyBreakdown.map((day) => <button type="button" className="panel p-3 text-left hover:border-emerald-300" key={day.date} onClick={() => onOpenDay(day.date)}><p className="font-semibold">{day.date}（{day.weekday}）</p><p className="mt-2 text-sm">売上 {formatValue(day.sales, "currency")}</p><p className="text-sm">成約 {formatCount(day.contracts)} / 本指名 {formatCount(day.nominations)}</p><p className="text-sm">出勤 {formatValue(day.attendanceCount)} / {formatValue(day.attendanceHours, "hours")}</p><p className="text-xs text-slate-500">週成約構成比 {day.contractShare.value === null ? "—" : formatSignedPercent(day.contractShare.value)}</p></button>)}
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-lg font-semibold">店舗別内訳</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {data.storeBreakdown.map((item) => <article className="panel p-3" key={item.storeCode}><h4 className="font-semibold">{item.storeName}</h4><p className="mt-2 text-sm">売上 {formatValue(item.sales, "currency")}</p><p className="text-sm">成約 {formatCount(item.contracts)} / 本指名 {formatCount(item.nominations)}</p><p className="text-sm">出勤延べ {formatValue(item.attendanceCount)} / キャスト {formatValue(item.uniqueAttendanceCount)}</p><p className="text-sm">構成比 {item.salesShare.value === null ? "—" : `${(item.salesShare.value * 100).toFixed(1)}%`}</p></article>)}
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-lg font-semibold">成約構成</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {([ ["本指名", data.contractBreakdown.nominationCount], ["写真指名", data.contractBreakdown.photoNominationCount], ["フリー", data.contractBreakdown.freeCount], ["新規", data.contractBreakdown.newCount], ["リピート", data.contractBreakdown.repeatCount], ["キャンセル", data.contractBreakdown.cancelCount] ] as Array<[string, Metric]>).map(([label, value]) => <div className="panel p-3" key={label}><p className="text-xs text-slate-500">{label}</p><p className="font-semibold">{formatCount(value)}</p></div>)}
                </div>
                {data.contractBreakdownConsistency.isConsistent === false ? <p className="mt-2 text-xs text-amber-700">成約本数と指名区分合計に差があります</p> : null}
              </section>

              <section>
                <h3 className="mb-3 text-lg font-semibold">週次キャスト構成</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {[
                    ["実出勤キャスト数", `${formatNumber(data.castComposition.activeCastCount)}人`],
                    ["出勤延べ人数", formatNumber(data.castComposition.attendanceCount.value)],
                    ["成約あり", `${formatNumber(data.castComposition.contractCastCount)}人`],
                    ["成約0本", `${formatNumber(data.castComposition.zeroContractCastCount)}人`],
                    ["本指名あり", `${formatNumber(data.castComposition.nominationCastCount)}人`],
                    ["週3本以上", `${formatNumber(data.castComposition.threePlusContractCastCount)}人`],
                    ["報酬上位3名構成比", formatPercent(data.castComposition.top3RewardShare)],
                    ["成約上位3名構成比", formatPercent(data.castComposition.top3ContractShare)],
                    ["女子報酬合計", formatValue(data.castComposition.totalReward, "currency")],
                    ["平均出勤日数", formatValue(data.castComposition.averageAttendanceDays)],
                    ["平均出勤時間", formatValue(data.castComposition.averageAttendanceHours, "hours")],
                  ].map(([label, result]) => <article className="panel p-3" key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{result}</p></article>)}
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-lg font-semibold">前週比較</h3>
                {data.comparisons.previousWeek.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{data.comparisons.previousWeek.map((item) => <article className="panel p-3" key={item.metricKey}><p className="text-xs text-slate-500">{item.label}</p><p className="mt-1 text-sm">今週 {formatValue(item.current, item.metricKey === "sales" || item.metricKey === "femaleReward" ? "currency" : item.metricKey === "workingHours" ? "hours" : "integer")}</p><p className="text-sm">前週 {formatValue(item.baseline, item.metricKey === "sales" || item.metricKey === "femaleReward" ? "currency" : item.metricKey === "workingHours" ? "hours" : "integer")}</p><p className="mt-1 text-xs text-slate-600">差 {formatValue(item.difference, item.metricKey === "sales" || item.metricKey === "femaleReward" ? "currency" : "integer")} / {formatPercent(item.differenceRate)}</p></article>)}</div> : <p className="panel p-4 text-sm text-slate-500">前週と比較できるデータがありません。</p>}
              </section>

              <section>
                <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">週次キャスト一覧</h3><div className="flex gap-2"><select className="compact-input" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">全体</option><option value="KASUKABE">春日部</option><option value="KOSHIGAYA">越谷</option><option value="NODA">野田</option></select><select className="compact-input" value={sort} onChange={(event) => setSort(event.target.value)}><option value="reward">女子報酬順</option><option value="contracts">成約順</option><option value="nominations">本指名順</option></select></div></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                  {casts.map((cast) => <article className="panel p-4" key={cast.castId}><h4 className="font-semibold">{cast.name}</h4><p className="text-xs text-slate-500">{cast.stores.map(scopeLabel).join("・")}</p><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><p>報酬 <strong>{formatValue(cast.reward, "currency")}</strong></p><p>出勤日 <strong>{formatValue(cast.attendanceDays)}日</strong></p><p>時間 <strong>{formatValue(cast.attendanceHours, "hours")}</strong></p><p>成約 <strong>{formatCount(cast.contracts)}</strong></p><p>本指名 <strong>{formatCount(cast.nominations)}</strong></p><p>本指名率 <strong>{formatPercent(cast.nominationRate)}</strong></p><p>平均時給 <strong>{formatValue(cast.averageHourlyReward, "currency")}</strong></p><p>1日平均 <strong>{formatCount(cast.contractsPerDay)}</strong></p></div><details className="mt-3 text-xs"><summary className="cursor-pointer text-emerald-700">詳細</summary><div className="mt-2 space-y-1"><p>写真指名 {formatCount(cast.photoNominations)} / フリー {formatCount(cast.free)}</p><p>新規 {formatCount(cast.newCount)} / リピート {formatCount(cast.repeat)} / キャンセル {formatCount(cast.cancellations)}</p><p>有料OP {formatCount(cast.paidOptions)} / 写メ日記 {formatDiary(cast.photoDiaryCount)} {cast.photoDiaryCount.availability === "PARTIAL" ? <span className="text-amber-700">一部欠測</span> : null}</p><p>1時間あたり成約 {formatCount(cast.contractsPerHour)}</p></div></details></article>)}
                </div>
                {!casts.length ? <div className="panel p-6 text-center text-sm text-slate-500">この週に確認できる出勤キャスト実績はありません。</div> : null}
              </section>
            </div>
          ) : (
            <div className="panel p-8 text-center text-sm text-slate-500">この週のCTI実績データはまだ取り込まれていません。</div>
          )}
        </main>
      </aside>
    </div>,
    document.body,
  );
}
