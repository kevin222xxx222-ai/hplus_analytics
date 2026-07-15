"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

type CastOption = { id: string; displayName: string; startedOn: string; endedOn: string | null };

export function CtiRowResolution({ batchId, rowKey, originalCastName, casts, targetDate }: { batchId: string; rowKey: string; originalCastName: string; casts: CastOption[]; targetDate: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(payload: Record<string, unknown>) {
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/imports/cti/${batchId}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rowKey, ...payload }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "更新に失敗しました。");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更新に失敗しました。");
    } finally { setPending(false); }
  }

  return <div className="min-w-[360px] space-y-2">
    <div className="flex gap-2"><select id={`cast-${rowKey}`} className="compact-input min-w-0 flex-1" defaultValue=""><option value="">既存キャストを選択</option>{casts.map((cast) => <option key={cast.id} value={cast.id}>{cast.displayName}</option>)}</select><button disabled={pending} className="secondary-button h-9 px-3 text-xs" onClick={() => { const select = document.getElementById(`cast-${rowKey}`) as HTMLSelectElement; if (select.value) void send({ action: "EXISTING", castId: select.value }); }}>紐付け</button></div>
    <div className="flex gap-2"><input id={`new-${rowKey}`} className="compact-input min-w-0 flex-1" aria-label="新規キャスト名" placeholder="新規キャスト名" defaultValue={originalCastName} /><button disabled={pending} className="secondary-button h-9 px-3 text-xs" onClick={() => { const input = document.getElementById(`new-${rowKey}`) as HTMLInputElement; if (input.value.trim()) void send({ action: "NEW", displayName: input.value, startedOn: targetDate }); }}>新規作成して紐付け</button><button disabled={pending} className="secondary-button h-9 px-3 text-xs" onClick={() => void send({ action: "SKIP" })}>今回除外</button></div>
    {pending && <p className="flex items-center gap-1 text-xs text-slate-400"><LoaderCircle className="size-3 animate-spin" />更新中</p>}{error && <p className="text-xs text-red-600">{error}</p>}
  </div>;
}
