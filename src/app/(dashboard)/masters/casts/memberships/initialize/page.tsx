import Link from "next/link";
import { initializeCurrentMembershipsAction } from "@/app/actions/memberships";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { loadCurrentMembershipCandidates } from "@/lib/casts/current-membership-evidence";

export default async function CurrentMembershipInitializationPage() {
  const user = await requireUser();
  const candidates = await loadCurrentMembershipCandidates();
  const create = candidates.filter((candidate) => candidate.decision === "CREATE_ACTIVE");
  const storeCounts = new Map<string, number>();
  for (const candidate of create) storeCounts.set(candidate.storeName, (storeCounts.get(candidate.storeName) ?? 0) + 1);
  const ids = JSON.stringify(create.map((candidate) => `${candidate.castId}:${candidate.storeId}`));
  return <><PageHeader title="現在Membership初期化 Preview" description="現在媒体Evidenceから、作成予定のACTIVE Membershipを確認します。Preview表示だけではDBを変更しません。" /><div className="mb-4"><Link href="/masters/casts/memberships" className="text-sm text-emerald-700 hover:underline">在籍履歴レビューへ戻る</Link></div><section className="panel p-5"><div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5"><span>総候補行: <strong>{candidates.length}</strong></span><span>作成予定: <strong>{create.length}</strong></span><span>既存ACTIVE: <strong>{candidates.filter((c) => c.decision === "NOOP").length}</strong></span><span>再入店確認: <strong>{candidates.filter((c) => c.decision === "REENTRY_REVIEW").length}</strong></span><span>休業確認: <strong>{candidates.filter((c) => c.decision === "ON_LEAVE_REVIEW").length}</strong></span></div><div className="mt-4 flex flex-wrap gap-2 text-xs">{[...storeCounts].map(([store, count]) => <span key={store} className="status-badge bg-slate-100 text-slate-600">{store}: {count}</span>)}</div></section><section className="panel mt-5 overflow-hidden"><div className="table-wrap"><table><thead><tr><th>Cast</th><th>店舗</th><th>現在Evidence</th><th>作成内容</th></tr></thead><tbody>{create.map((candidate) => <tr key={`${candidate.castId}:${candidate.storeId}`}><td>{candidate.displayName}</td><td>{candidate.storeName}</td><td>{candidate.evidence.reasons.join(" / ")}</td><td>在籍 / 入店日不明</td></tr>)}</tbody></table>{create.length === 0 && <p className="empty-state">自動初期化候補はありません。</p>}</div></section>{create.length > 0 && <section className="panel mt-5 p-5"><p className="text-sm">Adminが明示Confirmした場合のみ、上記候補をACTIVE・joinedAt=NULLで登録します。退店日やFact日付は生成しません。</p>{user.role === "ADMIN" ? <form action={initializeCurrentMembershipsAction} className="mt-3"><input type="hidden" name="candidateIds" value={ids} /><button className="primary-button">現在在籍Membershipを初期登録（Confirm）</button></form> : <p className="mt-3 text-sm text-slate-500">ViewerはPreviewのみ閲覧できます。</p>}</section>}</>;
}
