"use client";

import { useState } from "react";
import { LoaderCircle, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { updateCastDisplayNameAction } from "@/app/actions/masters";

type Conflict = {
  id: string;
  displayName: string;
  primaryStoreName: string | null;
  startedOn: string;
  endedOn: string | null;
  overlaps: boolean;
};

export function CastDisplayNameForm({ castId, initialName }: { castId: string; initialName: string }) {
  const router = useRouter();
  const [currentName, setCurrentName] = useState(initialName);
  const [displayName, setDisplayName] = useState(initialName);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(confirmDuplicate: boolean) {
    setPending(true); setMessage(null); setError(null);
    const formData = new FormData();
    formData.set("id", castId);
    formData.set("displayName", displayName);
    formData.set("reason", reason);
    formData.set("confirmDuplicate", String(confirmDuplicate));
    try {
      const result = await updateCastDisplayNameAction(formData);
      if (result.status === "CONFIRMATION_REQUIRED") {
        setConflicts(result.conflicts);
        return;
      }
      setCurrentName(result.displayName);
      setDisplayName(result.displayName);
      setConflicts([]);
      setEditing(false);
      setReason("");
      setMessage(result.changed ? "表示名を変更しました" : "変更はありません");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "表示名の変更に失敗しました。");
    } finally { setPending(false); }
  }

  if (!editing) return <div className="min-w-[190px]">
    <div className="flex items-center gap-2"><span className="font-medium text-slate-900">{currentName}</span><button type="button" className="icon-button" title={`${currentName}の表示名を変更`} onClick={() => { setEditing(true); setMessage(null); }}><Pencil className="size-3.5" /></button></div>
    <div aria-live="polite" className="mt-1 text-[11px] text-emerald-700">{message}</div>
  </div>;

  return <div className="min-w-[270px] space-y-2">
    <label className="sr-only" htmlFor={`cast-name-${castId}`}>新しい内部表示名</label>
    <input id={`cast-name-${castId}`} value={displayName} maxLength={100} onChange={(event) => { setDisplayName(event.target.value); setConflicts([]); setError(null); }} className="compact-input w-full" />
    <input aria-label={`${currentName}の表示名変更理由`} value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="変更理由（任意）" className="compact-input w-full" />
    {conflicts.length > 0 && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
      <p className="font-semibold">同じ正規化名のキャストが存在します。</p>
      <ul className="mt-1 list-disc pl-4">{conflicts.map((conflict) => <li key={conflict.id}>{conflict.displayName}（{conflict.primaryStoreName || "主所属未設定"}、{conflict.startedOn}〜{conflict.endedOn || "在籍中"}）{conflict.overlaps ? "：在籍期間重複" : ""}</li>)}</ul>
      {conflicts.some((conflict) => conflict.overlaps) && <p className="mt-1 font-semibold">在籍期間が重複しています。別人であることを確認してから変更してください。</p>}
      <div className="mt-2 flex flex-wrap gap-2">{conflicts.map((conflict) => <a key={conflict.id} href={`/masters/casts/merge?sourceId=${castId}&targetId=${conflict.id}`} className="underline">既存「{conflict.displayName}」と統合</a>)}</div>
    </div>}
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending || !displayName.trim()} onClick={() => save(conflicts.length > 0)} className="secondary-button h-9 px-3 text-xs">{pending ? <LoaderCircle className="size-3 animate-spin" /> : conflicts.length > 0 ? "別人として変更" : "名前だけ変更"}</button>
      <button type="button" disabled={pending} onClick={() => { setEditing(false); setDisplayName(currentName); setReason(""); setConflicts([]); setError(null); }} className="icon-button h-9 px-2 text-xs">取消</button>
    </div>
  </div>;
}
