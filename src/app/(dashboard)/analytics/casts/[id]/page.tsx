import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { DateRangeForm } from "@/components/date-range-form";
import { PageHeader } from "@/components/page-header";
import { MergedCastRedirect } from "@/components/merged-cast-redirect";
import { aggregateCti, resolveDateRange } from "@/lib/analytics/cti";
import { aggregateTown } from "@/lib/analytics/town";
import { requireUser } from "@/lib/auth";
import { formatDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";

function number(value: number | null, digits = 0) { return value === null ? "—" : value.toLocaleString("ja-JP", { maximumFractionDigits: digits }); }

export default async function CastDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const range = resolveDateRange(query.from, query.to);
  const cast = await prisma.cast.findUnique({ where: { id }, include: { mergedInto: { select: { id: true, displayName: true } } } });
  if (!cast) notFound();
  if (cast.mergedIntoCastId && cast.mergedInto && cast.mergedAt) return <MergedCastRedirect sourceName={cast.displayName} targetId={cast.mergedInto.id} targetName={cast.mergedInto.displayName} mergedAt={cast.mergedAt.toISOString()} queryString={`?from=${range.fromText}&to=${range.toText}`} />;
  const [records, townRecords] = await Promise.all([
    prisma.ctiCastDaily.findMany({ where: { castId: id, businessDate: { gte: range.from, lte: range.to } }, include: { store: true }, orderBy: [{ businessDate: "asc" }, { store: { displayOrder: "asc" } }] }),
    prisma.townCastDaily.findMany({ where: { castId: id, date: { gte: range.from, lte: range.to } }, include: { store: true }, orderBy: [{ date: "asc" }, { store: { displayOrder: "asc" } }] }),
  ]);
  const total = aggregateCti(records);
  const byStore = new Map<string, typeof records>();
  const byDate = new Map<string, typeof records>();
  for (const record of records) {
    byStore.set(record.storeId, [...(byStore.get(record.storeId) || []), record]);
    const date = formatDateOnly(record.businessDate);
    byDate.set(date, [...(byDate.get(date) || []), record]);
  }
  const townByStore = new Map<string, typeof townRecords>();
  for (const record of townRecords) townByStore.set(record.storeId, [...(townByStore.get(record.storeId) || []), record]);
  const townTotal = aggregateTown(townRecords);
  return <><Link href={`/analytics/casts?from=${range.fromText}&to=${range.toText}`} className="mb-5 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-700"><ArrowLeft className="size-4" />キャスト一覧へ</Link><PageHeader eyebrow="CAST DETAIL" title={cast.displayName} description="店舗別内訳と日別実績。複数店舗の同日出勤は出勤日数だけ重複除外します。" /><DateRangeForm from={range.fromText} to={range.toText} />
    <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["出勤日数", `${total.attendanceDays}日`], ["総出勤時間", `${number(total.attendanceMinutes / 60, 1)}h`], ["料金", `¥${number(total.salesAmount)}`], ["女子報酬", `¥${number(total.castRewardAmount)}`], ["成約数", number(total.contractCount)]].map(([label, value]) => <div className="panel p-4" key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-900">{value}</p></div>)}</section>
    <section className="panel mb-6 overflow-hidden"><div className="border-b border-slate-200 p-5"><h2 className="font-semibold text-slate-900">店舗別内訳</h2></div><div className="table-wrap"><table><thead><tr><th>店舗</th><th>出勤日数</th><th>出勤時間</th><th>料金</th><th>女子報酬</th><th>CTI利益</th><th>予約</th><th>キャンセル</th><th>成約</th></tr></thead><tbody>{[...byStore.values()].map((storeRecords) => { const metrics = aggregateCti(storeRecords); return <tr key={storeRecords[0].storeId}><td className="font-medium text-slate-900">{storeRecords[0].store.shortName}</td><td>{metrics.attendanceDays}</td><td>{number(metrics.attendanceMinutes / 60, 1)}h</td><td>¥{number(metrics.salesAmount)}</td><td>¥{number(metrics.castRewardAmount)}</td><td>¥{number(metrics.ctiProfitAmount)}</td><td>{metrics.reservationCount}</td><td>{metrics.cancellationCount}</td><td>{metrics.contractCount}</td></tr>; })}</tbody></table></div></section>
    <section className="panel mb-6 overflow-hidden"><div className="border-b border-slate-200 p-5"><h2 className="font-semibold text-slate-900">タウン指標</h2><p className="mt-1 text-xs text-slate-500">TELタップとCTI予約・成約は顧客単位では直接対応せず、同期間の傾向比較です。</p></div><div className="table-wrap"><table><thead><tr><th>店舗</th><th>PV</th><th>UU</th><th>TEL</th><th>TEL率</th></tr></thead><tbody>{[...townByStore.values()].map((storeRecords) => { const metrics = aggregateTown(storeRecords); return <tr key={storeRecords[0].storeId}><td className="font-medium text-slate-900">{storeRecords[0].store.shortName}</td><td>{number(metrics.pv)}</td><td>{number(metrics.uu)}</td><td>{number(metrics.telTapUu)}</td><td>{metrics.conversionRate === null ? "—" : `${number(metrics.conversionRate * 100, 2)}%`}</td></tr>; })}<tr><td className="font-semibold">合計</td><td>{number(townTotal.pv)}</td><td>{number(townTotal.uu)}</td><td>{number(townTotal.telTapUu)}</td><td>{townTotal.conversionRate === null ? "—" : `${number(townTotal.conversionRate * 100, 2)}%`}</td></tr></tbody></table>{townRecords.length === 0 && <p className="empty-state">指定期間のタウン女子実績はありません。</p>}</div></section>
    <section className="panel overflow-hidden"><div className="border-b border-slate-200 p-5"><h2 className="font-semibold text-slate-900">日別CTI実績</h2></div><div className="table-wrap"><table><thead><tr><th>営業日</th><th>店舗</th><th>出勤時間</th><th>料金</th><th>女子報酬</th><th>CTI利益</th><th>予約</th><th>キャンセル</th><th>成約</th></tr></thead><tbody>{[...byDate.entries()].map(([date, dayRecords]) => { const metrics = aggregateCti(dayRecords); return <tr key={date}><td className="font-medium text-slate-900">{date}</td><td>{dayRecords.map((record) => record.store.shortName).join(" / ")}</td><td>{number(metrics.attendanceMinutes / 60, 1)}h</td><td>¥{number(metrics.salesAmount)}</td><td>¥{number(metrics.castRewardAmount)}</td><td>¥{number(metrics.ctiProfitAmount)}</td><td>{metrics.reservationCount}</td><td>{metrics.cancellationCount}</td><td>{metrics.contractCount}</td></tr>; })}</tbody></table>{records.length === 0 && <p className="empty-state">指定期間の実績はありません。</p>}</div></section>
  </>;
}
