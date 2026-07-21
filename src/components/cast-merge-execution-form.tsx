"use client";

import { useState } from "react";
import { LoaderCircle, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { executeCastMergeAction } from "@/app/actions/masters";

type StoreOption = { id: string; shortName: string };
type Recommended = { displayName: string; primaryStoreId: string | null; startedOn: string; endedOn: string | null; notes: string };

export function CastMergeExecutionForm({ sourceCastId, targetCastId, sourceName, targetName, fingerprint, recommended, stores, canMerge }: {
  sourceCastId: string; targetCastId: string; sourceName: string; targetName: string; fingerprint: string;
  recommended: Recommended; stores: StoreOption[]; canMerge: boolean;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null);
    try {
      const result = await executeCastMergeAction(new FormData(event.currentTarget));
      router.push(`/masters/casts/merges?completed=${result.historyId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "キャスト統合に失敗しました。");
      setPending(false);
    }
  }

  return <form onSubmit={submit} className="panel space-y-5 p-5">
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><ShieldAlert className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">この操作は関連データのCast IDを一括変更します。</p><p className="mt-1">統合元「{sourceName}」を統合先「{targetName}」へ移行します。実績値は加算しません。</p></div></div>
    <input type="hidden" name="sourceCastId" value={sourceCastId} />
    <input type="hidden" name="targetCastId" value={targetCastId} />
    <input type="hidden" name="expectedFingerprint" value={fingerprint} />
    <div className="grid gap-4 md:grid-cols-2">
      <div><label className="form-label">統合後の表示名</label><input name="displayName" defaultValue={recommended.displayName} required maxLength={100} className="form-input mt-2" /></div>
      <div><label className="form-label">統合後の主所属</label><select name="primaryStoreId" defaultValue={recommended.primaryStoreId || ""} className="form-input mt-2"><option value="">未設定</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.shortName}</option>)}</select></div>
      <div><label className="form-label">在籍開始日</label><input name="startedOn" type="date" defaultValue={recommended.startedOn} required className="form-input mt-2" /></div>
      <div><label className="form-label">在籍終了日</label><input name="endedOn" type="date" defaultValue={recommended.endedOn || ""} className="form-input mt-2" /></div>
      <div><label className="form-label">メモ</label><input name="notes" defaultValue={recommended.notes} maxLength={1000} className="form-input mt-2" /></div>
      <div><label className="form-label">統合理由</label><input name="reason" required maxLength={1000} placeholder="同一人物の重複登録を解消" className="form-input mt-2" /></div>
    </div>
    <div><label className="form-label">確認のため MERGE と入力</label><input name="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="form-input mt-2 max-w-xs" /></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!canMerge && <p className="text-sm font-semibold text-red-700">値が異なる衝突を解決するまで統合できません。</p>}
    <button disabled={!canMerge || confirmation !== "MERGE" || pending} className="primary-button bg-red-700 hover:bg-red-800">{pending ? <LoaderCircle className="size-4 animate-spin" /> : "キャストを統合する"}</button>
  </form>;
}
