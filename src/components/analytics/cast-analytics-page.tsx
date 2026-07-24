"use client";
import { useMemo, useState } from "react";
import { AnalyticsPageLayout, AnalyticsHeader, AnalyticsFilterBar, AnalyticsPeriodPicker, AnalyticsStoreSelector, AnalyticsSearch, AnalyticsSection, AnalyticsMetricGroup, AnalyticsTable, AnalyticsLoadingState, AnalyticsErrorMessage, AnalyticsUnavailableMessage } from "@/components/analytics/shared";
import { useAnalyticsFilters, useAnalyticsQuery } from "@/hooks/analytics";
import { fetchAnalyticsJson } from "@/lib/analytics/shared";
import { castMetricFormats, castMetricKeys, castMetricLabels, type CastResponseDto } from "@/lib/analytics/ui/cast-view-model";
import { formatMetric } from "@/lib/analytics/ui";

const stores = [{ value: "ALL", label: "全体" }, { value: "KASUKABE", label: "春日部" }, { value: "KOSHIGAYA", label: "越谷" }, { value: "NODA", label: "野田" }];
type CastListItem = { id: string; displayName: string; primaryStoreId?: string | null };
function apiUrl(filters: { from: string; to: string; store?: string }, castId: string) { const params = new URLSearchParams({ from: filters.from, to: filters.to, castId }); if (filters.store && filters.store !== "ALL") params.set("store", filters.store); return `/api/analytics/cast?${params}`; }

export function CastAnalyticsPage({ initialFrom, initialTo, initialStore, initialCastId }: { initialFrom: string; initialTo: string; initialStore: string; initialCastId: string }) {
  const defaults = useMemo(() => ({ from: initialFrom, to: initialTo, store: initialStore || "ALL", castId: initialCastId || "" }), [initialCastId, initialFrom, initialStore, initialTo]);
  const { filters, updateFilters } = useAnalyticsFilters(defaults);
  const castId = filters.castId || "";
  const [search, setSearch] = useState("");
  const [castList, setCastList] = useState<CastListItem[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const detail = useAnalyticsQuery<CastResponseDto>(castId ? apiUrl(filters, castId) : "/api/analytics/cast?castId=none");
  const listUrl = useMemo(() => { const params = new URLSearchParams({ from: filters.from, to: filters.to, castId: "" }); if (filters.store !== "ALL") params.set("store", filters.store); return `/api/analytics/performance?${params}`; }, [filters.from, filters.store, filters.to]);
  const filteredList = castList.filter((cast) => !search || cast.displayName.includes(search));
  const summary = detail.data?.cast.summary;
  const volume = summary?.volume;
  const efficiency = summary?.efficiency;
  const value = (key: string) => castMetricKeys.includes(key) ? (volume?.metrics[key as never] ?? efficiency?.[key as never]) : null;
  const availability = (key: string) => { const current = value(key) as number | null | undefined; return volume?.metricAvailability?.[key as never] ?? efficiency?.metricAvailability?.[key as never] ?? (current === null || current === undefined ? "MISSING" : current === 0 ? "ZERO" : "VALUE"); };
  const loadCastList = async () => { try { setListLoading(true); setListError(null); const result = await fetchAnalyticsJson<{ casts: Array<{ cast: CastListItem | null }> }>(listUrl); setCastList(result.casts.filter((item): item is { cast: CastListItem } => Boolean(item.cast)).map((item) => item.cast)); } catch (error) { setListError(error instanceof Error ? error.message : "キャスト一覧を取得できませんでした。"); } finally { setListLoading(false); } };
  const periodChange = (patch: { from?: string; to?: string }) => updateFilters(patch);
  return <AnalyticsPageLayout layoutOnly loading={detail.loading}>
    <div className="mx-auto max-w-[1500px] space-y-6">
      <AnalyticsHeader title="Cast Analytics" eyebrow="CAST ANALYTICS" description="原因・根拠・アクションの順で、1名のCTI・Town・Heaven実績を確認します。" period={`${filters.from}〜${filters.to}`} loading={detail.loading} onRefresh={detail.retry} />
      <AnalyticsFilterBar><AnalyticsPeriodPicker from={filters.from} to={filters.to} onChange={periodChange} /><AnalyticsStoreSelector value={filters.store} stores={stores} onChange={(store) => updateFilters({ store })} /><AnalyticsSearch value={search} onChange={setSearch} label="名前・Alias検索" /><button type="button" className="secondary-button" onClick={() => void loadCastList()} disabled={listLoading}>{listLoading ? "候補を取得中…" : "キャスト候補を読み込む"}</button></AnalyticsFilterBar>
      {listError ? <p role="alert" className="text-sm text-red-700">{listError}</p> : null}
      {castList.length > 0 ? <AnalyticsTable caption="キャスト選択" columns={[{ key: "name", label: "キャスト" }, { key: "store", label: "店舗" }]} rows={filteredList} rowKey={(row) => (row as CastListItem).id} renderCell={(row, column) => { const cast = row as CastListItem; if (column.key === "name") return <button type="button" className="text-left font-semibold text-emerald-700 underline" onClick={() => { updateFilters({ castId: cast.id, castSearch: cast.displayName }); }}>{cast.displayName}</button>; return cast.primaryStoreId ?? "—"; }} /> : null}
      {!castId ? <AnalyticsUnavailableMessage message="キャストを選択してください。候補一覧を読み込んで選択できます。" /> : detail.error ? <AnalyticsErrorMessage message={detail.error} onRetry={detail.retry} /> : detail.loading && !detail.data ? <AnalyticsLoadingState /> : !detail.data || !summary ? <AnalyticsUnavailableMessage message="指定キャストの分析データは利用できません。" /> : <>
        <AnalyticsSection title="Cause"><article className="panel p-5"><h3 className="text-lg font-semibold">{detail.data.cast.cast?.displayName ?? "—"}</h3><p className="mt-2 text-sm text-slate-600">Growth: {summary.growth?.classification ?? "—"}</p><p className="text-sm text-slate-600">Confidence: {summary.sample.confidence} / Availability: {summary.growth?.availability ?? "MISSING"}</p></article></AnalyticsSection>
        <AnalyticsSection title="Evidence"><AnalyticsSection title="Cast Summary" description="集計値とAvailability／Confidence／Sampleを確認します。"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{castMetricKeys.slice(0, 7).map((key) => <article className="panel p-4" key={key}><p className="text-xs text-slate-500">{castMetricLabels[key]}</p><p className="mt-2 text-xl font-semibold">{formatMetric(value(key), castMetricFormats[key])}</p><p className="mt-1 text-xs text-slate-500">{availability(key)} / {summary.sample.confidence}</p></article>)}</div></AnalyticsSection>
          <AnalyticsSection title="Performance"><AnalyticsMetricGroup title="Volume" metrics={castMetricKeys.filter((key) => ["sales", "castReward", "attendancePeople", "reservations", "services", "regularNominations", "diaryPosts"].includes(key)).map((key) => ({ key, label: castMetricLabels[key], value: value(key), format: castMetricFormats[key] === "pv" || castMetricFormats[key] === "uu" ? "integer" : castMetricFormats[key], hint: availability(key) }))} /><AnalyticsMetricGroup title="Efficiency" metrics={castMetricKeys.filter((key) => ["salesPerHour", "rewardPerHour"].includes(key)).map((key) => ({ key, label: castMetricLabels[key], value: value(key), format: "hourly", hint: availability(key) }))} /></AnalyticsSection>
          <AnalyticsSection title="Trend"><AnalyticsTable caption="期間比較" columns={[{ key: "baseline", label: "比較" }, { key: "current", label: "現在" }, { key: "difference", label: "差分" }, { key: "rate", label: "差異率" }, { key: "availability", label: "状態" }]} rows={summary.comparison ?? []} renderCell={(row, column) => { const item = row as NonNullable<typeof summary.comparison>[number]; if (column.key === "baseline") return item.baselineKind; if (column.key === "current") return formatMetric(item.current, "currency"); if (column.key === "difference") return formatMetric(item.difference, "currency"); if (column.key === "rate") return item.differenceRate === null ? "—" : `${(item.differenceRate * 100).toFixed(1)}%`; return item.availability; }} /></AnalyticsSection>
          <AnalyticsSection title="Time"><AnalyticsUnavailableMessage message="Cast単位の曜日分析DTOは未提供のため利用できません。曜日適性を推測していません。" /></AnalyticsSection>
          <AnalyticsSection title="Exposure"><AnalyticsMetricGroup title="媒体露出" metrics={["townPv", "townUu", "heavenAccess"].map((key) => ({ key, label: castMetricLabels[key], value: value(key), format: "integer", hint: `${availability(key)}。予約経路とは結び付きません。` }))} /></AnalyticsSection>
          <AnalyticsSection title="Activity"><AnalyticsMetricGroup title="活動量" metrics={["attendancePeople", "diaryPosts"].map((key) => ({ key, label: castMetricLabels[key], value: value(key), format: "integer", hint: availability(key) }))} /></AnalyticsSection>
          <AnalyticsSection title="Comparison"><AnalyticsUnavailableMessage message="本人平均・店舗平均はCast専用APIで未提供です。UIで平均を再計算していません。" /></AnalyticsSection>
        </AnalyticsSection>
        <AnalyticsSection title="Action"><article className="panel p-5"><h2 className="text-lg font-semibold">Growth</h2><p className="mt-2">{summary.growth?.classification ?? "—"}</p><p className="mt-3 text-sm text-slate-600">{summary.growth?.evidence?.join(" / ") || summary.growth?.reason || "根拠データがありません。"}</p><h2 className="mt-5 text-lg font-semibold">Next Best Action</h2><p className="mt-2 text-sm">{summary.nextBestAction?.action ?? "提案なし"}</p><p className="mt-2 text-xs text-slate-500">原因: {summary.nextBestAction?.cause ?? "—"} / Confidence: {summary.nextBestAction?.confidence ?? "Insufficient"}</p></article></AnalyticsSection>
        <AnalyticsSection title="Data Notes"><p className="text-sm text-slate-600">媒体露出と予約・成約の経路は特定できません。未存在媒体は0ではなくAvailabilityで表示しています。merged cast、順位、曜日適性、予測は推測していません。</p></AnalyticsSection>
      </>}
    </div>
  </AnalyticsPageLayout>;
}
