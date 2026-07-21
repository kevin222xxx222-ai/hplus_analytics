import { DateRangeForm } from "@/components/date-range-form";
import { PageHeader } from "@/components/page-header";
import { TownPageType } from "@/generated/prisma/client";
import { resolveDateRange } from "@/lib/analytics/cti";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function n(value: number | null, digits = 0) { return value === null ? "—" : value.toLocaleString("ja-JP", { maximumFractionDigits: digits }); }

export default async function TownLandingAnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; scope?: string; pageType?: string; castId?: string }> }) {
  await requireUser(); const query = await searchParams; const range = resolveDateRange(query.from, query.to);
  const [stores, casts] = await Promise.all([prisma.store.findMany({ where: { hasAcquisitionMetrics: true }, orderBy: { displayOrder: "asc" } }), prisma.cast.findMany({ where: { mergedIntoCastId: null }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } })]);
  const store = stores.find((item) => item.code === query.scope); const pageType = Object.values(TownPageType).includes(query.pageType as TownPageType) ? query.pageType as TownPageType : null;
  const records = await prisma.townLandingDaily.findMany({ where: { date: { gte: range.from, lte: range.to }, ...(store ? { storeId: store.id } : {}), ...(pageType ? { pageType } : {}), ...(query.castId ? { castId: query.castId } : {}) }, include: { store: true, cast: true }, orderBy: [{ uu: "desc" }, { landingUrl: "asc" }] });
  const uu = records.reduce((sum, row) => sum + row.uu, 0), tel = records.reduce((sum, row) => sum + row.telTapUu, 0);
  const bounceWeight = records.reduce((sum, row) => sum + (row.bounceRate === null ? 0 : row.uu), 0);
  const bounce = bounceWeight === 0 ? null : records.reduce((sum, row) => sum + (row.bounceRate === null ? 0 : Number(row.bounceRate) * row.uu), 0) / bounceWeight;
  const extra = <><div><label className="form-label">店舗</label><select name="scope" defaultValue={store?.code || "ALL"} className="form-input mt-2"><option value="ALL">全体</option>{stores.map((item) => <option key={item.id} value={item.code}>{item.shortName}</option>)}</select></div><div><label className="form-label">ページ種別</label><select name="pageType" defaultValue={pageType || "ALL"} className="form-input mt-2"><option value="ALL">すべて</option>{Object.values(TownPageType).map((value) => <option key={value}>{value}</option>)}</select></div><div><label className="form-label">キャスト</label><select name="castId" defaultValue={query.castId || ""} className="form-input mt-2"><option value="">すべて</option>{casts.map((cast) => <option key={cast.id} value={cast.id}>{cast.displayName}</option>)}</select></div></>;
  return <><PageHeader eyebrow="TOWN LANDING" title="タウンLP分析" description="最初にアクセスされた入口ページをURL別実績とは分離して集計します。" /><DateRangeForm from={range.fromText} to={range.toText} extra={extra} />
    <section className="mb-6 grid gap-4 sm:grid-cols-4">{[["UU", n(uu)], ["直帰率", bounce === null ? "—" : `${n(bounce * 100, 1)}%`], ["TEL", n(tel)], ["TEL率", uu === 0 ? "—" : `${n(tel / uu * 100, 2)}%`]].map(([label, value]) => <div className="panel p-5" key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</section>
    <section className="panel overflow-hidden"><div className="table-wrap"><table><thead><tr><th>ランディングページ</th><th>ページ種別</th><th>UU</th><th>直帰率</th><th>TEL</th><th>TEL率</th><th>キャスト</th><th>店舗</th></tr></thead><tbody>{records.map((row) => <tr key={row.id}><td className="max-w-[520px] break-all font-medium text-slate-900">{row.normalizedUrl}</td><td>{row.pageType}</td><td>{n(row.uu)}</td><td>{row.bounceRate === null ? "—" : `${n(Number(row.bounceRate) * 100, 1)}%`}</td><td>{n(row.telTapUu)}</td><td>{row.conversionRate === null ? "—" : `${n(Number(row.conversionRate) * 100, 2)}%`}</td><td>{row.cast?.displayName || row.sourceCastName || "—"}</td><td>{row.store.shortName}</td></tr>)}</tbody></table>{records.length === 0 && <p className="empty-state">条件に一致するLP実績はありません。</p>}</div></section>
  </>;
}
