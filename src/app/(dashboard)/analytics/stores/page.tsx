import { DateRangeForm } from "@/components/date-range-form";
import { PageHeader } from "@/components/page-header";
import { aggregateCti, resolveDateRange } from "@/lib/analytics/cti";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function number(value: number | null, digits = 0) { return value === null ? "—" : value.toLocaleString("ja-JP", { maximumFractionDigits: digits }); }

export default async function StoreAnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; scope?: string }> }) {
  await requireUser();
  const query = await searchParams;
  const range = resolveDateRange(query.from, query.to);
  const stores = await prisma.store.findMany({ orderBy: { displayOrder: "asc" } });
  const selected = stores.find((store) => store.code === query.scope);
  const records = await prisma.ctiCastDaily.findMany({ where: { businessDate: { gte: range.from, lte: range.to }, ...(selected ? { storeId: selected.id } : {}) }, include: { store: true } });
  const metrics = aggregateCti(records);
  const scopeName = selected?.shortName || "管轄全体";
  return <><PageHeader eyebrow="STORE PERFORMANCE" title="店舗実績" description="管轄全体は春日部・越谷・野田を合算し、同一日・同一キャストの出勤実人数を重複除外します。" /><DateRangeForm from={range.fromText} to={range.toText} extra={<div><label className="form-label">表示単位</label><select name="scope" defaultValue={selected?.code || "ALL"} className="form-input mt-2 w-[180px]"><option value="ALL">管轄全体</option>{stores.map((store) => <option key={store.id} value={store.code}>{store.shortName}</option>)}</select></div>} />
    <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">{scopeName}</h2><p className="text-xs text-slate-500">{range.fromText}〜{range.toText}</p></div>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      ["料金", `¥${number(metrics.salesAmount)}`], ["女子報酬", `¥${number(metrics.castRewardAmount)}`], ["CTI利益", `¥${number(metrics.ctiProfitAmount)}`], ["報酬控除後売上", `¥${number(metrics.payoutAfterRewardAmount)}`],
      ["出勤実人数", `${metrics.actualAttendance}人日`], ["延べ店舗出勤人数", `${metrics.storeAttendance}人日`], ["総出勤時間", `${number(metrics.attendanceMinutes / 60, 1)}h`], ["本指名率", metrics.regularNominationRate === null ? "—" : `${number(metrics.regularNominationRate * 100, 1)}%`],
    ].map(([label, value]) => <div className="panel p-5" key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p></div>)}</section>
    <section className="panel mt-6 overflow-hidden"><div className="table-wrap"><table><thead><tr><th>予約</th><th>キャンセル</th><th>成約</th><th>本指名</th><th>写真指名</th><th>フリー</th><th>平均単価</th><th>平均報酬単価</th><th>平均売上/時間</th></tr></thead><tbody><tr><td>{metrics.reservationCount}</td><td>{metrics.cancellationCount}</td><td>{metrics.contractCount}</td><td>{metrics.regularNominationCount}</td><td>{metrics.photoNominationCount}</td><td>{metrics.freeCount}</td><td>{metrics.averageUnitPrice === null ? "—" : `¥${number(metrics.averageUnitPrice)}`}</td><td>{metrics.averageRewardUnitPrice === null ? "—" : `¥${number(metrics.averageRewardUnitPrice)}`}</td><td>{metrics.averageSalesPerHour === null ? "—" : `¥${number(metrics.averageSalesPerHour)}`}</td></tr></tbody></table></div></section>
  </>;
}
