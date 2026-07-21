"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, UploadCloud } from "lucide-react";

type Source = { id: string; name: string; storeId: string; storeName: string; dataType: string };

const labels: Record<string, string> = {
  TOWN_STORE: "店舗別",
  TOWN_CAST: "女子別",
  TOWN_URL: "URL別",
  TOWN_LANDING: "LP別",
};

export function TownUploadForm({ sources }: { sources: Source[] }) {
  const router = useRouter();
  const stores = useMemo(() => [...new Map(sources.map((source) => [source.storeId, { id: source.storeId, name: source.storeName }])).values()], [sources]);
  const [storeId, setStoreId] = useState(stores[0]?.id || "");
  const [dataType, setDataType] = useState("TOWN_STORE");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = sources.find((candidate) => candidate.storeId === storeId && candidate.dataType === dataType);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source) { setError("選択内容に対応する取込元がありません。"); return; }
    setPending(true); setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("importSourceId", source.id);
    try {
      const response = await fetch("/api/imports/town/upload", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "アップロードに失敗しました。");
      router.push(`/imports/town/${result.batchId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "アップロードに失敗しました。");
      setPending(false);
    }
  }

  return <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[150px_150px_160px_160px_1.4fr_auto] lg:items-end">
    <div><label className="form-label">店舗</label><select name="storeId" value={storeId} onChange={(event) => setStoreId(event.target.value)} className="form-input mt-2">{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></div>
    <div><label className="form-label">データ種別</label><select name="dataType" value={dataType} onChange={(event) => setDataType(event.target.value)} className="form-input mt-2">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <div><label className="form-label">対象開始日</label><input name="targetFrom" type="date" required className="form-input mt-2" /></div>
    <div><label className="form-label">対象終了日</label><input name="targetTo" type="date" required className="form-input mt-2" /></div>
    <div><label className="form-label">タウンCSV</label><input name="file" type="file" accept=".csv,text/csv" required className="form-input mt-2 py-2.5" /></div>
    <button disabled={pending || !source} className="primary-button">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}{pending ? "解析中…" : "検証・プレビュー"}</button>
    <p className="text-xs text-slate-500 lg:col-span-full">店舗はここでの明示選択を正とします。ファイル名の「(1)」は判定に使用しません。選択店舗とURL内店舗IDの矛盾はエラーになります。</p>
    {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 lg:col-span-full" role="alert">{error}</p>}
  </form>;
}

