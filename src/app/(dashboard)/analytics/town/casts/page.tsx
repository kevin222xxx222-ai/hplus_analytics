import Link from "next/link";
import { DateRangeForm } from "@/components/date-range-form";
import { PageHeader } from "@/components/page-header";
import { TownReferenceAnalysis, type TownReferenceDisplayRow } from "@/components/town-reference-analysis";
import { resolveDateRange } from "@/lib/analytics/cti";
import { aggregateTown } from "@/lib/analytics/town";
import { buildTownReferenceScope } from "@/lib/analytics/town-reference";
import { getTownReferenceConfig } from "@/lib/analytics/town-reference-config";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function n(value: number | null, digits = 0) { return value === null ? "—" : value.toLocaleString("ja-JP", { maximumFractionDigits: digits }); }

export default async function TownCastAnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser();
  const query = await searchParams; const range = resolveDateRange(query.from, query.to);
  const [town, cti, stores, listings] = await Promise.all([
    prisma.townCastDaily.findMany({ where: { date: { gte: range.from, lte: range.to }, cast: { mergedIntoCastId: null } }, include: { cast: true, store: true } }),
    prisma.ctiCastDaily.findMany({ where: { businessDate: { gte: range.from, lte: range.to }, cast: { mergedIntoCastId: null } } }),
    prisma.store.findMany({ where: { hasAcquisitionMetrics: true } }),
    prisma.mediaListing.findMany({ where: { mediaType: "TOWN", cast: { mergedIntoCastId: null } } }),
  ]);
  const rows = new Map<string, typeof town>(); for (const row of town) rows.set(row.castId, [...(rows.get(row.castId) || []), row]);
  const ctiByCast = new Map<string, typeof cti>(); for (const row of cti) ctiByCast.set(row.castId, [...(ctiByCast.get(row.castId) || []), row]);
  const referenceConfig = getTownReferenceConfig();
  const referenceRows: TownReferenceDisplayRow[] = [...rows.entries()].map(([castId, records]) => {
    const ctiRows = ctiByCast.get(castId) || [];
    const townRecords = records.map((row) => ({ date: row.date, storeId: row.storeId, pv: row.pv, uu: row.uu, telTapUu: row.telTapUu }));
    const ctiReferenceRows = ctiRows.map((row) => ({ businessDate: row.businessDate, storeId: row.storeId, salesAmount: row.salesAmount, castRewardAmount: row.castRewardAmount, contractCount: row.contractCount, regularNominationCount: row.regularNominationCount, attendanceMinutes: row.attendanceMinutes }));
    const total = buildTownReferenceScope(townRecords, ctiReferenceRows, range.from, range.to);
    return { id: castId, name: records[0].cast.displayName, metrics: total, scopes: [...stores.map((store) => ({ label: store.shortName, metrics: buildTownReferenceScope(townRecords, ctiReferenceRows, range.from, range.to, store.id) })), { label: "全体", metrics: total }] };
  });
  return <><PageHeader eyebrow="TOWN CAST" title="タウン女子分析" description="TELタップとCTI予約・成約は顧客単位では直接対応しません。集計値による傾向比較です。" /><DateRangeForm from={range.fromText} to={range.toText} />
    <section className="panel overflow-hidden"><div className="table-wrap"><table><thead><tr><th>キャスト</th>{stores.map((store) => <th key={store.id}>{store.shortName}<br />PV / UU / TEL</th>)}<th>合計<br />PV / UU / TEL</th><th>TEL率</th><th>掲載状態</th><th>CTI料金</th><th>女子報酬</th><th>成約</th></tr></thead><tbody>{[...rows.entries()].map(([castId, records]) => {
      const total = aggregateTown(records); const ctiRows = ctiByCast.get(castId) || [];
      const listing = stores.map((store) => listings.find((item) => item.castId === castId && item.storeId === store.id));
      return <tr key={castId}><td><Link href={`/analytics/casts/${castId}?from=${range.fromText}&to=${range.toText}`} className="font-medium text-emerald-700">{records[0].cast.displayName}</Link></td>{stores.map((store) => { const m = aggregateTown(records.filter((row) => row.storeId === store.id)); return <td key={store.id}>{n(m.pv)} / {n(m.uu)} / {n(m.telTapUu)}</td>; })}<td>{n(total.pv)} / {n(total.uu)} / {n(total.telTapUu)}</td><td>{total.conversionRate === null ? "—" : `${n(total.conversionRate * 100, 2)}%`}</td><td>{listing.map((item, index) => `${stores[index].shortName}:${item ? item.isListed ? "掲載" : "非掲載" : "未設定"}`).join(" / ")}</td><td>¥{n(ctiRows.reduce((sum, row) => sum + row.salesAmount, 0))}</td><td>¥{n(ctiRows.reduce((sum, row) => sum + row.castRewardAmount, 0))}</td><td>{n(ctiRows.reduce((sum, row) => sum + row.contractCount, 0))}</td></tr>;
    })}</tbody></table>{rows.size === 0 && <p className="empty-state">指定期間のタウン女子実績はありません。</p>}</div></section>
    <TownReferenceAnalysis rows={referenceRows} config={referenceConfig} />
  </>;
}
