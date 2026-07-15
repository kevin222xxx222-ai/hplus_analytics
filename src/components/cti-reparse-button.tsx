"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CtiReparseButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function reparse() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/imports/cti/${batchId}/reparse`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "再解析に失敗しました。");
      router.push(`/imports/${result.batchId}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "再解析に失敗しました。");
      setPending(false);
    }
  }

  return <div>
    <button type="button" className="secondary-button" onClick={reparse} disabled={pending}>
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />{pending ? "再解析中" : "このファイルを再解析"}
    </button>
    {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
  </div>;
}
