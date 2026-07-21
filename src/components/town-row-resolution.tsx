"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

type CastOption = { id: string; displayName: string };
type StoreOption = { id: string; shortName: string };
type SameNameCandidate = { id: string; displayName: string; startedOn: string; endedOn: string | null; primaryStoreName: string | null };

type Props = {
  batchId: string;
  rowKey: string;
  casts: CastOption[];
  allowNewCast?: boolean;
  originalCastName?: string;
  targetDate?: string;
  primaryStores?: StoreOption[];
  defaultPrimaryStoreId?: string;
};

export function TownRowResolution({
  batchId,
  rowKey,
  casts,
  allowNewCast = false,
  originalCastName = "",
  targetDate = "",
  primaryStores = [],
  defaultPrimaryStoreId = "",
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCastId, setSelectedCastId] = useState("");
  const [displayName, setDisplayName] = useState(originalCastName);
  const [primaryStoreId, setPrimaryStoreId] = useState(defaultPrimaryStoreId);
  const [startedOn, setStartedOn] = useState(targetDate);
  const [notes, setNotes] = useState("");
  const [sameNameCandidates, setSameNameCandidates] = useState<SameNameCandidate[]>([]);

  async function request(payload: Record<string, unknown>, refresh: boolean) {
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/imports/town/${batchId}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rowKey, ...payload }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "更新に失敗しました。");
      if (refresh) router.refresh();
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更新に失敗しました。");
      return null;
    } finally { setPending(false); }
  }

  async function createNewCast(confirmDuplicate: boolean) {
    await request({ action: "NEW", displayName, primaryStoreId: primaryStoreId || null, startedOn, notes, confirmDuplicate }, true);
  }

  async function checkAndCreate() {
    setSameNameCandidates([]);
    const result = await request({ action: "CHECK_NEW", displayName, startedOn }, false) as { candidates?: SameNameCandidate[] } | null;
    if (!result) return;
    const candidates = result.candidates || [];
    if (candidates.length === 0) {
      await createNewCast(false);
      return;
    }
    setSameNameCandidates(candidates);
  }

  function changeNewCastValue(update: () => void) {
    update();
    setSameNameCandidates([]);
    setError(null);
  }

  return <div className="min-w-[420px] space-y-3">
    <div className="flex gap-2">
      <select aria-label="既存キャスト" className="compact-input min-w-0 flex-1" value={selectedCastId} onChange={(event) => setSelectedCastId(event.target.value)}>
        <option value="">既存キャストを選択</option>
        {casts.map((cast) => <option key={cast.id} value={cast.id}>{cast.displayName}</option>)}
      </select>
      <button type="button" disabled={pending || !selectedCastId} className="secondary-button h-9 px-3 text-xs" onClick={() => void request({ action: "EXISTING", castId: selectedCastId }, true)}>Alias追加・紐付け</button>
    </div>

    {allowNewCast && <details className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-emerald-800">新規キャスト作成</summary>
      <p className="mt-3 text-[11px] leading-5 text-slate-600">CTIは当日出勤者のみのため、Town掲載中でもキャストマスタに未登録の場合があります。現在在籍中の女性のみ新規作成してください。</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] text-slate-600">新規キャスト名
          <input aria-label="新規キャスト名" className="compact-input mt-1 w-full" value={displayName} onChange={(event) => changeNewCastValue(() => setDisplayName(event.target.value))} />
        </label>
        <label className="text-[11px] text-slate-600">主所属店舗
          <select aria-label="主所属店舗" className="compact-input mt-1 w-full" value={primaryStoreId} onChange={(event) => changeNewCastValue(() => setPrimaryStoreId(event.target.value))}>
            <option value="">未設定</option>
            {primaryStores.map((store) => <option key={store.id} value={store.id}>{store.shortName}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-slate-600">在籍開始日
          <input aria-label="在籍開始日" type="date" className="compact-input mt-1 w-full" value={startedOn} onChange={(event) => changeNewCastValue(() => setStartedOn(event.target.value))} />
        </label>
        <label className="text-[11px] text-slate-600 sm:col-span-2">メモ（任意）
          <textarea aria-label="メモ" className="compact-input mt-1 min-h-16 w-full" maxLength={1000} value={notes} onChange={(event) => changeNewCastValue(() => setNotes(event.target.value))} />
        </label>
      </div>
      <button type="button" disabled={pending || !displayName.trim() || !startedOn} className="primary-button mt-3 min-h-9 px-3 text-xs" onClick={() => void checkAndCreate()}>新規作成してAlias追加・紐付け</button>

      {sameNameCandidates.length > 0 && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900">
        <p className="font-semibold">同じ正規化名の在籍キャストが{sameNameCandidates.length}件あります。</p>
        <ul className="mt-2 space-y-1">{sameNameCandidates.map((candidate) => <li key={candidate.id}>・{candidate.displayName}（{candidate.primaryStoreName || "主所属未設定"} / {candidate.startedOn}〜{candidate.endedOn || "在籍中"}）</li>)}</ul>
        {sameNameCandidates.length === 1 ? <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="secondary-button h-8 px-3 text-[11px]" onClick={() => { setSelectedCastId(sameNameCandidates[0].id); setSameNameCandidates([]); }}>既存キャストへの紐付けを推奨</button>
          <button type="button" className="secondary-button h-8 px-3 text-[11px] text-red-700" onClick={() => {
            if (window.confirm("在籍期間が重なる同名キャストを新規作成します。別人であることを確認しましたか？")) void createNewCast(true);
          }}>別人として新規作成</button>
        </div> : <p className="mt-2 font-semibold">候補が複数あるため、新規作成を停止しました。既存キャストを確認してください。</p>}
      </div>}
    </details>}

    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending} className="secondary-button h-9 px-3 text-xs" onClick={() => void request({ action: "SKIP" }, true)}>今回除外</button>
      <button type="button" disabled={pending} className="secondary-button h-9 px-3 text-xs" onClick={() => void request({ action: "PENDING" }, true)}>保留</button>
    </div>
    {pending && <p className="flex items-center gap-1 text-xs text-slate-400"><LoaderCircle className="size-3 animate-spin" />更新中</p>}
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>;
}
