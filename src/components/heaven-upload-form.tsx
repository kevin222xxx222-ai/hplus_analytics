"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, UploadCloud } from "lucide-react";
import type { HeavenMetricType } from "@/lib/imports/heaven/parser";

const metrics: Array<[HeavenMetricType, string]> = [["PAGE_ACCESS", "アクセス数"], ["DIARY_POSTS", "写メ日記投稿数"], ["MY_GIRL", "マイガール数"], ["MITENE_SENT", "ミテネ送信数"], ["OKINI_TALK_SENT", "オキニトーク送信数"], ["ATTENDANCE_NOTICE", "出勤通知数"], ["DIARY_NOTICE", "写メ日記通知数"]];
export function HeavenUploadForm({ stores }: { stores: Array<{ id: string; name: string }> }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setPending(true); setError(null); try { const response = await fetch("/api/imports/heaven/upload", { method: "POST", body: new FormData(event.currentTarget) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "検証に失敗しました。"); router.push(`/imports/heaven/${result.batchId}`); } catch (e) { setError(e instanceof Error ? e.message : "検証に失敗しました。"); setPending(false); } }
  return <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 md:items-end">
    <div><label className="form-label">店舗</label><select name="storeId" required className="form-input mt-2"><option value="">選択してください</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></div>
    <div><label className="form-label">女子指標（女子CSVのみ必須）</label><select name="metricHint" defaultValue="" className="form-input mt-2"><option value="">店舗CSV（内容から判定）</option>{metrics.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <div className="md:col-span-2"><label className="form-label">Heaven CSV</label><input name="file" type="file" accept=".csv,text/csv" required className="form-input mt-2 py-2.5" /></div>
    <button disabled={pending || stores.length === 0} className="primary-button md:col-span-2 xl:col-span-1">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}{pending ? "検証中…" : "検証・プレビュー"}</button>
    {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-full" role="alert">{error}</p>}
  </form>;
}
