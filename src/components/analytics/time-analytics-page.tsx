"use client";
import { useMemo, useState, type FormEvent } from "react";
import { AnalyticsPageLayout, AnalyticsHeader, AnalyticsFilterBar, AnalyticsPeriodPicker, AnalyticsStoreSelector, AnalyticsComparisonSwitch, AnalyticsSearch, AnalyticsSort, AnalyticsSection, AnalyticsTable, AnalyticsLoadingState, AnalyticsErrorMessage, AnalyticsEmptyMessage, AnalyticsUnavailableMessage, AnalyticsMetricGroup } from "@/components/analytics/shared";
import { useAnalyticsFilters, useAnalyticsQuery } from "@/hooks/analytics";
import { buildTimeUrl, formatTimeValue, TIME_METRICS, timeAvailability, type TimeMetricCategory, type TimeResponseDto } from "@/lib/analytics/ui/time-view-model";

const stores = [{ value: "ALL", label: "全体" }, { value: "KASUKABE", label: "春日部" }, { value: "KOSHIGAYA", label: "越谷" }];
const categories: Array<{ value: TimeMetricCategory; label: string }> = [{ value: "efficiency", label: "Efficiency" }, { value: "volume", label: "Volume" }, { value: "sample", label: "Sample" }];

function metricValue(row: NonNullable<TimeResponseDto["weekdays"]>[number], category: TimeMetricCategory, key: string): number | null {
  const value = category === "sample" ? row.sample[key] : category === "efficiency" ? row.efficiency[key] : row.volume.metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function metricAvailability(row: NonNullable<TimeResponseDto["weekdays"]>[number], category: TimeMetricCategory, key: string) {
  if (category === "sample") return undefined;
  return category === "efficiency" ? row.efficiency.metricAvailability?.[key] : row.volume.metricAvailability?.[key];
}

export function TimeAnalyticsPage({ initialFrom, initialTo, initialStore }: { initialFrom: string; initialTo: string; initialStore: string }) {
  const defaults = useMemo(() => ({ from: initialFrom, to: initialTo, store: initialStore || "ALL", dimension: "weekday", category: "efficiency", metric: "salesPerHour", sort: "weekday", order: "asc" }), [initialFrom, initialTo, initialStore]);
  const { filters, updateFilters } = useAnalyticsFilters(defaults);
  const [category, setCategory] = useState<TimeMetricCategory>((filters.category as TimeMetricCategory) || "efficiency");
  const [metric, setMetric] = useState(filters.metric || "salesPerHour");
  const [sort, setSort] = useState(filters.sort || "weekday");
  const [order, setOrder] = useState<"asc" | "desc">(filters.order === "desc" ? "desc" : "asc");
  const [search, setSearch] = useState("");
  const url = useMemo(() => buildTimeUrl(filters), [filters]);
  const query = useAnalyticsQuery<TimeResponseDto>(url);
  const metrics = TIME_METRICS[category];
  const weekdays = useMemo(() => {
    const rows = query.data?.weekdays ?? [];
    const filtered = rows.filter((row) => !search || row.label.includes(search));
    return [...filtered].sort((a, b) => { if (sort === "weekday") return order === "asc" ? a.weekday - b.weekday : b.weekday - a.weekday; const av = metricValue(a, category, sort); const bv = metricValue(b, category, sort); if (typeof av !== "number" || typeof bv !== "number") return a.label.localeCompare(b.label, "ja"); return order === "asc" ? av - bv : bv - av; });
  }, [category, order, query.data, search, sort]);
  const selectedMetric = metrics.find((item) => item.key === metric) ?? metrics[0];
  const sample = query.data?.overall?.sample;
  const onApply = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); updateFilters({ from: filters.from, to: filters.to, store: filters.store, period: "custom" }); };
  return <AnalyticsPageLayout layoutOnly loading={query.loading}>
    <div className="mx-auto max-w-[1500px] space-y-6">
      <AnalyticsHeader title="Time Analytics" eyebrow="TIME ANALYTICS" description="曜日ごとの規模・効率・サンプル数を分けて比較し、店舗運営のパターンを確認します。" storeLabel={stores.find((item) => item.value === filters.store)?.label} period={`${filters.from}〜${filters.to}`} loading={query.loading} onRefresh={query.retry} />
      <AnalyticsFilterBar onSubmit={onApply} submitLabel="表示">
        <AnalyticsPeriodPicker from={filters.from} to={filters.to} onChange={(patch) => updateFilters(patch)} />
        <AnalyticsStoreSelector value={filters.store} stores={stores} onChange={(value) => updateFilters({ store: value })} />
        <AnalyticsComparisonSwitch label="分析単位" value={filters.dimension || "weekday"} options={[{ value: "weekday", label: "曜日" }, { value: "businessDayType", label: "営業日タイプ" }]} onChange={(value) => updateFilters({ dimension: value })} />
        <AnalyticsComparisonSwitch label="指標分類" value={category} options={categories} onChange={(value) => { const next = value as TimeMetricCategory; setCategory(next); const nextMetric = TIME_METRICS[next][0].key; setMetric(nextMetric); updateFilters({ category: next, metric: nextMetric }); }} />
        <AnalyticsComparisonSwitch label="指標" value={metric} options={metrics.map((item) => ({ value: item.key, label: item.label }))} onChange={(value) => { setMetric(value); updateFilters({ metric: value }); }} />
        <AnalyticsSearch value={search} onChange={setSearch} label="曜日検索" />
        <AnalyticsSort value={sort} columns={[{ key: "weekday", label: "曜日順" }, ...metrics.map((item) => ({ key: item.key, label: item.label }))]} onChange={(value) => { setSort(value); updateFilters({ sort: value }); }} />
        <AnalyticsComparisonSwitch label="順序" value={order} options={[{ value: "asc", label: "昇順" }, { value: "desc", label: "降順" }]} onChange={(value) => { const next = value as "asc" | "desc"; setOrder(next); updateFilters({ order: next }); }} />
      </AnalyticsFilterBar>
      {query.error ? <AnalyticsErrorMessage message={query.error} onRetry={query.retry} /> : query.loading && !query.data ? <AnalyticsLoadingState /> : !query.data ? <AnalyticsEmptyMessage /> : <>
        <AnalyticsSection title="Sample / Data Health" description="まず母数とデータ状態を確認します。ZEROとMISSINGは区別して表示します。"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{TIME_METRICS.sample.map((item) => <article key={item.key} className="panel p-4"><p className="text-sm font-semibold text-slate-700">{item.label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{formatTimeValue(sample?.[item.key], item.format)}</p><p className="mt-1 text-xs text-slate-500">{timeAvailability(sample?.[item.key])}</p></article>)}<article className="panel p-4"><p className="text-sm font-semibold text-slate-700">Confidence</p><p className="mt-2 text-2xl font-bold text-slate-900">{String(sample?.confidence ?? "Insufficient")}</p><p className="mt-1 text-xs text-slate-500">曜日対象日数を母数として判定</p></article></div></AnalyticsSection>
        <AnalyticsSection title="Efficiency by Weekday" description="売上規模とは分けて、時間あたりの効率を確認します。"><AnalyticsMetricGroup title={selectedMetric?.label ?? "Efficiency"} metrics={weekdays.map((row) => ({ key: String(row.weekday), label: row.label, value: metricValue(row, category, metric), format: selectedMetric?.format === "number" ? "integer" : selectedMetric?.format === "percent" ? "percent" : selectedMetric?.format === "hours" ? "hours" : selectedMetric?.format === "currency" ? "currency" : "integer", hint: `${timeAvailability(metricValue(row, category, metric), metricAvailability(row, category, metric))} / Confidence ${String(row.sample.confidence ?? "Insufficient")}` }))} /></AnalyticsSection>
        <AnalyticsSection title="Volume by Weekday" description="売上・報酬・出勤などの規模を表示します。効率と混同しません。"><AnalyticsTable caption="曜日別Volume" columns={[{ key: "weekday", label: "曜日" }, { key: "sales", label: "売上", align: "right" }, { key: "castReward", label: "女子報酬", align: "right" }, { key: "attendancePeople", label: "出勤人数", align: "right" }, { key: "attendanceMinutes", label: "出勤時間", align: "right" }]} rows={weekdays} rowKey={(row) => String((row as NonNullable<TimeResponseDto["weekdays"]>[number]).weekday)} renderCell={(row, column) => { const typed = row as NonNullable<TimeResponseDto["weekdays"]>[number]; if (column.key === "weekday") return typed.label; const def = TIME_METRICS.volume.find((item) => item.key === column.key); const raw = typed.volume.metrics[column.key]; return formatTimeValue(column.key === "attendanceMinutes" && typeof raw === "number" ? raw / 60 : raw, def?.format ?? "number"); }} /></AnalyticsSection>
        <AnalyticsSection title="Weekday Overview" description="Sample → Efficiency → Volumeの順で確認してください。"><AnalyticsTable caption="曜日別総合一覧" columns={[{ key: "weekday", label: "曜日" }, { key: "sample", label: "Sample" }, { key: "efficiency", label: "Efficiency" }, { key: "volume", label: "Volume" }, { key: "availability", label: "Availability" }, { key: "confidence", label: "Confidence" }]} rows={weekdays} rowKey={(row) => String((row as NonNullable<TimeResponseDto["weekdays"]>[number]).weekday)} renderCell={(row, column) => { const typed = row as NonNullable<TimeResponseDto["weekdays"]>[number]; if (column.key === "weekday") return typed.label; if (column.key === "sample") return `${String(typed.sample.targetDays ?? 0)}日`; if (column.key === "efficiency") return formatTimeValue(typed.efficiency.salesPerHour, "currency"); if (column.key === "volume") return formatTimeValue(typed.volume.metrics.sales, "currency"); if (column.key === "availability") return timeAvailability(typed.volume.metrics.sales, typed.volume.metricAvailability?.sales); return String(typed.sample.confidence ?? "Insufficient"); }} /></AnalyticsSection>
        <AnalyticsSection title="Business Day Type Analysis"><AnalyticsUnavailableMessage message="営業日タイプ別分析は現在利用できません。曜日データから祝日・休日を推測していません。" /></AnalyticsSection>
        <AnalyticsSection title="Store Comparison" description="Time APIが返す店舗サマリーだけを表示します。"><div className="grid gap-4 md:grid-cols-2">{(query.data.storeSummaries ?? []).map((item) => <article key={item.store.id} className="panel p-4"><h3 className="font-semibold text-slate-900">{item.store.shortName}</h3><p className="mt-3 text-sm">売上: {formatTimeValue(item.summary?.volume.metrics.sales, "currency")}</p><p className="text-sm">売上／時間: {formatTimeValue(item.summary?.efficiency.salesPerHour, "currency")}</p><p className="mt-2 text-xs text-slate-500">Availability: {timeAvailability(item.summary?.volume.metrics.sales, item.summary?.volume.metricAvailability?.sales)}<br />Confidence: {String(item.summary?.sample.confidence ?? "Insufficient")}</p><p className="mt-2 text-xs text-slate-500">Growth: {item.summary?.growth ? String((item.summary.growth as { classification?: string }).classification ?? "—") : "—"} / Action: {item.summary?.nextBestAction && (item.summary.nextBestAction as { action?: string }).action ? "あり" : "提案なし"}</p></article>)}</div>{!query.data.storeSummaries?.length ? <AnalyticsEmptyMessage message="店舗比較データがありません。" /> : null}</AnalyticsSection>
        <AnalyticsSection title="Insights / Growth / Action" description="APIが返す既存のGrowth／Actionだけを表示します。"><div className="grid gap-4 md:grid-cols-2"><article className="panel p-4"><h3 className="font-semibold">Growth</h3><p className="mt-2">{String(query.data.overall?.growth ? (query.data.overall.growth as { classification?: string }).classification : "—")}</p></article><article className="panel p-4"><h3 className="font-semibold">Next Best Action</h3><p className="mt-2">{String(query.data.overall?.nextBestAction ? (query.data.overall.nextBestAction as { action?: string }).action ?? "提案なし" : "—")}</p></article></div></AnalyticsSection>
        <AnalyticsSection title="Data Notes"><p className="text-sm text-slate-600">曜日の優劣は合計値だけで判断せず、Sample・Efficiency・Volume・Confidenceを併せて確認してください。営業日タイプ、時間帯、予約経路、機会損失は推測していません。</p></AnalyticsSection>
      </>}
    </div>
  </AnalyticsPageLayout>;
}
