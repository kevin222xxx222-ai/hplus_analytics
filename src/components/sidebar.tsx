"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import type { CurrentUser } from "@/lib/auth";

type SidebarItem = { href: string; label: string; admin?: boolean };
type SidebarSection = { label: string; items: SidebarItem[] };
type SidebarGroup = { id: string; label: string; items?: SidebarItem[]; sections?: SidebarSection[] };

const primaryItems: SidebarItem[] = [
  { href: "/", label: "ホーム" },
  { href: "/analytics/management", label: "全店舗ダッシュボード" },
  { href: "/analytics/store", label: "店舗分析" },
  { href: "/analytics/trend", label: "推移分析" },
  { href: "/analytics/time", label: "曜日分析" },
  { href: "/analytics/cast", label: "キャスト分析" },
  { href: "/analytics/diary", label: "写メ日記分析" },
];

const groups: SidebarGroup[] = [
  {
    id: "media",
    label: "媒体",
    sections: [
      { label: "Town", items: [{ href: "/analytics/town/stores", label: "タウン店舗分析" }, { href: "/analytics/town/casts", label: "タウン女子分析" }, { href: "/analytics/town/urls", label: "タウンURL分析" }, { href: "/analytics/town/landing", label: "タウンLP分析" }] },
      { label: "Heaven", items: [{ href: "/analytics/heaven/store", label: "Heaven店舗分析" }, { href: "/analytics/heaven/casts", label: "Heaven女子分析" }] },
    ],
  },
  { id: "management", label: "管理", items: [{ href: "/data-health", label: "DATA HEALTH" }, { href: "/settings/goals", label: "目標管理" }] },
  { id: "imports", label: "データ取込", items: [{ href: "/imports", label: "CTI取込", admin: true }, { href: "/imports/town", label: "タウン取込", admin: true }, { href: "/imports/heaven", label: "Heaven取込", admin: true }, { href: "/masters/import-sources", label: "媒体取込元", admin: true }] },
  { id: "masters", label: "マスタ管理", items: [{ href: "/masters/stores", label: "店舗マスタ", admin: true }, { href: "/masters/casts", label: "キャスト管理", admin: true }, { href: "/masters/aliases", label: "エイリアス管理", admin: true }, { href: "/masters/users", label: "ユーザー管理", admin: true }] },
  { id: "guides", label: "ガイド", items: [{ href: "/help/metrics", label: "指標ガイド" }, { href: "/help/analytics-guide", label: "分析ガイド" }] },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function groupContainsPath(group: SidebarGroup, pathname: string) {
  const items = [...(group.items ?? []), ...(group.sections?.flatMap((section) => section.items) ?? [])];
  return items.some((item) => isActive(pathname, item.href));
}

function visible(item: SidebarItem, user: CurrentUser) {
  return !item.admin || user.role === "ADMIN";
}

function SidebarLink({ item, pathname, indented = false }: { item: SidebarItem; pathname: string; indented?: boolean }) {
  const active = isActive(pathname, item.href);
  return <Link href={item.href} aria-current={active ? "page" : undefined} className={`block min-w-0 truncate rounded-xl py-2.5 text-sm transition hover:bg-white/8 hover:text-white ${indented ? "pl-7 pr-3" : "px-3"} ${active ? "bg-white/12 text-white" : "text-slate-300"}`}>{item.label}</Link>;
}

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map((group) => [group.id, groupContainsPath(group, pathname)])));
  const activeGroup = groups.find((group) => groupContainsPath(group, pathname));
  const effectiveOpenGroups = activeGroup ? { ...openGroups, [activeGroup.id]: true } : openGroups;

  return <aside className="fixed inset-y-0 left-0 z-40 hidden h-screen h-[100dvh] w-[264px] flex-col overflow-hidden bg-[#10241f] px-4 py-5 text-slate-200 md:flex">
    <header className="shrink-0">
      <Link href="/" className="mb-8 block min-w-0 truncate px-2"><strong className="block text-sm tracking-[0.12em] text-white">HPLUS</strong><span className="text-[11px] tracking-[0.18em] text-emerald-200">ANALYTICS</span></Link>
      <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.18em] text-slate-500">NAVIGATION</p>
    </header>
    <nav aria-label="メインナビゲーション" className="sidebar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1">
      <div className="space-y-1">{primaryItems.map((item) => <SidebarLink item={item} pathname={pathname} key={item.href} />)}</div>
      <div className="my-4 border-t border-white/8" aria-hidden="true" />
      <div className="space-y-1">{groups.map((group) => {
        const open = Boolean(effectiveOpenGroups[group.id]);
        const items = (group.items ?? []).filter((item) => visible(item, user));
        const sections = (group.sections ?? []).map((section) => ({ ...section, items: section.items.filter((item) => visible(item, user)) })).filter((section) => section.items.length > 0);
        if (items.length === 0 && sections.length === 0) return null;
        return <section key={group.id}>
          <button type="button" aria-expanded={open} onClick={() => setOpenGroups((current) => ({ ...current, [group.id]: !open }))} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-400 transition hover:bg-white/8 hover:text-white"><span>{group.label}</span><span aria-hidden="true" className="text-sm leading-none">{open ? "⌄" : "›"}</span></button>
          {open && <div className="space-y-1 pb-1">{sections.map((section) => <div key={section.label} className="pt-1"><p className="px-7 py-1 text-[10px] font-semibold tracking-wide text-slate-500">{section.label}</p>{section.items.map((item) => <SidebarLink item={item} pathname={pathname} indented key={item.href} />)}</div>)}{items.map((item) => <SidebarLink item={item} pathname={pathname} indented key={item.href} />)}</div>}
        </section>;
      })}</div>
    </nav>
    <footer className="mt-3 shrink-0 rounded-2xl border border-white/8 bg-white/5 p-3">
      <div className="mb-3 min-w-0"><p className="truncate text-sm font-medium text-white">{user.displayName}</p><p className="text-[11px] text-slate-400">{user.role}</p></div>
      <form action={logoutAction}><button className="w-full rounded-lg px-2 py-2 text-left text-xs text-slate-400 hover:bg-white/8 hover:text-white">ログアウト</button></form>
    </footer>
  </aside>;
}
