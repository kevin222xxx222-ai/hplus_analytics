"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, LayoutDashboard, Link2, LogOut, MousePointerClick, Store, Tags, UploadCloud, UserRoundCog, UsersRound } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import type { CurrentUser } from "@/lib/auth";

const nav = [
  { href: "/", label: "ホーム", icon: LayoutDashboard },
  { href: "/imports", label: "CTI取込", icon: UploadCloud, admin: true },
  { href: "/imports/town", label: "タウン取込", icon: UploadCloud, admin: true },
  { href: "/imports/heaven", label: "Heaven取込", icon: UploadCloud, admin: true },
  { href: "/analytics/stores", label: "店舗実績", icon: Building2 },
  { href: "/analytics/casts", label: "キャスト実績", icon: BarChart3 },
  { href: "/analytics/casts/overview", label: "キャスト統合分析", icon: UsersRound },
  { href: "/analytics/town/stores", label: "タウン店舗分析", icon: Building2 },
  { href: "/analytics/town/casts", label: "タウン女子分析", icon: UsersRound },
  { href: "/analytics/heaven/store", label: "Heaven店舗分析", icon: Building2 },
  { href: "/analytics/heaven/casts", label: "Heaven女子分析", icon: UsersRound },
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
    <aside className="flex min-h-screen w-[264px] shrink-0 flex-col bg-[#10241f] px-4 py-5 text-slate-200">
      <Link href="/" className="mb-8 flex items-center gap-3 px-2">
        <span className="grid size-10 place-items-center rounded-xl bg-emerald-400 text-[#10241f]"><BarChart3 className="size-5" /></span>
        <span><strong className="block text-sm tracking-[0.12em] text-white">HPLUS</strong><span className="text-[11px] tracking-[0.18em] text-emerald-200">ANALYTICS</span></span>
      </Link>
      <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.18em] text-slate-500">NAVIGATION</p>
      <nav className="space-y-1">
        {nav.filter((item) => !item.admin || user.role === "ADMIN").map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-white/8 hover:text-white ${pathname === href || pathname.startsWith(`${href}/`) ? "bg-white/12 text-white" : "text-slate-300"}`}>
            <Icon className="size-[18px]" />{label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto rounded-2xl border border-white/8 bg-white/5 p-3">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-emerald-300 text-sm font-bold text-emerald-950">{user.displayName.slice(0, 1)}</span>
          <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{user.displayName}</p><p className="text-[11px] text-slate-400">{user.role}</p></div>
        </div>
        <form action={logoutAction}><button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-400 hover:bg-white/8 hover:text-white"><LogOut className="size-4" />ログアウト</button></form>
      </div>
    </aside>
  );
}
