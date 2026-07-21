"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export const CTI_REPARSE_TIMEOUT_MS = 120_000;

type ReparseResult = {
  before: { pendingCount: number; warningCount: number; importableCount: number };
  after: { pendingCount: number; warningCount: number; importableCount: number };
};

type ExecuteCtiReparseOptions = {
  batchId: string;
  lock: { current: boolean };
  setPending: (pending: boolean) => void;
  setError: (message: string) => void;
  setMessage: (message: string) => void;
  refresh: () => void;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export async function executeCtiReparse({
  batchId, lock, setPending, setError, setMessage, refresh,
  fetcher = fetch, timeoutMs = CTI_REPARSE_TIMEOUT_MS,
}: ExecuteCtiReparseOptions) {
  if (lock.current) return false;
  lock.current = true;
  setPending(true);
  setError("");
  setMessage("");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(`/api/imports/cti/${batchId}/reparse`, { method: "POST", signal: controller.signal });
    const result = await response.json() as ReparseResult & { error?: string };
    if (!response.ok) throw new Error(result.error || "再解析に失敗しました。");
    setMessage(`再解析完了\n未紐付け: ${result.before.pendingCount} → ${result.after.pendingCount}\n警告: ${result.before.warningCount} → ${result.after.warningCount}\n取込可能: ${result.before.importableCount} → ${result.after.importableCount}`);
    refresh();
    return true;
  } catch (cause) {
    setError(controller.signal.aborted
      ? "再解析がタイムアウトしました。再度お試しください。"
      : cause instanceof Error ? cause.message : "再解析に失敗しました。");
    return false;
  } finally {
    clearTimeout(timeoutId);
    lock.current = false;
    setPending(false);
  }
}

export function CtiReparseButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const reparseLock = useRef(false);

  function reparse() {
    void executeCtiReparse({ batchId, lock: reparseLock, setPending, setError, setMessage, refresh: () => router.refresh() });
  }

  return <div>
    <button type="button" className="secondary-button" onClick={reparse} disabled={pending}>
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />{pending ? "再解析中" : "このファイルを再解析"}
    </button>
    {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    {message && <p role="status" className="mt-2 whitespace-pre-line rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</p>}
  </div>;
}
