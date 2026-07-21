import { DateRangeForm } from "@/components/date-range-form";
import { PageHeader } from "@/components/page-header";
import { aggregateTown, changeRate } from "@/lib/analytics/town";
import { requireUser } from "@/lib/auth";
import { formatDateOnly } from "@/lib/date";
import { resolveDateRange } from "@/lib/analytics/cti";
import { prisma } from "@/lib/prisma";

function number(value: number | null, digits = 0) { return value === null ? "—" : value.toLocaleString("ja-JP", { maximumFractionDigits: digits }); }
function percent(value: number | null, digits = 1) { return value === null ? "—" : `${number(value * 100, digits)}%`; }

export default async function TownStoreAnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; scope?: string }> }) {
  await requireUser();
  const query = await searchParams;
  const range = resolveDateRange(query.from, query.to);
  const stores = await prisma.store.findMany({ where: { hasAcquisitionMetrics: true }, orderBy: { displayOrder: "asc" } });
  const selected = stores.find((store) => store.code === query.scope);
  const compareFrom = new Date(range.from); compareFrom.setUTCDate(compareFrom.getUTCDate() - 7);
  const records = await prisma.townStoreDaily.findMany({ where: { date: { gte: compareFrom, lte: range.to }, ...(selected ? { storeId: selected.id } : {}) }, include: { store: true }, orderBy: [{ date: "asc" }, { store: { displayOrder: "asc" } }] });
  const periodRecords = records.filter((row) => row.date >= range.from);
  const metrics = aggregateTown(periodRecords);
  const latest = aggregateTown(records.filter((row) => formatDateOnly(row.date) === range.toText));
  const previousDate = new Date(range.to); previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const weekDate = new Date(range.to); weekDate.setUTCDate(weekDate.getUTCDate() - 7);
  const previous = aggregateTown(records.filter((row) => formatDateOnly(row.date) === formatDateOnly(previousDate)));
  const week = aggregateTown(records.filter((row) => formatDateOnly(row.date) === formatDateOnly(weekDate)));
  const byDate = new Map<string, typeof periodRecords>();
  for (const row of periodRecords) { const key = formatDateOnly(row.date); byDate.set(key, [...(byDate.get(key) || []), row]); }
  return <><PageHeader eyebrow="TOWN PERFORMANCE" title="タウン店舗分析" description="全体の率は春日部・越谷の分子と分母を合算して再計算します。" />
    <DateRangeForm from={range.fromText} to={range.toText} extra={<div><label className="form-label">表示単位</label><select name="scope" defaultValue={selected?.code || "ALL"} className="form-input mt-2 w-[180px]"><option value="ALL">全体</option>{stores.map((store) => <option key={store.id} value={store.code}>{store.shortName}</option>)}</select></div>} />
    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{[
      ["PV", number(metrics.pv)], ["UU", number(metrics.uu)], ["平均PV", number(metrics.averagePv, 2)], ["直帰率", percent(metrics.bounceRate)], ["TELタップ", number(metrics.telTapUu)], ["TEL率", percent(metrics.conversionRate, 2)],
    ].map(([label, value]) => <div className="panel p-5" key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p></div>)}</section>
    <section className="mb-6 grid gap-4 sm:grid-cols-2"><div className="panel p-5"><p className="text-sm text-slate-500">最終日のPV比較</p><p className="mt-2 text-xl font-semibold">前日比 {percent(changeRate(latest.pv, previous.pv))} / 前週同曜日比 {percent(changeRate(latest.pv, week.pv))}</p></div><div className="panel p-5"><p className="text-sm text-slate-500">最終日のTEL比較</p><p className="mt-2 text-xl font-semibold">前日比 {percent(changeRate(latest.telTapUu, previous.telTapUu))} / 前週同曜日比 {percent(changeRate(latest.telTapUu, week.telTapUu))}</p></div></section>
    <section className="panel overflow-hidden"><div className="border-b border-slate-200 p-5"><h2 className="font-semibold text-slate-900">期間推移</h2></div><div className="table-wrap"><table><thead><tr><th>日付</th><th>PV</th><th>UU</th><th>平均PV</th><th>直帰率</th><th>TEL</th><th>TEL率</th></tr></thead><tbody>{[...byDate.entries()].map(([date, rows]) => { const total = aggregateTown(rows); return <tr key={date}><td className="font-medium text-slate-900">{date}</td><td>{number(total.pv)}</td><td>{number(total.uu)}</td><td>{number(total.averagePv, 2)}</td><td>{percent(total.bounceRate)}</td><td>{number(total.telTapUu)}</td><td>{percent(total.conversionRate, 2)}</td></tr>; })}</tbody></table>{byDate.size === 0 && <p className="empty-state">指定期間のタウン店舗実績はありません。</p>}</div></section>
  </>;
}

