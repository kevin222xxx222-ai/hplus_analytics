"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle } from "lucide-react";

export function CtiConfirmImport({ batchId, disabled, duplicate, previewOnly }: { batchId: string; disabled: boolean; duplicate: boolean; previewOnly: boolean }) {
  const router = useRouter();
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/imports/cti/${batchId}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ forceDuplicate }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "取込確定に失敗しました。");
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "取込確定に失敗しました。"); }
    finally { setPending(false); }
  }
  if (previewOnly) return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">この取込種別はプレビュー専用です。日次実績へは保存しません。</p>;
  return <div className="space-y-3">
    {duplicate && <label className="check-row rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800"><input type="checkbox" checked={forceDuplicate} onChange={(event) => setForceDuplicate(event.target.checked)} />同一ファイルの完了履歴を確認し、明示的に再処理する</label>}
    <button disabled={disabled || pending || (duplicate && !forceDuplicate)} onClick={() => void confirm()} className="primary-button w-full">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{pending ? "取込中…" : "紐付け済み行を確定取込"}</button>
    {error && <p className="text-sm text-red-600">{error}</p>}
  </div>;
}
