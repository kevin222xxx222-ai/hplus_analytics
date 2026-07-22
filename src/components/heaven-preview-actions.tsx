"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type HeavenUnmatchedAliasSummary = {
  aliasName: string;
  normalizedName: string;
  rowCount: number;
  firstDate: string;
  lastDate: string;
  candidateCount: number;
  inPeriodCandidateCount: number;
  recommendation: "新規Cast候補" | "既存Cast候補あり" | "要確認";
};

type CastOption = { id: string; displayName: string; normalizedName: string };

type Props = {
  batchId: string;
  canResolve: boolean;
  normalizedName?: string;
  firstDate?: string;
  casts: CastOption[];
  unmatchedAliases: HeavenUnmatchedAliasSummary[];
  integrity: { peopleMatches: boolean; rowMatches: boolean; previewPeople: number; previewRows: number; listPeople: number; listRows: number };
  confirmEnabled: boolean;
  duplicateTerminal: boolean;
  duplicateInfo: { duplicateOfBatchId: string; duplicateOfStatus: string; duplicateDetectedAt: string | null } | null;
  confirmSummary: { storeName: string; period: string; metrics: number; rows: number; inserted: number; updated: number; errors: number; warnings: number };
};

export function HeavenPreviewActions({ batchId, canResolve, normalizedName, firstDate, casts, unmatchedAliases, integrity, confirmEnabled, duplicateTerminal, duplicateInfo, confirmSummary }: Props) {
  const router = useRouter();
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState(normalizedName || "");
  const [selectedFirstDate, setSelectedFirstDate] = useState(firstDate || "");
  const [castId, setCastId] = useState("");
  const [aliasName, setAliasName] = useState(unmatchedAliases[0]?.aliasName || "");
  const [newName, setNewName] = useState(unmatchedAliases[0]?.aliasName || "");
  const [reason, setReason] = useState("");

  const selectedIndex = useMemo(() => unmatchedAliases.findIndex((item) => item.normalizedName === selectedName), [unmatchedAliases, selectedName]);
  const selected = selectedIndex >= 0 ? unmatchedAliases[selectedIndex] : unmatchedAliases[0];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!selected) {
        setSelectedName("");
        setAliasName("");
        setNewName("");
        setSelectedFirstDate("");
        return;
      }
      setSelectedName(selected.normalizedName);
      setSelectedFirstDate(selected.firstDate);
      setAliasName(selected.aliasName);
      setNewName(selected.aliasName);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selected]);

  function selectAlias(item: HeavenUnmatchedAliasSummary) {
    setSelectedName(item.normalizedName);
    setSelectedFirstDate(item.firstDate);
    setAliasName(item.aliasName);
    setNewName(item.aliasName);
    setCastId("");
    setReason("");
  }

  async function post(url: string, body?: unknown) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setMessage(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(url, { method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = typeof result.errorCode === "string" ? result.errorCode : "HEAVEN_ACTION_FAILED";
        throw new Error(`HTTP ${response.status} / ${code}: ${typeof result.error === "string" ? result.error : "処理に失敗しました。"}`);
      }
      if (result.aliasId || result.castId || result.resolvedRows !== undefined) {
        setMessage(`処理完了：Cast ${result.castId || "—"} / Alias ${result.aliasId || "—"} / 解決 ${result.resolvedRows ?? 0}行 / 残り ${result.remainingPeople ?? "—"}人・${result.remainingUnmatched ?? "—"}行 / status ${result.status || "—"}`);
      } else setMessage("処理が完了しました。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === "AbortError" ? "処理がタイムアウトしました。再度お試しください。" : error instanceof Error ? error.message : "処理に失敗しました。");
    } finally {
      window.clearTimeout(timeout);
      setPending(false);
      lock.current = false;
    }
  }

  const canSubmitAlias = Boolean(aliasName && selectedName && (!castId ? newName && reason : true));
  const previous = selectedIndex > 0 ? unmatchedAliases[selectedIndex - 1] : null;
  const next = selectedIndex >= 0 && selectedIndex < unmatchedAliases.length - 1 ? unmatchedAliases[selectedIndex + 1] : null;

  return <section className="panel mt-6 p-5">
    <h2 className="text-lg font-semibold">Heaven操作</h2>
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">未紐付けAlias一覧</h3><span className="text-sm text-slate-600">{unmatchedAliases.length}名 / {unmatchedAliases.reduce((sum, item) => sum + item.rowCount, 0)}行</span></div>
      {(!integrity.peopleMatches || !integrity.rowMatches) && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">未紐付け一覧とpreviewの集計が一致しません。再解析してから操作してください。</p>}
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="px-2 py-2">Alias名</th><th className="px-2 py-2">正規化名</th><th className="px-2 py-2">行数</th><th className="px-2 py-2">期間</th><th className="px-2 py-2">候補</th><th className="px-2 py-2">有効候補</th><th className="px-2 py-2">推奨状態</th></tr></thead><tbody>{unmatchedAliases.map((item) => <tr key={item.normalizedName} className={`cursor-pointer border-t ${item.normalizedName === selectedName ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300" : "hover:bg-slate-50"}`} onClick={() => selectAlias(item)}><td className="px-2 py-2 font-medium">{item.aliasName}</td><td className="px-2 py-2">{item.normalizedName}</td><td className="px-2 py-2">{item.rowCount}</td><td className="px-2 py-2 whitespace-nowrap">{item.firstDate}〜{item.lastDate}</td><td className="px-2 py-2">{item.candidateCount}</td><td className="px-2 py-2">{item.inPeriodCandidateCount}</td><td className="px-2 py-2">{item.recommendation}</td></tr>)}</tbody></table>{!unmatchedAliases.length && <p className="py-4 text-sm text-slate-600">未紐付けAliasはありません。</p>}</div>
      {selected && <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="secondary-button" disabled={!previous || pending} onClick={() => previous && selectAlias(previous)}>前のAlias</button><button type="button" className="secondary-button" disabled={!next || pending} onClick={() => next && selectAlias(next)}>次のAlias</button><span className="self-center text-xs text-slate-500">選択中：{selected.aliasName}（{selected.firstDate}〜{selected.lastDate}）</span></div>}
    </div>
    {canResolve && selected && <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div><label className="form-label">既存Cast</label><select className="form-input mt-1 w-full" value={castId} onChange={(event) => setCastId(event.target.value)}><option value="">新規Cast作成</option>{casts.map((cast) => <option key={cast.id} value={cast.id}>{cast.displayName}（{cast.id.slice(0, 8)}）</option>)}</select></div>
      <div><label className="form-label">Alias名</label><input className="form-input mt-1 w-full" value={aliasName} onChange={(event) => setAliasName(event.target.value)} /></div>
      <div><label className="form-label">新規Cast表示名</label><input className="form-input mt-1 w-full" value={newName} onChange={(event) => setNewName(event.target.value)} /></div>
      <div><label className="form-label">対象初出日</label><input className="form-input mt-1 w-full" type="date" value={selectedFirstDate} readOnly /></div>
      <div><label className="form-label">作成理由（新規作成時必須）</label><input className="form-input mt-1 w-full" value={reason} onChange={(event) => setReason(event.target.value)} /></div>
      <div className="flex flex-wrap gap-2 md:col-span-2"><button disabled={pending || !canSubmitAlias} className="primary-button" onClick={() => post(`/api/imports/heaven/${batchId}/alias`, { normalizedName: selectedName, aliasName, castId: castId || undefined, newCast: castId ? undefined : { displayName: newName, startedOn: selectedFirstDate, reason } })}>{pending ? "処理中…" : "Alias作成・再解決"}</button></div>
    </div>}
    <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-4"><div>店舗：{confirmSummary.storeName}</div><div>期間：{confirmSummary.period}</div><div>指標数：{confirmSummary.metrics}</div><div>保存見込み：{confirmSummary.rows}</div><div>新規：{confirmSummary.inserted}</div><div>更新：{confirmSummary.updated}</div><div>ERROR：{confirmSummary.errors}</div><div>WARNING：{confirmSummary.warnings}</div></div>
    <div className="mt-4 flex flex-wrap gap-2">{duplicateInfo && !duplicateTerminal && <button disabled={pending} className="secondary-button" onClick={() => { if (window.confirm(`同一SHAの確定済みBatch ${duplicateInfo.duplicateOfBatchId} が存在します。このBatchを重複として終了しますか？`)) void post(`/api/imports/heaven/${batchId}/cancel-duplicate`); }}>重複として終了</button>}<button disabled={pending || duplicateTerminal || Boolean(duplicateInfo)} className="secondary-button" onClick={() => post(`/api/imports/heaven/${batchId}/reparse`)}>{pending ? "再解析中…" : "このファイルを再解析"}</button><button disabled={pending || !confirmEnabled} className="primary-button" onClick={() => { if (window.confirm(`Heaven実績へ${confirmSummary.rows}行を確定保存します。実行しますか？`)) void post(`/api/imports/heaven/${batchId}/confirm`); }}>{pending ? "確定処理中…" : "このファイルを確定"}</button></div>
    {duplicateInfo && <p className="mt-2 text-sm text-amber-700">同一ファイル確定済みのため、このBatchの確定は無効です。</p>}{!duplicateInfo && !confirmEnabled && <p className="mt-2 text-sm text-amber-700">PREVIEW_READYかつERROR/WARNING 0件のバッチのみ確定できます。</p>}{message && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600" role="status">{message}</p>}
  </section>;
}
