import Link from "next/link";
import { DateRangeForm } from "@/components/date-range-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { resolveDateRange } from "@/lib/analytics/cti";
import { aggregateHeavenMetric, heavenMetricLabel } from "@/lib/analytics/heaven";
import { prisma } from "@/lib/prisma";

const n = (v: number | null) => v === null ? "—" : v.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
const METRICS = ["page_access", "diary_posts", "my_girl", "mitene_sent", "okini_talk_sent", "attendance_notice", "diary_notice"];

export default async function HeavenCastAnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser(); const query = await searchParams; const range = resolveDateRange(query.from, query.to); const store = await prisma.store.findUnique({ where: { code: "KASUKABE" } });
  if (!store) return <p className="empty-state">春日部店が見つかりません。</p>;
  const rows = await prisma.heavenCastDaily.findMany({ where: { storeId: store.id, businessDate: { gte: range.from, lte: range.to }, castId: { not: null }, cast: { mergedIntoCastId: null } }, include: { cast: true }, orderBy: [{ sourceCastName: "asc" }, { businessDate: "asc" }] });
  const byCast = new Map<string, typeof rows>(); for (const row of rows) if (row.castId && row.cast) byCast.set(row.castId, [...(byCast.get(row.castId) ?? []), row]);
  const listings = await prisma.mediaListing.findMany({ where: { storeId: store.id, mediaType: "HEAVEN", castId: { in: [...byCast.keys()] } } });
  return <><PageHeader eyebrow="HEAVEN CAST" title="Heaven女子分析" description="春日部店の掲載キャストを、指標の値種別に応じて集計します。" /><DateRangeForm from={range.fromText} to={range.toText} />
    <section className="panel overflow-hidden"><div className="table-wrap"><table><thead><tr><th>キャスト</th>{METRICS.map((key) => <th key={key}>{heavenMetricLabel(key)}</th>)}<th>掲載</th><th>詳細</th></tr></thead><tbody>{[...byCast.entries()].map(([castId, records]) => <tr key={castId}><td className="font-medium text-slate-900">{records[0].cast!.displayName}</td>{METRICS.map((key) => { const a = aggregateHeavenMetric(records.filter((r) => r.metricKey === key)); return <td key={key}>{a.valueKind === "SNAPSHOT" ? <>{n(a.lastValue)}<span className="block text-xs text-slate-500">増減 {n(a.change)}</span></> : n(a.periodValue)}</td>; })}<td>{listings.find((l) => l.castId === castId)?.isListed ? "掲載" : "未掲載"}</td><td><Link className="text-emerald-700" href={`/analytics/heaven/casts/${castId}?from=${range.fromText}&to=${range.toText}`}>詳細</Link></td></tr>)}</tbody></table>{byCast.size === 0 && <p className="empty-state">指定期間のHeaven女子実績はありません。</p>}</div></section></>;
}
