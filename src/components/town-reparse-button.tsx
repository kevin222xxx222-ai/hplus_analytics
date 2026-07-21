"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export const TOWN_REPARSE_TIMEOUT_MS = 120_000;

type TownReparseResult = {
  before: { pendingCount: number; warningCount: number; unmatchedCount: number };
  after: { pendingCount: number; warningCount: number; unmatchedCount: number };
};

type ExecuteTownReparseOptions = {
  batchId: string;
  lock: { current: boolean };
  setPending: (pending: boolean) => void;
  setError: (message: string) => void;
  setMessage: (message: string) => void;
  refresh: () => void;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export async function executeTownReparse({
  batchId, lock, setPending, setError, setMessage, refresh,
  fetcher = fetch, timeoutMs = TOWN_REPARSE_TIMEOUT_MS,
}: ExecuteTownReparseOptions) {
  if (lock.current) return false;
  lock.current = true;
  setPending(true);
  setError("");
  setMessage("");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(`/api/imports/town/${batchId}/reparse`, { method: "POST", signal: controller.signal });
    const result = await response.json() as TownReparseResult & { error?: string };
    if (!response.ok) throw new Error(result.error || "再解析に失敗しました。");
    setMessage(`再解析完了\n未紐付け: ${result.before.unmatchedCount} → ${result.after.unmatchedCount}\n警告: ${result.before.warningCount} → ${result.after.warningCount}\n保留: ${result.before.pendingCount} → ${result.after.pendingCount}`);
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

export function TownReparseButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);

  return <div>
    <button type="button" className="secondary-button" disabled={pending} onClick={() => void executeTownReparse({
      batchId, lock, setPending, setError, setMessage, refresh: () => router.refresh(),
    })}>
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />{pending ? "再解析中" : "このファイルを再解析"}
    </button>
    {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    {message && <p role="status" className="mt-2 whitespace-pre-line rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</p>}
  </div>;
}
