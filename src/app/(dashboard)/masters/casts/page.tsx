import Link from "next/link";
import { CalendarRange, GitMerge, History, Plus, UserCheck, UserX } from "lucide-react";
import { createCastAction, setCastStatusAction } from "@/app/actions/masters";
import { CastDisplayNameForm } from "@/components/cast-display-name-form";
import { CastPrimaryStoreForm } from "@/components/cast-primary-store-form";
import { PageHeader } from "@/components/page-header";
import { CastStatus } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function CastsPage({ searchParams }: { searchParams: Promise<{ showMerged?: string }> }) {
  await requireAdmin();
  const showMerged = (await searchParams).showMerged === "true";
  const [casts, stores] = await Promise.all([
    prisma.cast.findMany({
      where: showMerged ? { mergedIntoCastId: { not: null } } : { mergedIntoCastId: null },
      include: {
        primaryStore: true,
        mergedInto: { select: { id: true, displayName: true } },
        aliases: { include: { store: true }, orderBy: [{ mediaType: "asc" }, { storeId: "asc" }, { aliasName: "asc" }] },
        nameHistories: { include: { changedBy: { select: { displayName: true } } }, orderBy: { changedAt: "desc" } },
      },
      orderBy: [{ status: "asc" }, { displayName: "asc" }],
    }),
    prisma.store.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" } }),
  ]);

  return <>
    <PageHeader title="キャスト管理" description="内部IDを維持したまま表示名・主所属・在籍状態を管理します。媒体名はAliasとして保持します。" />
    <div className="mb-5 flex flex-wrap gap-3"><Link href="/masters/casts/duplicates" className="secondary-button"><GitMerge className="size-4" />重複候補</Link><Link href="/masters/casts/merges" className="secondary-button"><History className="size-4" />統合履歴</Link><Link href="/masters/casts/start-date-maintenance" className="secondary-button"><CalendarRange className="size-4" />開始日一括前倒し</Link><Link href={showMerged ? "/masters/casts" : "/masters/casts?showMerged=true"} className="secondary-button">{showMerged ? "通常キャストを表示" : "統合済みを表示"}</Link></div>
    <section className="panel mb-6 p-5">
      <h2 className="text-base font-semibold text-slate-900">キャストを登録</h2>
      <form action={createCastAction} className="mt-4 grid gap-4 lg:grid-cols-[1fr_180px_220px_1fr_auto] lg:items-end">
        <div><label className="form-label">キャスト名</label><input name="displayName" required className="form-input mt-2" /></div>
        <div><label className="form-label">在籍開始日</label><input name="startedOn" type="date" required className="form-input mt-2" /></div>
        <div><label className="form-label">主所属店舗</label><select name="primaryStoreId" className="form-input mt-2"><option value="">未設定</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.shortName}</option>)}</select></div>
        <div><label className="form-label">メモ</label><input name="notes" className="form-input mt-2" /></div>
        <button className="primary-button"><Plus className="size-4" />登録</button>
      </form>
    </section>
    <section className="panel overflow-hidden">
      <div className="table-wrap">
        <table>
          <thead><tr><th>現在の表示名</th><th>内部ID</th><th>主所属</th><th>媒体Alias</th><th>表示名履歴</th><th>在籍開始</th><th>状態</th><th>変更</th></tr></thead>
          <tbody>{casts.map((cast) => <tr key={cast.id}>
            <td className="align-top">{cast.mergedIntoCastId ? <div><div className="font-medium">{cast.displayName}</div><span className="status-badge mt-1 bg-slate-100 text-slate-600">統合済み</span></div> : <CastDisplayNameForm castId={cast.id} initialName={cast.displayName} />}</td>
            <td className="align-top font-mono text-xs text-slate-400">{cast.id.slice(0, 8)}…</td>
            <td className="align-top">{cast.mergedIntoCastId ? <div>{cast.primaryStore?.shortName || "未設定"}<div className="mt-2 text-xs">統合先: <Link href={`/analytics/casts/${cast.mergedIntoCastId}`} className="text-emerald-700">{cast.mergedInto?.displayName}</Link></div><div className="text-xs text-slate-400">{cast.mergedAt?.toLocaleString("ja-JP")}</div></div> : <CastPrimaryStoreForm key={`${cast.id}:${cast.primaryStoreId || "none"}`} castId={cast.id} displayName={cast.displayName} initialStoreId={cast.primaryStoreId} stores={stores.map(({ id, shortName }) => ({ id, shortName }))} />}</td>
            <td className="align-top"><div className="min-w-[220px] space-y-1 text-xs">
              {cast.aliases.length === 0 && <span className="text-slate-400">Aliasなし</span>}
              {cast.aliases.map((alias) => <div key={alias.id}><span className="font-semibold text-slate-500">{alias.mediaType}{alias.store ? ` ${alias.store.shortName}` : ""}</span><span className="ml-2 text-slate-800">{alias.aliasName}</span></div>)}
            </div></td>
            <td className="align-top"><div className="min-w-[230px] space-y-1 text-xs">
              {cast.nameHistories.length === 0 && <span className="text-slate-400">履歴なし</span>}
              {cast.nameHistories.map((history) => <div key={history.id} className="rounded border border-slate-100 p-1.5"><div>{history.oldName} → <strong>{history.newName}</strong></div><div className="text-[11px] text-slate-400">{history.changedAt.toLocaleString("ja-JP")} / {history.changedBy.displayName}{history.reason ? ` / ${history.reason}` : ""}</div></div>)}
            </div></td>
            <td className="align-top">{cast.startedOn.toLocaleDateString("ja-JP")}</td>
            <td className="align-top"><span className={`status-badge ${cast.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{cast.status === "ACTIVE" ? "在籍" : "退店"}</span></td>
            <td className="align-top">{cast.mergedIntoCastId ? <span className="text-xs text-slate-400">変更不可</span> : <form action={setCastStatusAction} className="flex items-center gap-2"><input type="hidden" name="id" value={cast.id} /><input type="hidden" name="status" value={cast.status === CastStatus.ACTIVE ? CastStatus.INACTIVE : CastStatus.ACTIVE} />{cast.status === CastStatus.ACTIVE && <input type="date" name="endedOn" className="compact-input" required />}<button className="icon-button" title={cast.status === CastStatus.ACTIVE ? "退店にする" : "在籍に戻す"}>{cast.status === CastStatus.ACTIVE ? <UserX className="size-4" /> : <UserCheck className="size-4" />}</button></form>}</td>
          </tr>)}</tbody>
        </table>
        {casts.length === 0 && <p className="empty-state">キャストはまだ登録されていません。</p>}
      </div>
    </section>
  </>;
}
