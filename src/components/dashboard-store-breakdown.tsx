import Link from "next/link";

type Row = { name: string; sales: number; reward: number; contracts: number; days: number; minutes: number; regularRate: number | null; pv: number; uu: number; tel: number; heaven: number };
const n = (v: number, d = 0) => v.toLocaleString("ja-JP", { maximumFractionDigits: d });
const y = (v: number) => `¥${n(v)}`;
const p = (v: number | null) => v === null ? "—" : `${n(v * 100, 1)}%`;

export function DashboardStoreBreakdown({ rows, range, townEnabled, heavenEnabled }: { rows: Row[]; range: { fromText: string; toText: string }; townEnabled: boolean; heavenEnabled: boolean }) {
  return <section className="panel mb-6 overflow-hidden p-6"><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold text-slate-900">店舗別内訳</h2><p className="mt-1 text-sm text-slate-500">全体表示では店舗別の差異を確認してからドリルダウンできます。</p></div><div className="flex gap-2 text-xs"><Link href={`/?period=custom&from=${range.fromText}&to=${range.toText}&scope=KASUKABE`} className="text-emerald-700 underline">春日部</Link><Link href={`/?period=custom&from=${range.fromText}&to=${range.toText}&scope=KOSHIGAYA`} className="text-emerald-700 underline">越谷</Link><Link href={`/?period=custom&from=${range.fromText}&to=${range.toText}&scope=NODA`} className="text-emerald-700 underline">野田</Link></div></div><div className="table-wrap mt-4"><table><thead><tr><th>店舗</th><th>売上</th><th>女子報酬</th><th>成約</th><th>出勤日数</th><th>出勤時間</th><th>本指名率</th><th>Town PV / UU / TEL</th><th>Heaven PAGE_ACCESS</th></tr></thead><tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td>{y(r.sales)}</td><td>{y(r.reward)}</td><td>{n(r.contracts)}</td><td>{n(r.days)}</td><td>{n(r.minutes / 60, 1)}h</td><td>{p(r.regularRate)}</td><td>{townEnabled ? `${n(r.pv)} / ${n(r.uu)} / ${n(r.tel)}` : "—"}</td><td>{heavenEnabled ? n(r.heaven) : "—"}</td></tr>)}</tbody></table></div></section>;
}
