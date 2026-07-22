"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { HeavenBulkAliasApprovalPreview } from "@/lib/imports/heaven/service";

export function HeavenBulkAliasApproval({ preview }: { preview: HeavenBulkAliasApprovalPreview }) {
  const router = useRouter();
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!preview.candidateCount) return null;
  const executable = preview.executableCount === preview.candidateCount && preview.candidateCount > 0;
  async function execute() {
    if (lock.current || !executable) return;
    if (!window.confirm(`${preview.candidateCount}名・${preview.targetRowCount}行にHeaven Aliasを作成し、再解析します。実行しますか？`)) return;
    lock.current = true; setPending(true); setMessage(null); setError(null);
    try {
      const response = await fetch(`/api/imports/heaven/${preview.batchId}/bulk-alias`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`${result.errorCode || "HEAVEN_BULK_ALIAS_APPROVAL_FAILED"}: ${result.error || "一括承認に失敗しました。"}`);
      setMessage(`完了：Alias ${result.createdAliasCount ?? 0}件 / 解決 ${result.resolvedPeople ?? 0}名・${result.resolvedRows ?? 0}行 / 残り ${result.remainingPeople ?? 0}名・${result.remainingRows ?? 0}行 / status ${result.status || "—"}`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "一括承認に失敗しました。"); }
    finally { setPending(false); lock.current = false; }
  }
  return <section className="panel mt-6 p-5" aria-label="Heaven安全候補一括承認">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">安全候補の一括承認</h2><p className="mt-1 text-sm text-slate-600">Town Aliasが単一Castを指し、対象期間と在籍期間が一致する候補のみです。</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">実行可能 {preview.executableCount}件</span></div>
    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><dt>対象人数</dt><dd>{preview.candidateCount}</dd></div><div><dt>対象行数</dt><dd>{preview.targetRowCount}</dd></div><div><dt>既存Heaven Alias</dt><dd>{preview.existingHeavenAliasCount}</dd></div><div><dt>衝突</dt><dd>{preview.collisionCount}</dd></div></dl>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr><th className="p-2">Heaven Alias</th><th className="p-2">推奨Cast / ID</th><th className="p-2">在籍期間</th><th className="p-2">Town Alias</th><th className="p-2">Heaven予定期間</th><th className="p-2">行数</th></tr></thead><tbody>{preview.candidates.map((candidate) => <tr key={candidate.normalizedAliasName} className="border-t"><td className="p-2">{candidate.aliasName}<br /><span className="text-xs text-slate-500">{candidate.normalizedAliasName}</span></td><td className="p-2">{candidate.castDisplayName}<br /><span className="text-xs text-slate-500">{candidate.castId}</span></td><td className="p-2">{candidate.castStartedOn}〜{candidate.castEndedOn || "在籍中"}</td><td className="p-2">{candidate.townAliasName}<br /><span className="text-xs text-slate-500">{candidate.townAliasValidFrom || "—"}〜{candidate.townAliasValidTo || "—"}</span></td><td className="p-2">{candidate.plannedValidFrom}〜{candidate.plannedValidTo || "—"}</td><td className="p-2">{candidate.targetRows}</td></tr>)}</tbody></table></div>
    <div className="mt-4 flex flex-wrap gap-3"><button type="button" className="primary-button" disabled={pending || !executable} onClick={() => void execute()}>{pending ? "一括承認中…" : `安全候補${preview.candidateCount}名を一括承認`}</button></div>
    {!executable && <p className="mt-2 text-sm text-amber-700">{preview.blockedReasons.join(" ") || "実行条件を満たしていません。"}</p>}
    {message && <p className="mt-3 text-sm text-emerald-700" role="status">{message}</p>}{error && <p className="mt-3 whitespace-pre-wrap text-sm text-red-700" role="alert">{error}</p>}
  </section>;
}
