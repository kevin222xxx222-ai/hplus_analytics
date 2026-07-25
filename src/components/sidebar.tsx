"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, CircleCheck, LayoutDashboard, Link2, LogOut, MousePointerClick, Store, Tags, Target, UploadCloud, UserRoundCog, UsersRound } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import type { CurrentUser } from "@/lib/auth";

const nav = [
  { href: "/", label: "ホーム", icon: LayoutDashboard },
  { href: "/data-health", label: "DATA HEALTH", icon: CircleCheck },
  { href: "/imports", label: "CTI取込", icon: UploadCloud, admin: true },
  { href: "/imports/town", label: "タウン取込", icon: UploadCloud, admin: true },
  { href: "/imports/heaven", label: "Heaven取込", icon: UploadCloud, admin: true },
  { href: "/analytics/stores", label: "店舗実績", icon: Building2 },
  { href: "/analytics/casts", label: "キャスト実績", icon: BarChart3 },
  { href: "/analytics/casts/overview", label: "キャスト統合分析", icon: UsersRound },
  { href: "/analytics/cast", label: "キャスト分析", icon: UsersRound },
  { href: "/analytics/store", label: "店舗分析", icon: Building2 },
  { href: "/analytics/casts/discovery", label: "キャスト発見・分析", icon: UsersRound },
  { href: "/analytics/marketing-lab", label: "マーケティング分析", icon: BarChart3 },
  { href: "/analytics/navigator", label: "分析ナビゲーター", icon: LayoutDashboard },
  { href: "/analytics/performance", label: "実績ファネル", icon: BarChart3 },
  { href: "/analytics/trend", label: "推移分析", icon: BarChart3 },
  { href: "/analytics/time", label: "曜日分析", icon: BarChart3 },
  { href: "/analytics/diary", label: "写メ日記分析", icon: BarChart3 },
  { href: "/analytics/town/stores", label: "タウン店舗分析", icon: Building2 },
  { href: "/analytics/town/casts", label: "タウン女子分析", icon: UsersRound },
  { href: "/analytics/heaven/store", label: "Heaven店舗分析", icon: Building2 },
  { href: "/analytics/heaven/casts", label: "Heaven女子分析", icon: UsersRound },
  { href: "/settings/goals", label: "目標管理", icon: Target },
  { href: "/help/metrics", label: "指標ガイド", icon: Tags },
  { href: "/help/analytics-guide", label: "分析ガイド", icon: Link2 },
  { href: "/analytics/town/urls", label: "タウンURL分析", icon: Link2 },
  { href: "/analytics/town/landing", label: "タウンLP分析", icon: MousePointerClick },
  { href: "/masters/stores", label: "店舗マスタ", icon: Store, admin: true },
  { href: "/masters/casts", label: "キャスト管理", icon: UsersRound, admin: true },
  { href: "/masters/aliases", label: "エイリアス管理", icon: Tags, admin: true },
  { href: "/masters/import-sources", label: "媒体取込元", icon: UploadCloud, admin: true },
  { href: "/masters/users", label: "ユーザー管理", icon: UserRoundCog, admin: true },
];

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden h-screen h-[100dvh] w-[264px] flex-col overflow-hidden bg-[#10241f] px-4 py-5 text-slate-200 md:flex">
      <header className="shrink-0">
      <Link href="/" className="mb-8 flex items-center gap-3 px-2">
        <span className="grid size-10 place-items-center rounded-xl bg-emerald-400 text-[#10241f]"><BarChart3 className="size-5" /></span>
        <span><strong className="block text-sm tracking-[0.12em] text-white">HPLUS</strong><span className="text-[11px] tracking-[0.18em] text-emerald-200">ANALYTICS</span></span>
      </Link>
      <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.18em] text-slate-500">NAVIGATION</p>
      </header>
      <nav className="sidebar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1">
        {nav.filter((item) => !item.admin || user.role === "ADMIN").map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-white/8 hover:text-white ${pathname === href || pathname.startsWith(`${href}/`) ? "bg-white/12 text-white" : "text-slate-300"}`}>
            <Icon className="size-[18px]" />{label}
          </Link>
        ))}
      </nav>
      <footer className="mt-3 shrink-0 rounded-2xl border border-white/8 bg-white/5 p-3">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-emerald-300 text-sm font-bold text-emerald-950">{user.displayName.slice(0, 1)}</span>
          <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{user.displayName}</p><p className="text-[11px] text-slate-400">{user.role}</p></div>
        </div>
        <form action={logoutAction}><button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-400 hover:bg-white/8 hover:text-white"><LogOut className="size-4" />ログアウト</button></form>
      </footer>
    </aside>
  );
}
