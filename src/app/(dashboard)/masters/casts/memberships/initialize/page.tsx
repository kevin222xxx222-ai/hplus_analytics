import Link from "next/link";
import { initializeCurrentMembershipsAction } from "@/app/actions/memberships";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { loadCurrentMembershipCandidates, summarizeCurrentMembershipCandidates } from "@/lib/casts/current-membership-evidence";

const dateText = (value: Date | null) => value ? value.toISOString().slice(0, 10) : "—";
const shortId = (value: string | null) => value ? `${value.slice(0, 8)}…` : "—";

export default async function CurrentMembershipInitializationPage() {
  const user = await requireUser();
  const candidates = await loadCurrentMembershipCandidates();
  const create = candidates.filter((candidate) => candidate.decision === "CREATE_ACTIVE");
  const summary = summarizeCurrentMembershipCandidates(candidates);
  const storeCounts = new Map<string, number>();
  for (const candidate of create) storeCounts.set(candidate.storeName, (storeCounts.get(candidate.storeName) ?? 0) + 1);
  const ids = JSON.stringify(create.map((candidate) => `${candidate.castId}:${candidate.storeId}`));
  const reviewCount = (decision: string) => candidates.filter((candidate) => candidate.decision === decision).length;
  const validationError = summary.createActiveTotal !== summary.townOnly + summary.ctiOnly + summary.both || summary.createActiveTotal !== Object.values(summary.storeCounts).reduce((total, count) => total + count, 0) || summary.duplicateCastStoreCount !== 0 || summary.invalidBatchStatusCount !== 0;

  return <>
    <PageHeader title="現在Membership初期化 Preview" description="source×storeの最新成功Datasetに存在するCastだけを作成候補とします。Preview表示だけではDBを変更しません。" />
    <div className="mb-4"><Link href="/masters/casts/memberships" className="text-sm text-emerald-700 hover:underline">在籍履歴レビューへ戻る</Link></div>
    <section className="panel p-5">
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-7">
        <span>総候補行: <strong>{candidates.length}</strong></span><span>作成予定: <strong>{create.length}</strong></span><span>既存ACTIVE: <strong>{reviewCount("NOOP")}</strong></span><span>再入店確認: <strong>{reviewCount("REENTRY_REVIEW")}</strong></span><span>休業確認: <strong>{reviewCount("ON_LEAVE_REVIEW")}</strong></span><span>Legacy矛盾: <strong>{reviewCount("LEGACY_STATUS_CONFLICT")}</strong></span><span>Heaven要確認: <strong>{reviewCount("HEAVEN_CURRENT_REVIEW")}</strong></span>
      </div>
      <div className="mt-3 text-sm">Current Evidenceなし: <strong>{reviewCount("NO_EVIDENCE")}</strong></div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">{[...storeCounts].map(([store, count]) => <span key={store} className="status-badge bg-slate-100 text-slate-600">{store}: {count}</span>)}</div>
    </section>
    <section className="panel mt-5 p-5">
      <h2 className="font-semibold">監査集計</h2>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4"><span>Town CASTのみ: <strong>{summary.townOnly}</strong></span><span>CTIのみ: <strong>{summary.ctiOnly}</strong></span><span>Town CAST + CTI: <strong>{summary.both}</strong></span><span>重複cast/store: <strong>{summary.duplicateCastStoreCount}</strong></span><span>Batch status不正: <strong>{summary.invalidBatchStatusCount}</strong></span></div>
      {validationError ? <p className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">監査ERROR: 集計式、重複、またはBatch status検証に失敗しています。Confirmしないでください。</p> : <p className="mt-3 rounded bg-emerald-50 p-3 text-sm text-emerald-700">監査PASS: source内訳・店舗内訳・重複・Batch statusの検証に成功しました。</p>}
      <div className="mt-4 table-wrap"><table><thead><tr><th>Source</th><th>店舗</th><th>Latest targetTo</th><th>ImportBatch</th><th>Status</th><th>File</th></tr></thead><tbody>{summary.datasets.map((dataset) => <tr key={`${dataset.source}:${dataset.storeId}`}><td>{dataset.source}</td><td>{dataset.storeName}</td><td>{dateText(dataset.trace.date)}</td><td title={dataset.trace.batchId}>{shortId(dataset.trace.batchId)}</td><td>{dataset.trace.status}</td><td>{dataset.trace.fileName}</td></tr>)}</tbody></table></div>
    </section>
    <section className="panel mt-5 overflow-hidden"><div className="table-wrap"><table><thead><tr><th>Cast</th><th>店舗</th><th>Source</th><th>Town Dataset</th><th>CTI Dataset</th><th>Evidence</th><th>判定</th></tr></thead><tbody>{create.map((candidate) => <tr key={`${candidate.castId}:${candidate.storeId}`}><td>{candidate.displayName}</td><td>{candidate.storeName}</td><td>{candidate.evidence.townCurrent && candidate.evidence.ctiCurrent ? "Town CAST + CTI" : candidate.evidence.townCurrent ? "Town CAST" : "CTI"}</td><td>{candidate.evidence.townDataset ? `${dateText(candidate.evidence.townDataset.date)} / ${shortId(candidate.evidence.townDataset.batchId)}` : "—"}</td><td>{candidate.evidence.ctiDataset ? `${dateText(candidate.evidence.ctiDataset.date)} / ${shortId(candidate.evidence.ctiDataset.batchId)}` : "—"}</td><td>{candidate.evidence.reasons.join(" / ")}</td><td>{candidate.decision}</td></tr>)}</tbody></table>{create.length === 0 && <p className="empty-state">CREATE_ACTIVE候補はありません。</p>}</div></section>
    {create.length > 0 && <section className="panel mt-5 p-5"><p className="text-sm">Adminが明示Confirmした場合のみ、監査PASS済みのCREATE_ACTIVE候補をACTIVE・joinedAt=NULLで登録します。退店日やFact日付は生成しません。</p>{user.role === "ADMIN" ? <form action={initializeCurrentMembershipsAction} className="mt-3"><input type="hidden" name="candidateIds" value={ids} /><button className="primary-button" disabled={validationError}>現在在籍Membershipを初期登録（Confirm）</button></form> : <p className="mt-3 text-sm text-slate-500">ViewerはPreviewのみ閲覧できます。</p>}</section>}
  </>;
}
