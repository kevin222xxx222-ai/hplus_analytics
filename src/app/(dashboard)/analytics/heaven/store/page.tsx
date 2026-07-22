import { DateRangeForm } from "@/components/date-range-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { resolveDateRange } from "@/lib/analytics/cti";
import { aggregateHeavenMetric, heavenMetricLabel, percentChange, previousRange } from "@/lib/analytics/heaven";
import { prisma } from "@/lib/prisma";

const n = (v: number | null) => v === null ? "—" : v.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
const p = (v: number | null) => v === null ? "—" : `${n(v * 100)}%`;

export default async function HeavenStoreAnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser(); const query = await searchParams; const range = resolveDateRange(query.from, query.to); const previous = previousRange(range.from, range.to);
  const store = await prisma.store.findUnique({ where: { code: "KASUKABE" } });
  if (!store) return <p className="empty-state">春日部店が見つかりません。</p>;
  const rows = await prisma.heavenShopDaily.findMany({ where: { storeId: store.id, businessDate: { gte: previous.from, lte: range.to } }, orderBy: [{ metricKey: "asc" }, { businessDate: "asc" }] });
  const current = rows.filter((r) => r.businessDate >= range.from); const keys = [...new Set(current.map((r) => r.metricKey))].sort();
  return <><PageHeader eyebrow="HEAVEN STORE" title="Heaven店舗分析" description="春日部店のHeaven指標を、日次イベントとスナップショットの意味を分けて集計します。" /><DateRangeForm from={range.fromText} to={range.toText} />
    <section className="panel overflow-hidden"><div className="table-wrap"><table><thead><tr><th>指標</th><th>種別</th><th>期間値</th><th>前期間</th><th>比較</th><th>日別推移</th></tr></thead><tbody>{keys.map((key) => { const now = aggregateHeavenMetric(current.filter((r) => r.metricKey === key)); const prev = aggregateHeavenMetric(rows.filter((r) => r.metricKey === key && r.businessDate >= previous.from && r.businessDate <= previous.to)); return <tr key={key}><td className="font-medium text-slate-900">{heavenMetricLabel(key)}<span className="ml-2 text-xs text-slate-400">{key}</span></td><td>{now.valueKind === "SNAPSHOT" ? "スナップショット" : "日次イベント"}</td><td>{n(now.periodValue)}{now.valueKind === "SNAPSHOT" && <span className="block text-xs text-slate-500">初日 {n(now.firstValue)} / 増減 {n(now.change)} / Δ合計 {n(now.deltaSum)}</span>}</td><td>{n(prev.periodValue)}</td><td>{p(percentChange(now.periodValue, prev.periodValue))}</td><td>{now.daily.map((d) => `${d.date.slice(5)} ${n(d.value)}`).join(" / ") || "—"}</td></tr>; })}</tbody></table>{keys.length === 0 && <p className="empty-state">指定期間のHeaven店舗実績はありません。</p>}</div></section></>;
}
