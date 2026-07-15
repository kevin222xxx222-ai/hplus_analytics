import { PauseCircle, PlayCircle, Plus } from "lucide-react";
import { createUserAction, toggleUserAction } from "@/app/actions/masters";
import { PageHeader } from "@/components/page-header";
import { UserRole } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function UsersPage() {
  const admin = await requireAdmin();
  const users = await prisma.user.findMany({ orderBy: [{ isActive: "desc" }, { displayName: "asc" }] });
  return <><PageHeader title="ユーザー管理" description="ADMINは設定と取込を変更でき、VIEWERは閲覧のみです。パスワードはハッシュ化して保存します。" />
    <section className="panel mb-6 p-5"><h2 className="text-base font-semibold text-slate-900">ユーザーを追加</h2><form action={createUserAction} className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr_150px_1fr_auto] lg:items-end"><div><label className="form-label">表示名</label><input name="displayName" required className="form-input mt-2" /></div><div><label className="form-label">ログインID</label><input name="loginId" required minLength={3} className="form-input mt-2" /></div><div><label className="form-label">メール（任意）</label><input name="email" type="email" className="form-input mt-2" /></div><div><label className="form-label">権限</label><select name="role" className="form-input mt-2">{Object.values(UserRole).map((v) => <option key={v}>{v}</option>)}</select></div><div><label className="form-label">初期パスワード</label><input name="password" type="password" minLength={12} required className="form-input mt-2" /></div><button className="primary-button"><Plus className="size-4" />追加</button></form></section>
    <section className="panel overflow-hidden"><div className="table-wrap"><table><thead><tr><th>ユーザー</th><th>ログインID</th><th>メール</th><th>権限</th><th>状態</th><th>登録日</th><th></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td className="font-medium text-slate-900">{user.displayName}{user.id === admin.id && <span className="ml-2 text-xs text-emerald-700">自分</span>}</td><td>{user.loginId}</td><td>{user.email || "—"}</td><td><span className={`status-badge ${user.role === UserRole.ADMIN ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700"}`}>{user.role}</span></td><td>{user.isActive ? "有効" : "停止"}</td><td>{user.createdAt.toLocaleDateString("ja-JP")}</td><td>{user.id !== admin.id && <form action={toggleUserAction}><input type="hidden" name="id" value={user.id} /><input type="hidden" name="isActive" value={String(user.isActive)} /><button className="icon-button" title={user.isActive ? "停止" : "再開"}>{user.isActive ? <PauseCircle className="size-4" /> : <PlayCircle className="size-4" />}</button></form>}</td></tr>)}</tbody></table></div></section>
  </>;
}
