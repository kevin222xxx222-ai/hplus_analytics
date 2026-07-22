import Link from "next/link";
import { DateRangeForm } from "@/components/date-range-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { resolveDateRange } from "@/lib/analytics/cti";
import { aggregateHeavenMetric, heavenMetricLabel } from "@/lib/analytics/heaven";
import { formatDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";

const n = (v: number | null) => v === null ? "—" : v.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
export default async function HeavenCastDetailPage({ params, searchParams }: { params: Promise<{ castId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser(); const { castId } = await params; const query = await searchParams; const range = resolveDateRange(query.from, query.to);
  const cast = await prisma.cast.findUnique({ where: { id: castId }, include: { aliases: { where: { mediaType: "HEAVEN", validFrom: { lte: range.to }, OR: [{ validTo: null }, { validTo: { gte: range.from } }] } }, mediaListings: { where: { mediaType: "HEAVEN", store: { code: "KASUKABE" } }, include: { store: true } } } }); if (!cast || cast.mergedIntoCastId) return <p className="empty-state">キャストが見つかりません。</p>;
  const store = await prisma.store.findUnique({ where: { code: "KASUKABE" } }); if (!store) return <p className="empty-state">春日部店が見つかりません。</p>;
  const rows = await prisma.heavenCastDaily.findMany({ where: { castId, storeId: store.id, businessDate: { gte: range.from, lte: range.to } }, orderBy: [{ metricKey: "asc" }, { businessDate: "asc" }] });
  const keys = [...new Set(rows.map((r) => r.metricKey))].sort();
  return <><Link href={`/analytics/heaven/casts?from=${range.fromText}&to=${range.toText}`} className="mb-5 inline-flex text-sm text-slate-500">← 女子一覧へ</Link><PageHeader eyebrow="HEAVEN CAST DETAIL" title={cast.displayName} description="Heaven指標の日別明細とAlias・掲載状態。" /><DateRangeForm from={range.fromText} to={range.toText} /><section className="panel mb-6 p-5"><p className="text-sm text-slate-500">Heaven Alias</p><p className="mt-2 text-sm">{cast.aliases.map((a) => a.aliasName).join(" / ") || "—"}</p><p className="mt-3 text-sm text-slate-500">掲載状態</p><p className="mt-1">{cast.mediaListings.some((l) => l.isListed) ? "掲載" : "未掲載"}</p></section><section className="panel overflow-hidden"><div className="table-wrap"><table><thead><tr><th>指標</th><th>種別</th><th>初値</th><th>最終値</th><th>増減</th><th>Δ合計</th><th>日別明細</th></tr></thead><tbody>{keys.map((key) => { const a = aggregateHeavenMetric(rows.filter((r) => r.metricKey === key)); return <tr key={key}><td>{heavenMetricLabel(key)}<span className="ml-2 text-xs text-slate-400">{key}</span></td><td>{a.valueKind === "SNAPSHOT" ? "SNAPSHOT" : "DAILY_EVENT"}</td><td>{n(a.firstValue)}</td><td>{n(a.lastValue)}</td><td>{n(a.change)}</td><td>{n(a.deltaSum)}</td><td>{rows.filter((r) => r.metricKey === key).map((r) => `${formatDateOnly(r.businessDate)}: ${n(r.rawValue === null ? null : Number(r.rawValue))} (${r.rawValueStatus})`).join(" / ")}</td></tr>; })}</tbody></table>{keys.length === 0 && <p className="empty-state">指定期間のHeaven実績はありません。</p>}</div></section></>;
}
