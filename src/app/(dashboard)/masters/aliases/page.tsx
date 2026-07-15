import { Link2, Plus } from "lucide-react";
import { createAliasAction, mapAliasAction } from "@/app/actions/masters";
import { PageHeader } from "@/components/page-header";
import { AliasReviewStatus, MediaType } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AliasesPage() {
  await requireAdmin();
  const [aliases, casts, stores] = await Promise.all([
    prisma.castAlias.findMany({ include: { cast: true, store: true }, orderBy: [{ reviewStatus: "asc" }, { createdAt: "desc" }] }),
    prisma.cast.findMany({ where: { status: "ACTIVE" }, orderBy: { displayName: "asc" } }), prisma.store.findMany({ orderBy: { displayOrder: "asc" } }),
  ]);
  return <><PageHeader title="エイリアス管理" description="CTI・タウン・ヘブン上の名前を内部キャストIDへ紐付けます。かな表記の違いは自動統合しません。" />
    <section className="panel mb-6 p-5"><h2 className="text-base font-semibold text-slate-900">エイリアスを追加</h2><form action={createAliasAction} className="mt-4 grid gap-4 lg:grid-cols-[140px_1fr_180px_1fr_auto] lg:items-end"><div><label className="form-label">媒体</label><select name="mediaType" className="form-input mt-2">{Object.values(MediaType).map((v) => <option key={v}>{v}</option>)}</select></div><div><label className="form-label">媒体上の名前</label><input name="aliasName" required className="form-input mt-2" /></div><div><label className="form-label">店舗</label><select name="storeId" className="form-input mt-2"><option value="">共通 / 未設定</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.shortName}</option>)}</select></div><div><label className="form-label">紐付け先</label><select name="castId" className="form-input mt-2"><option value="">確認待ち</option>{casts.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}</select></div><button className="primary-button"><Plus className="size-4" />追加</button></form></section>
    <section className="panel overflow-hidden"><div className="table-wrap"><table><thead><tr><th>媒体</th><th>媒体上の名前</th><th>店舗</th><th>紐付け先</th><th>確認状態</th><th>更新</th></tr></thead><tbody>{aliases.map((alias) => <tr key={alias.id}><td><span className="status-badge bg-slate-100 text-slate-600">{alias.mediaType}</span></td><td className="font-medium text-slate-900">{alias.aliasName}</td><td>{alias.store?.shortName || "—"}</td><td>{alias.cast?.displayName || "未紐付け"}</td><td>{alias.reviewStatus}</td><td><form action={mapAliasAction} className="flex min-w-[330px] items-center gap-2"><input type="hidden" name="id" value={alias.id} /><select name="castId" defaultValue={alias.castId || ""} className="compact-input flex-1"><option value="">選択してください</option>{casts.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}</select><select name="reviewStatus" defaultValue={alias.reviewStatus} className="compact-input">{Object.values(AliasReviewStatus).map((v) => <option key={v}>{v}</option>)}</select><button className="icon-button" title="更新"><Link2 className="size-4" /></button></form></td></tr>)}</tbody></table>{aliases.length === 0 && <p className="empty-state">エイリアスはまだ登録されていません。</p>}</div></section>
  </>;
}
