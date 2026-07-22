"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function HeavenDuplicateAction({ batchId, duplicateOfBatchId }: { batchId: string; duplicateOfBatchId: string }) {
  const router = useRouter();
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function cancel() {
    if (lock.current || !window.confirm(`同一SHAの確定済みBatch ${duplicateOfBatchId} が存在します。このBatchを重複として終了しますか？`)) return;
    lock.current = true;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/imports/heaven/${batchId}/cancel-duplicate`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "重複終了に失敗しました。");
      setMessage("重複として終了しました。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重複終了に失敗しました。");
    } finally {
      setPending(false);
      lock.current = false;
    }
  }
  return <div className="flex flex-wrap items-center gap-2"><button type="button" className="secondary-button" disabled={pending} onClick={() => void cancel()}>{pending ? "終了処理中…" : "重複として終了"}</button>{message && <span className="text-xs text-slate-600" role="status">{message}</span>}</div>;
}
