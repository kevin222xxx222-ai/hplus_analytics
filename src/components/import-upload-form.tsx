"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, UploadCloud } from "lucide-react";

export function ImportUploadForm({ sources }: { sources: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/imports/cti/upload", { method: "POST", body: new FormData(event.currentTarget) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "アップロードに失敗しました。");
      router.push(`/imports/${result.batchId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "アップロードに失敗しました。");
      setPending(false);
    }
  }

  return <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1.2fr_170px_160px_160px_1.4fr_auto] lg:items-end">
    <div><label className="form-label">取込元</label><select name="importSourceId" required className="form-input mt-2"><option value="">選択してください</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></div>
    <div><label className="form-label">取込種別</label><select name="importMode" className="form-input mt-2" defaultValue="DAILY"><option value="DAILY">日次</option><option value="MONTH_TO_DATE">当月累計（プレビューのみ）</option><option value="MONTHLY_FINAL">月次確定（プレビューのみ）</option><option value="UNKNOWN">不明（プレビューのみ）</option></select></div>
    <div><label className="form-label">対象開始日</label><input name="targetFrom" type="date" required className="form-input mt-2" /></div>
    <div><label className="form-label">対象終了日</label><input name="targetTo" type="date" required className="form-input mt-2" /></div>
    <div><label className="form-label">CTI女子別レポート</label><input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="form-input mt-2 py-2.5" /></div>
    <button disabled={pending || sources.length === 0} className="primary-button">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}{pending ? "解析中…" : "検証・プレビュー"}</button>
    {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 lg:col-span-full" role="alert">{error}</p>}
  </form>;
}
