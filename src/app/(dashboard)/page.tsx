import Link from "next/link";
import { ArrowUpRight, Building2, CircleAlert, DatabaseZap, Tags, UsersRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const user = await requireUser();
  const [stores, casts, aliases, sources] = await Promise.all([
    prisma.store.count({ where: { isActive: true } }), prisma.cast.count({ where: { status: "ACTIVE" } }),
    prisma.castAlias.count({ where: { reviewStatus: "PENDING" } }), prisma.importSource.count({ where: { isActive: true } }),
  ]);
  const cards = [
    { label: "対象店舗", value: stores, note: "経営実績 3店舗", icon: Building2, color: "bg-emerald-50 text-emerald-700" },
    { label: "在籍キャスト", value: casts, note: "現在の有効マスタ", icon: UsersRound, color: "bg-sky-50 text-sky-700" },
    { label: "未紐付け", value: aliases, note: "管理者確認待ち", icon: CircleAlert, color: "bg-amber-50 text-amber-700" },
    { label: "有効な取込元", value: sources, note: "媒体・データ種別", icon: DatabaseZap, color: "bg-violet-50 text-violet-700" },
  ];
  return (
    <>
      <header className="mb-8 flex items-start justify-between gap-4"><div><p className="text-sm text-slate-500">{user.displayName}さん、お疲れさまです</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">分析基盤の準備状況</h1></div><span className="status-badge bg-emerald-50 text-emerald-700">Phase 2</span></header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, note, icon: Icon, color }) => <div key={label} className="panel p-5"><div className={`mb-5 grid size-10 place-items-center rounded-xl ${color}`}><Icon className="size-5" /></div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p><p className="mt-2 text-xs text-slate-400">{note}</p></div>)}</section>
      <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="panel p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-slate-900">マスタ設定</h2><p className="mt-1 text-sm text-slate-500">データ取込前に確認する基本情報</p></div><Tags className="size-5 text-slate-400" /></div><div className="grid gap-3 sm:grid-cols-2">{[
          ["店舗", "集客対象と経営実績対象を管理", "/masters/stores"], ["キャスト", "在籍期間と内部IDを管理", "/masters/casts"],
          ["エイリアス", "媒体名を内部キャストへ紐付け", "/masters/aliases"], ["媒体取込元", "店舗・媒体・データ種別を定義", "/masters/import-sources"],
        ].map(([title, desc, href]) => <Link key={href} href={href} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm"><div className="flex items-center justify-between"><p className="font-medium text-slate-800">{title}</p><ArrowUpRight className="size-4 text-slate-400 group-hover:text-emerald-700" /></div><p className="mt-2 text-xs leading-5 text-slate-500">{desc}</p></Link>)}</div></div>
        <div className="panel overflow-hidden"><div className="bg-[#173a31] p-6 text-white"><p className="text-xs font-bold tracking-[0.15em] text-emerald-300">PHASE 2 READY</p><h2 className="mt-3 text-xl font-semibold">CTI女子別レポート取込</h2><p className="mt-3 text-sm leading-6 text-slate-300">XLSX検証、取込履歴、未紐付け確認、日次実績と基本分析を利用できます。</p></div><div className="p-5"><p className="text-xs font-semibold text-slate-500">Phase 2 の状態</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-full rounded-full bg-emerald-500" /></div><div className="mt-3 flex items-center justify-between"><p className="text-xs font-medium text-emerald-700">CTI取込実装済み</p><Link href="/imports" className="text-xs font-semibold text-emerald-700 hover:text-emerald-900">取込画面へ →</Link></div></div></div>
      </section>
    </>
  );
}
