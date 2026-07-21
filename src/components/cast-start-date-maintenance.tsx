"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Search } from "lucide-react";
import { executeCastStartDateBulkChangeAction, previewCastStartDateBulkChangeAction } from "@/app/actions/masters";
import { filterStartDateCandidates, getEligibleStartDateCandidateIds, selectionsMatch } from "@/lib/casts/start-date-maintenance-selection";

type Candidate = {
  id: string;
  displayName: string;
  primaryStoreName: string | null;
  startedOn: string;
  endedOn: string | null;
  aliasCount: number;
};

type Preview = Awaited<ReturnType<typeof previewCastStartDateBulkChangeAction>>;

export function CastStartDateMaintenance({ candidates }: { candidates: Candidate[] }) {
  const [selectedCastIds, setSelectedCastIds] = useState<Set<string>>(new Set());
  const [targetDate, setTargetDate] = useState("2026-04-01");
  const [mediaScope, setMediaScope] = useState<"ALL" | "CTI" | "TOWN" | "HEAVEN">("ALL");
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pendingOperation, setPendingOperation] = useState<"preview" | "execute" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = pendingOperation !== null;
  const pendingRef = useRef(false);
  const previewSectionRef = useRef<HTMLElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const filtered = useMemo(() => filterStartDateCandidates(candidates, query), [candidates, query]);
  const eligibleIds = useMemo(() => getEligibleStartDateCandidateIds(filtered, targetDate), [filtered, targetDate]);

  useEffect(() => {
    if (preview) previewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [preview]);

  useEffect(() => {
    if (error) feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  function invalidate() {
    setPreview(null); setMessage(null); setError(null);
  }

  function toggle(id: string) {
    setSelectedCastIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    invalidate();
  }

  async function createPreview() {
    if (pendingRef.current) return;
    const requestedCastIds = [...selectedCastIds];
    if (requestedCastIds.length === 0) {
      setError("対象キャストを1名以上選択してください。");
      return;
    }
    pendingRef.current = true;
    setPendingOperation("preview"); setError(null); setMessage(null);
    try {
      const result = await previewCastStartDateBulkChangeAction({
        castIds: requestedCastIds,
        expectedSelectionCount: requestedCastIds.length,
        targetDate,
        mediaScope,
      });
      if (result.receivedSelectionCount !== requestedCastIds.length || !selectionsMatch(requestedCastIds, result.castIds)) {
        throw new Error(`選択件数とサーバー受領件数が一致しません（選択${requestedCastIds.length}件／受領${result.receivedSelectionCount}件）。処理を停止しました。`);
      }
      setPreview(result);
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : "変更プレビューを作成できませんでした。");
    } finally {
      pendingRef.current = false;
      setPendingOperation(null);
    }
  }

  async function execute() {
    if (!preview || !window.confirm(`${preview.castChanges.length}名・${preview.aliasChanges.length}件のAlias開始日を一括変更します。よろしいですか？`)) return;
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPendingOperation("execute"); setError(null); setMessage(null);
    try {
      const result = await executeCastStartDateBulkChangeAction({ castIds: [...selectedCastIds], targetDate, mediaScope, expectedFingerprint: preview.fingerprint, reason });
      setMessage(`一括変更が完了しました（キャスト${result.castCount}名、Alias${result.aliasCount}件）。`);
      setPreview(null); setSelectedCastIds(new Set()); setReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "一括変更に失敗しました。全件ロールバックされました。");
    } finally {
      pendingRef.current = false;
      setPendingOperation(null);
    }
  }

  return <div className="space-y-6">
    <section className="panel p-5">
      <div className="grid gap-4 lg:grid-cols-[180px_190px_1fr_auto] lg:items-end">
        <div><label className="form-label">一括開始日</label><input type="date" value={targetDate} onChange={(event) => { setTargetDate(event.target.value); invalidate(); }} className="form-input mt-2" /></div>
        <div><label className="form-label">対象Alias</label><select value={mediaScope} onChange={(event) => { setMediaScope(event.target.value as typeof mediaScope); invalidate(); }} className="form-input mt-2"><option value="CTI">CTIのみ</option><option value="TOWN">Townのみ</option><option value="HEAVEN">Heavenのみ</option><option value="ALL">全媒体</option></select></div>
        <div><label className="form-label">キャスト検索</label><div className="relative mt-2"><Search className="absolute left-3 top-3 size-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名前・主所属" className="form-input pl-9" /></div></div>
        <button type="button" disabled={pending || selectedCastIds.size === 0 || !targetDate} onClick={createPreview} className="primary-button">{pendingOperation === "preview" ? <LoaderCircle className="size-4 animate-spin" /> : null}{pendingOperation === "preview" ? "プレビュー作成中" : "変更プレビュー"}</button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><button type="button" className="secondary-button" onClick={() => { setSelectedCastIds(new Set(eligibleIds)); invalidate(); }}>条件該当を全選択（{eligibleIds.length}名）</button><button type="button" className="secondary-button" onClick={() => { setSelectedCastIds(new Set()); invalidate(); }}>選択解除</button><span className="text-slate-500">選択中：{selectedCastIds.size}名</span></div>
      <p className="mt-2 text-xs text-slate-500">検索中の全選択は、現在表示中かつ日付条件を満たすキャストだけを対象にします。</p>
      {error && <p ref={feedbackRef} role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    </section>

    <section className="panel overflow-hidden">
      <div className="table-wrap max-h-[520px]">
        <table><thead><tr><th>対象</th><th>キャスト名</th><th>主所属</th><th>現在のstartedOn</th><th>endedOn</th><th>Alias数</th><th>注意</th></tr></thead>
          <tbody>{filtered.map((cast) => {
            const dateEligible = cast.startedOn > targetDate && (!cast.endedOn || cast.endedOn >= targetDate);
            return <tr key={cast.id} className={selectedCastIds.has(cast.id) ? "bg-emerald-50/50" : ""}><td><input aria-label={`${cast.displayName}を選択`} type="checkbox" checked={selectedCastIds.has(cast.id)} disabled={!dateEligible} onChange={() => toggle(cast.id)} /></td><td className="font-medium">{cast.displayName}</td><td>{cast.primaryStoreName || "未設定"}</td><td>{cast.startedOn}</td><td>{cast.endedOn || "在籍中"}</td><td>{cast.aliasCount}</td><td className="text-xs">{dateEligible ? <span className="text-amber-700">実際の入店日を要確認</span> : <span className="text-slate-400">前倒し対象外</span>}</td></tr>;
          })}</tbody></table>
      </div>
    </section>

    {preview && <section ref={previewSectionRef} className="panel scroll-mt-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">変更プレビュー</h2><p className="mt-1 text-sm text-slate-500">Cast {preview.castChanges.length}名 / Alias {preview.aliasChanges.length}件 / 対象日 {preview.targetDate}</p></div>{preview.conflicts.length ? <span className="status-badge bg-red-50 text-red-700"><AlertTriangle className="size-4" />衝突 {preview.conflicts.length}件</span> : <span className="status-badge bg-emerald-50 text-emerald-700"><CheckCircle2 className="size-4" />衝突なし</span>}</div>
      {preview.conflicts.length > 0 && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><ul className="list-disc space-y-1 pl-5">{preview.conflicts.map((conflict, index) => <li key={`${conflict.code}-${index}`}>{conflict.message}</li>)}</ul></div>}
      <div className="table-wrap mt-4"><table><thead><tr><th>キャスト</th><th>主所属</th><th>startedOn</th><th>対象Alias</th><th>validFrom</th><th>validTo</th><th>衝突・注意事項</th></tr></thead><tbody>{preview.casts.map((cast) => <tr key={cast.castId}><td className="font-medium">{cast.displayName}</td><td>{cast.primaryStoreName || "未設定"}</td><td>{cast.currentStartedOn} → <strong>{cast.changedStartedOn}</strong></td><td><div className="min-w-[220px] space-y-1">{cast.aliases.length ? cast.aliases.map((alias) => <div key={alias.id} className="text-xs">{alias.mediaType} / {alias.storeName || "共通"} / {alias.aliasName}</div>) : <span className="text-xs text-slate-400">対象Aliasなし</span>}</div></td><td><div className="space-y-1">{cast.aliases.map((alias) => <div key={alias.id} className="text-xs">{alias.currentValidFrom || "未設定"} → <strong>{alias.changedValidFrom || "未設定"}</strong></div>)}</div></td><td><div className="space-y-1">{cast.aliases.map((alias) => <div key={alias.id} className="text-xs">{alias.validTo || "継続"}</div>)}</div></td><td className="max-w-[260px] text-xs text-amber-700">実際の入店日が{targetDate}より後でないことを確認してください。</td></tr>)}</tbody></table></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end"><div><label className="form-label">実行理由（必須）</label><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={2} placeholder="例：2026年4月以降の過去実績取込準備" className="form-input mt-2" /></div><button type="button" disabled={pending || !preview.canExecute || !reason.trim()} onClick={execute} className="primary-button bg-red-700 hover:bg-red-800">{pendingOperation === "execute" ? <LoaderCircle className="size-4 animate-spin" /> : null}一括変更</button></div>
    </section>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{message}</p>}
  </div>;
}
