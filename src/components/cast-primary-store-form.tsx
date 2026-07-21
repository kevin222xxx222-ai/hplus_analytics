"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { updateCastPrimaryStoreAction } from "@/app/actions/masters";

type StoreOption = { id: string; shortName: string };

export function CastPrimaryStoreForm({
  castId,
  displayName,
  initialStoreId,
  stores,
}: {
  castId: string;
  displayName: string;
  initialStoreId: string | null;
  stores: StoreOption[];
}) {
  const router = useRouter();
  const [selectedStoreId, setSelectedStoreId] = useState(initialStoreId || "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setMessage(null); setError(null);
    const formData = new FormData();
    formData.set("id", castId);
    formData.set("primaryStoreId", selectedStoreId);
    try {
      const result = await updateCastPrimaryStoreAction(formData);
      setSelectedStoreId(result.primaryStoreId || "");
      setMessage("保存済み");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "主所属店舗の保存に失敗しました。");
    } finally { setPending(false); }
  }

  return <form onSubmit={submit} className="min-w-[220px]">
    <div className="flex items-center gap-2">
      <select aria-label={`${displayName}の主所属店舗`} value={selectedStoreId} onChange={(event) => { setSelectedStoreId(event.target.value); setMessage(null); setError(null); }} className="compact-input min-w-0 flex-1">
        <option value="">未設定</option>
        {stores.map((store) => <option key={store.id} value={store.id}>{store.shortName}</option>)}
      </select>
      <button disabled={pending} className="secondary-button h-9 min-w-14 px-2 text-xs">{pending ? <LoaderCircle className="size-3 animate-spin" /> : "保存"}</button>
    </div>
    <div aria-live="polite" className="mt-1 min-h-4 text-[11px]">
      {message && <span className="text-emerald-700">{message}</span>}
      {error && <span className="text-red-600">{error}</span>}
    </div>
  </form>;
}
