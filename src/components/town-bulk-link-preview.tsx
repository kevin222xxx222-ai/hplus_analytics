"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, ExternalLink, LoaderCircle, Search, ShieldAlert } from "lucide-react";
import { filterTownCCandidates, pageTownCCandidates, townCActionSet, type TownCFilter } from "@/lib/imports/town/bulk-link-phase1";
import type { TownBulkLinkCandidate, TownBulkLinkCastOption, TownBulkLinkCategory, TownBulkLinkImpactPreview, TownBulkLinkPreview } from "@/lib/imports/town/bulk-link-types";

const CATEGORY_LABELS: Record<TownBulkLinkCategory, string> = { A: "A：自動紐付け可能", B: "B：管理者一括承認候補", C: "C：個別確認・保留" };
const REASON_LABELS: Record<string, string> = {
  ID_FORMAT: "ID:数字形式", CORRECTION_CANDIDATE: "修正版候補", MULTIPLE_CANDIDATES: "候補複数",
  TOWN_ALIAS_CONFLICT: "Alias衝突", OUTSIDE_ENROLLMENT: "在籍期間外", UNKNOWN_SOURCE_NAME: "人物名不明", NO_CANDIDATE: "候補なし",
};
type PlanStatus = { label: string; detail?: string };
type NewCastDraft = { name: string; storeId: string; startedOn: string; note: string; creationReason: string; confirmationText: string };

function newDraftMissingReason(draft: NewCastDraft, impact: TownBulkLinkImpactPreview | undefined, pending: boolean, duplicateWarningOnly: boolean) {
  if (pending) return "処理中です。完了までお待ちください。";
  if (!impact || impact.operation !== "NEW") return "影響範囲プレビューを実行してください。";
  if (!impact.executable && !(duplicateWarningOnly && draft.confirmationText === "同名Castとは別人として新規作成します")) return "影響範囲に停止理由があります。";
  if (!draft.name.trim()) return "表示名を入力してください。";
  if (!draft.storeId) return "主所属店舗を選択してください。";
  if (!draft.startedOn) return "在籍開始日を入力してください。";
  if (!draft.creationReason.trim()) return "作成理由を入力してください。";
  if (duplicateWarningOnly && draft.confirmationText !== "同名Castとは別人として新規作成します") return "同名Castとは別人として作成する確認文言を入力してください。";
  return "";
}

function NewCastExecutionControls({ draft, impact, pending, duplicateWarningOnly, onPreview, onExecute, onReset }: {
  draft: NewCastDraft;
  impact?: TownBulkLinkImpactPreview;
  pending: boolean;
  duplicateWarningOnly: boolean;
  onPreview: () => void;
  onExecute: () => void;
  onReset: () => void;
}) {
  const missing = newDraftMissingReason(draft, impact, pending, duplicateWarningOnly);
  return <div className="mt-3 space-y-2">
    <div className="flex flex-wrap gap-2">
      <button type="button" className="secondary-button" disabled={!draft.name.trim() || !draft.creationReason.trim() || pending} onClick={onPreview}>{pending ? "影響確認中" : "影響範囲を再プレビュー"}</button>
      <button type="button" className="primary-button bg-emerald-700 hover:bg-emerald-800" disabled={Boolean(missing)} onClick={() => { if (window.confirm("入力内容を確認しました。Castを作成し、Alias追加と未紐付け行の解決を実行しますか？")) onExecute(); }}>新規作成して紐付け</button>
      <button type="button" className="secondary-button" disabled={pending} onClick={onReset}>入力内容をリセット</button>
    </div>
    {missing && <p role="status" className="text-xs text-amber-800">{missing}</p>}
  </div>;
}

function SummaryCard({ label, value }: { label: string; value: { peopleCount: number; rowCount: number; batchCount: number } }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{value.peopleCount}<span className="ml-1 text-sm font-normal text-slate-500">人分</span></p><p className="mt-1 text-xs text-slate-500">{value.rowCount.toLocaleString("ja-JP")}行 / {value.batchCount}バッチ</p></div>;
}

function CandidateTable({ candidates, selected, onToggle }: { candidates: TownBulkLinkCandidate[]; selected?: Set<string>; onToggle?: (key: string) => void }) {
  return <div className="table-wrap max-h-[520px]"><table><thead><tr>{selected && <th>承認</th>}<th>Town名</th><th>推奨Cast</th><th>理由</th><th>店舗</th><th>初回日</th><th>最終日</th><th>行数</th><th>バッチ数</th><th>衝突</th></tr></thead><tbody>{candidates.map((candidate) => <tr key={candidate.key}>{selected && <td><input type="checkbox" aria-label={`${candidate.townName}を承認`} checked={selected.has(candidate.key)} onChange={() => onToggle?.(candidate.key)} /></td>}<td className="font-medium text-slate-900">{candidate.townName}</td><td>{candidate.targetCastName || "—"}</td><td className="max-w-[360px] whitespace-normal text-xs">{candidate.reason}</td><td>{candidate.storeName}</td><td>{candidate.firstDate}</td><td>{candidate.lastDate}</td><td>{candidate.rowCount}</td><td>{candidate.batchCount}</td><td>{candidate.conflict ? "あり" : "なし"}</td></tr>)}</tbody></table></div>;
}

function candidateCastOptions(candidate: TownBulkLinkCandidate, options: TownBulkLinkCastOption[]) {
  const withoutKuki = (value: string) => value.startsWith("久") ? value.slice(1) : value;
  const likely = options.filter((option) => option.normalizedName === candidate.normalizedName
    || withoutKuki(option.normalizedName) === withoutKuki(candidate.normalizedName)
    || option.ctiAliases.some((alias) => withoutKuki(alias) === withoutKuki(candidate.townName)));
  return likely.length ? likely : options;
}

function CastDetails({ cast }: { cast: TownBulkLinkCastOption }) {
  return <div className="grid gap-1 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
    <p><strong>{cast.displayName}</strong><br />ID: {cast.id}</p><p>主所属: {cast.primaryStoreName || "未設定"}<br />在籍: {cast.startedOn}〜{cast.endedOn || "在籍中"}</p>
    <p>CTI Alias: {cast.ctiAliases.join(" / ") || "—"}<br />Town Alias: {cast.townAliases.join(" / ") || "—"}</p><p>CTI実績: {cast.ctiFrom || "—"}〜{cast.ctiTo || "—"}<br />Town掲載: {cast.townListingStores.join(" / ") || "—"}</p>
  </div>;
}

function CandidateComparison({ candidate, options }: { candidate: TownBulkLinkCandidate; options: TownBulkLinkCastOption[] }) {
  const choices = candidateCastOptions(candidate, options);
  return <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4 text-xs">
    <p className="font-semibold text-slate-900">候補比較</p>
    {choices.length === 0 ? <p className="mt-2 text-amber-800">比較可能な候補がありません。</p> : <div className="mt-3 space-y-3">{choices.map((cast) => <div key={cast.id} className="rounded-lg border border-sky-200 bg-white p-3"><CastDetails cast={cast} /></div>)}</div>}
    <p className="mt-3 text-amber-800">候補を選択しただけでは紐付けません。対象日・店舗・Alias・在籍期間を確認し、実行前に影響範囲プレビューを確認してください。</p>
  </div>;
}

function ImpactCard({ value }: { value: TownBulkLinkImpactPreview }) {
  return <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-slate-700">
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><p>店舗<br /><strong>{value.storeName}</strong></p><p>対象Cast<br /><strong>{value.targetCastName || "—"}</strong></p><p>対象<br /><strong>{value.rowCount}行 / {value.batchCount}バッチ</strong></p><p>内訳<br /><strong>CAST {value.kindCounts.cast} / URL {value.kindCounts.url} / LP {value.kindCounts.landing}</strong></p><p>期間<br /><strong>{value.firstDate}〜{value.lastDate}</strong></p><p>Alias<br /><strong>{value.aliasAction}</strong></p><p>startedOn<br /><strong>{value.startedOnBefore || "—"} → {value.startedOnAfter || "—"}</strong></p><p>validFrom<br /><strong>{value.validFromBefore || "—"} → {value.validFromAfter || "—"}</strong></p><p>追加対象実績<br /><strong>{value.additionalFactCount}件</strong></p><p>既存実績（不変更）<br /><strong>{value.existingFactCount}件</strong></p><p>衝突<br /><strong>{value.conflictCount}件</strong></p><p>Phase 2実行可否<br /><strong>{value.canProceedInPhase2 ? "実行条件を満たす" : "停止"}</strong></p></div>
    {value.stopReasons.length > 0 && <ul className="mt-3 list-disc pl-5 text-red-700">{value.stopReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
    <ul className="mt-3 list-disc pl-5">{value.notes.map((note) => <li key={note}>{note}</li>)}</ul>
    <p className="mt-3 font-semibold text-amber-800">Phase 2実行前に再検証します。既存実績は加算・上書きせず、未確定バッチには実績を保存しません。</p>
  </div>;
}

function CWorkspace({ preview, request, refreshPreview }: { preview: TownBulkLinkPreview; request: (body: Record<string, unknown>) => Promise<unknown>; refreshPreview: (message?: string) => Promise<void> }) {
  const candidates = useMemo(() => preview.candidates.filter((candidate) => candidate.category === "C"), [preview]);
  const [filter, setFilter] = useState<TownCFilter>({ reason: "ALL", storeId: "ALL", query: "", quick: "ALL", sort: "ROWS", hidePlanned: false });
  const [page, setPage] = useState(1); const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [plans, setPlans] = useState<Record<string, PlanStatus>>({}); const [selectedCasts, setSelectedCasts] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, NewCastDraft>>({}); const [skipReasons, setSkipReasons] = useState<Record<string, string>>({}); const [executionResults, setExecutionResults] = useState<Record<string, string>>({});
  const [impacts, setImpacts] = useState<Record<string, TownBulkLinkImpactPreview>>({}); const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const plannedKeys = useMemo(() => new Set(Object.keys(plans)), [plans]);
  const filtered = useMemo(() => filterTownCCandidates(candidates, filter, plannedKeys), [candidates, filter, plannedKeys]);
  const paged = useMemo(() => pageTownCCandidates(filtered, page), [filtered, page]);
  useEffect(() => { if (page !== paged.page) setPage(paged.page); }, [page, paged.page]);
  function updateFilter(update: Partial<TownCFilter>) { setFilter((current) => ({ ...current, ...update })); setPage(1); }
  function draftFor(candidate: TownBulkLinkCandidate) { return drafts[candidate.key] || { name: candidate.townName, storeId: candidate.storeId, startedOn: candidate.firstDate, note: "", creationReason: "", confirmationText: "" }; }
  async function inspect(candidate: TownBulkLinkCandidate, operation: TownBulkLinkImpactPreview["operation"], extras: Record<string, unknown> = {}) {
    if (pendingKey) return; setPendingKey(candidate.key); setRowErrors((current) => ({ ...current, [candidate.key]: "" }));
    try {
      const result = await request({ action: "IMPACT_PREVIEW", candidateKey: candidate.key, fingerprint: preview.fingerprint, operation, ...extras }) as TownBulkLinkImpactPreview;
      setImpacts((current) => ({ ...current, [candidate.key]: result })); setPlans((current) => ({ ...current, [candidate.key]: { label: operation === "PENDING" ? "保留（画面上のみ）" : operation === "SKIP" ? "除外予定（未実行）" : "影響確認済み", detail: result.canProceedInPhase2 ? "Phase 2実行条件を満たします" : "停止理由あり" } }));
    } catch (cause) { setRowErrors((current) => ({ ...current, [candidate.key]: cause instanceof Error ? cause.message : "影響確認に失敗しました。" })); }
    finally { setPendingKey(null); }
  }
  async function executeCandidate(candidate: TownBulkLinkCandidate, operation: "EXISTING" | "NEW", extras: Record<string, unknown>) {
    const impact = impacts[candidate.key];
    if (!impact || !impact.executable || pendingKey) return;
    setPendingKey(candidate.key); setRowErrors((current) => ({ ...current, [candidate.key]: "" }));
    try {
      const result = await request({ action: "EXECUTE_CANDIDATE", candidateKey: candidate.key, fingerprint: preview.fingerprint, operation, ...extras }) as { resolvedRows: number; affectedBatchCount: number; createdCastId: string | null; aliasId: string; insertedFacts: number };
      const summary = `解決 ${result.resolvedRows}行 / ${result.affectedBatchCount}バッチ・Alias ${result.aliasId}・追加実績 ${result.insertedFacts}件${result.createdCastId ? `・作成Cast ${result.createdCastId}` : ""}`;
      setExecutionResults((current) => ({ ...current, [candidate.key]: summary }));
      await refreshPreview(summary);
    } catch (cause) { setRowErrors((current) => ({ ...current, [candidate.key]: cause instanceof Error ? cause.message : "紐付けに失敗しました。" })); }
    finally { setPendingKey(null); }
  }
  const reasons = [...new Set(candidates.map((candidate) => candidate.reasonCodes[0]))];
  return <div className="min-w-0 space-y-4">
    <p className="flex items-center gap-2 text-xs text-amber-800"><ShieldAlert className="size-4" />候補なしの既存Cast紐付け・新規Cast作成のみ実行できます。ID形式・修正版・候補複数・在籍期間外は引き続き停止します。</p>
    <div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-6">
      <label className="text-xs">理由<select className="town-candidate-input mt-1" value={filter.reason} onChange={(event) => updateFilter({ reason: event.target.value, quick: "ALL" })}><option value="ALL">すべて</option>{reasons.map((reason) => <option key={reason} value={reason}>{REASON_LABELS[reason] || reason}</option>)}</select></label>
      <label className="text-xs">店舗<select className="town-candidate-input mt-1" value={filter.storeId} onChange={(event) => updateFilter({ storeId: event.target.value })}><option value="ALL">すべて</option>{preview.storeOptions.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label className="text-xs">名前検索<input className="town-candidate-input mt-1" value={filter.query} onChange={(event) => updateFilter({ query: event.target.value })} placeholder="Town名" /></label>
      <label className="text-xs">並び順<select className="town-candidate-input mt-1" value={filter.sort} onChange={(event) => updateFilter({ sort: event.target.value as TownCFilter["sort"] })}><option value="ROWS">行数順</option><option value="BATCHES">バッチ数順</option><option value="FIRST_DATE">初回日順</option></select></label>
      <label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={filter.hidePlanned} onChange={(event) => updateFilter({ hidePlanned: event.target.checked })} />対応計画済みを非表示</label>
      <div className="flex items-end text-xs">表示 {filtered.length}人分 / 全{candidates.length}人分</div>
    </div>
    <div className="flex flex-wrap gap-2">{([['ALL','すべて'],['ID','ID形式だけ'],['NO_CANDIDATE','候補なしだけ'],['CORRECTION','修正版だけ']] as const).map(([value,label]) => <button key={value} type="button" className={filter.quick === value ? "primary-button" : "secondary-button"} onClick={() => updateFilter({ quick: value, reason: "ALL" })}>{label}</button>)}</div>
    <div className="table-wrap"><table><thead><tr><th>展開</th><th>Town名</th><th>推奨Cast</th><th>理由</th><th>店舗</th><th>初回日</th><th>最終日</th><th>行数</th><th>バッチ数</th><th>衝突</th><th>対応状況</th><th>操作</th></tr></thead><tbody>{paged.values.map((candidate) => {
      const isOpen = expanded.has(candidate.key); const actions: readonly string[] = townCActionSet(candidate); const selectedId = selectedCasts[candidate.key] || ""; const castChoices = candidateCastOptions(candidate, preview.castOptions); const selectedCast = preview.castOptions.find((cast) => cast.id === selectedId); const draft = draftFor(candidate); const impact = impacts[candidate.key]; const duplicateWarningOnly = Boolean(impact && impact.stopReasons.length > 0 && impact.stopReasons.every((reason) => reason.includes("同名Cast")));
      return <>
        <tr key={candidate.key}><td><button type="button" className="secondary-button !px-2" aria-expanded={isOpen} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(candidate.key)) next.delete(candidate.key); else next.add(candidate.key); return next; })}>{isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</button></td><td className="font-medium text-slate-900">{candidate.townName}</td><td>{candidate.targetCastName || "—"}</td><td className="max-w-[280px] whitespace-normal text-xs">{candidate.reason}</td><td>{candidate.storeName}</td><td>{candidate.firstDate}</td><td>{candidate.lastDate}</td><td>{candidate.rowCount}</td><td>{candidate.batchCount}</td><td>{candidate.conflict ? "あり" : "なし"}</td><td className="whitespace-normal text-xs">{plans[candidate.key]?.label || "未対応"}<br /><span className="text-slate-400">{plans[candidate.key]?.detail}</span></td><td><button type="button" className="secondary-button whitespace-nowrap" aria-expanded={isOpen} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(candidate.key)) next.delete(candidate.key); else next.add(candidate.key); return next; })}>{isOpen ? "閉じる" : "対応"}</button></td></tr>
        {isOpen && <tr key={`${candidate.key}:detail`}><td colSpan={12} className="!bg-white !p-4 whitespace-normal"><div className="min-w-0 space-y-4">
          <div className="grid gap-2 text-xs sm:grid-cols-4"><p>対象: <strong>{candidate.rowCount}行 / {candidate.batchCount}バッチ</strong></p><p>CAST: <strong>{candidate.kindCounts.cast}</strong></p><p>URL: <strong>{candidate.kindCounts.url}</strong></p><p>LP: <strong>{candidate.kindCounts.landing}</strong></p></div>
          {actions.includes("SOURCE_URL") && <div><p className="mb-2 text-xs font-semibold">preview.jsonに保存された元URL</p>{candidate.sourceUrls.length ? <div className="flex flex-wrap gap-2">{candidate.sourceUrls.map((url) => <a key={url} className="secondary-button" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />元URLを開く</a>)}</div> : <p className="text-xs text-amber-700">元URLを取得できる行がありません。URLは推測・生成しません。</p>}</div>}
          {actions.includes("CORRECTION_DIFF") ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs"><p className="font-semibold">修正版候補は通常のAlias処理対象外です。</p><p className="mt-1">差分プレビュー・既存完了版維持・修正版採用はPhase 3で安全な置換設計とともに実装します。現時点では保留のみ記録できます。</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="secondary-button" onClick={() => void inspect(candidate, "CORRECTION_REVIEW")}>差分プレビュー（Phase 3）</button><button type="button" className="secondary-button" onClick={() => void inspect(candidate, "PENDING")}>既存完了版を維持／保留</button><button type="button" className="secondary-button" disabled>修正版を採用（実行不可）</button></div></div> : <>
            {actions.includes("COMPARE") && <div><CandidateComparison candidate={candidate} options={castChoices} /><button type="button" className="secondary-button mt-3" onClick={() => void inspect(candidate, "PENDING")}>比較結果を確認して保留</button></div>}
            {actions.includes("EXISTING") && <div className="min-w-0 space-y-2"><label className="block min-w-0 text-xs font-semibold">既存キャストを選択<select className="town-candidate-input mt-1" value={selectedId} onChange={(event) => { setSelectedCasts((current) => ({ ...current, [candidate.key]: event.target.value })); setImpacts((current) => { const next = { ...current }; delete next[candidate.key]; return next; }); }}><option value="">選択してください</option>{castChoices.map((cast) => <option key={cast.id} value={cast.id}>{cast.displayName} / {cast.primaryStoreName || "未設定"} / {cast.startedOn}〜{cast.endedOn || "在籍中"} / {cast.id}</option>)}</select></label>{selectedCast && <CastDetails cast={selectedCast} />}<button type="button" className="secondary-button" disabled={!selectedId || pendingKey === candidate.key} onClick={() => void inspect(candidate, "EXISTING", { targetCastId: selectedId })}>{pendingKey === candidate.key ? "影響確認中" : "影響範囲を再プレビュー"}</button>{impact?.operation === "EXISTING" && <button type="button" className="primary-button" disabled={pendingKey === candidate.key || !impact.executable} onClick={() => void executeCandidate(candidate, "EXISTING", { targetCastId: selectedId })}>既存Castへ紐付け</button>}</div>}
            {actions.includes("NEW") && <div className="min-w-0 rounded-lg border border-slate-200 p-3"><p className="text-xs font-semibold">新規キャスト作成</p><div className="mt-2 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2"><label className="block min-w-0 text-xs">表示名<input className="town-candidate-input mt-1" value={draft.name} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.key]: { ...draft, name: event.target.value } }))} /></label><label className="block min-w-0 text-xs">主所属店舗<select className="town-candidate-input mt-1" value={draft.storeId} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.key]: { ...draft, storeId: event.target.value } }))}><option value="">未設定</option>{preview.storeOptions.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label><label className="block min-w-0 text-xs">在籍開始日<input type="date" className="town-candidate-input mt-1" value={draft.startedOn} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.key]: { ...draft, startedOn: event.target.value } }))} /></label><label className="block min-w-0 text-xs">メモ<input className="town-candidate-input mt-1" value={draft.note} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.key]: { ...draft, note: event.target.value } }))} /></label><label className="block min-w-0 text-xs xl:col-span-2">作成理由（必須）<input className="town-candidate-input mt-1" value={draft.creationReason} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.key]: { ...draft, creationReason: event.target.value } }))} /></label><label className="block min-w-0 text-xs xl:col-span-2">同名時の確認文言{impact?.stopReasons.some((reason) => reason.includes("同名Cast")) && <span className="text-amber-700">（必須）</span>}<input className="town-candidate-input mt-1" placeholder="同名Castとは別人として新規作成します" value={draft.confirmationText} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.key]: { ...draft, confirmationText: event.target.value } }))} /></label></div><NewCastExecutionControls
              draft={draft}
              impact={impact}
              pending={pendingKey === candidate.key}
              duplicateWarningOnly={duplicateWarningOnly}
              onPreview={() => void inspect(candidate, "NEW", { newCastName: draft.name, newStartedOn: draft.startedOn })}
              onExecute={() => void executeCandidate(candidate, "NEW", { newCastName: draft.name, primaryStoreId: draft.storeId || undefined, newStartedOn: draft.startedOn, note: draft.note, creationReason: draft.creationReason, confirmationText: draft.confirmationText })}
              onReset={() => { setDrafts((current) => { const next = { ...current }; delete next[candidate.key]; return next; }); setImpacts((current) => { const next = { ...current }; delete next[candidate.key]; return next; }); }}
            /></div>}
            <div className="flex flex-wrap items-end gap-2">{actions.includes("SKIP") && <><label className="min-w-64 text-xs">今回除外理由（必須）<input className="town-candidate-input mt-1" value={skipReasons[candidate.key] || ""} onChange={(event) => setSkipReasons((current) => ({ ...current, [candidate.key]: event.target.value }))} /></label><button type="button" className="secondary-button" disabled={!skipReasons[candidate.key]?.trim()} onClick={() => void inspect(candidate, "SKIP")}>今回除外の影響を確認</button></>}<button type="button" className="secondary-button" onClick={() => void inspect(candidate, "PENDING")}>保留（画面上のみ）</button></div>
          </>}
          {rowErrors[candidate.key] && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{rowErrors[candidate.key]}</p>}{executionResults[candidate.key] && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{executionResults[candidate.key]}</p>}{impacts[candidate.key] && <ImpactCard value={impacts[candidate.key]} />}
        </div></td></tr>}
      </>;
    })}</tbody></table></div>
    <div className="flex items-center justify-between text-xs"><p>1ページ25件・{paged.page}/{paged.pageCount}ページ</p><div className="flex gap-2"><button type="button" className="secondary-button" disabled={paged.page <= 1} onClick={() => setPage((value) => value - 1)}>前へ</button><button type="button" className="secondary-button" disabled={paged.page >= paged.pageCount} onClick={() => setPage((value) => value + 1)}>次へ</button></div></div>
  </div>;
}

export function TownBulkLinkPreviewPanel() {
  const [preview, setPreview] = useState<TownBulkLinkPreview | null>(null); const [selectedB, setSelectedB] = useState<Set<string>>(new Set()); const [visibleCategory, setVisibleCategory] = useState<TownBulkLinkCategory>("A"); const [pending, setPending] = useState(false); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const lockRef = useRef(false);
  const byCategory = useMemo(() => ({ A: preview?.candidates.filter((candidate) => candidate.category === "A") || [], B: preview?.candidates.filter((candidate) => candidate.category === "B") || [], C: preview?.candidates.filter((candidate) => candidate.category === "C") || [] }), [preview]);
  async function request(body: Record<string, unknown>) { const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 120_000); try { const response = await fetch("/api/imports/town/bulk/link-candidates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "Town一括紐付け候補の処理に失敗しました。"); return result; } catch (cause) { if (controller.signal.aborted) throw new Error("候補解析がタイムアウトしました。再度お試しください。"); throw cause; } finally { clearTimeout(timeoutId); } }
  async function analyze(statusMessage = "現在のCTI Alias・Cast・在籍期間を使って候補を再計算しました。") { if (lockRef.current) return; lockRef.current = true; setPending(true); setError(null); setMessage(null); try { const result = await request({ action: "PREVIEW" }) as TownBulkLinkPreview; setPreview(result); setSelectedB(new Set()); setMessage(statusMessage); } catch (cause) { setError(cause instanceof Error ? cause.message : "候補解析に失敗しました。"); } finally { lockRef.current = false; setPending(false); } }
  return <section className="panel p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold text-slate-900">CTIを正としたTown未紐付け候補</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">無条件の自動紐付けは行いません。店舗・在籍期間・CTI Alias・表示名・履歴・Town Alias衝突・修正版を確認し、A/B/Cへ分類します。</p></div><button type="button" className="secondary-button" disabled={pending} onClick={() => void analyze()}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}{pending ? "候補解析中" : "自動紐付け候補を解析"}</button></div>{message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{preview && <div className="mt-5 space-y-5"><div className="grid gap-3 sm:grid-cols-3"><SummaryCard label={CATEGORY_LABELS.A} value={preview.categories.A} /><SummaryCard label={CATEGORY_LABELS.B} value={preview.categories.B} /><SummaryCard label={CATEGORY_LABELS.C} value={preview.categories.C} /></div><div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-lg bg-slate-50 p-3">ID形式 <strong>{preview.idFormat.peopleCount}人分 / {preview.idFormat.rowCount}行</strong></div><div className="rounded-lg bg-slate-50 p-3">候補複数 <strong>{preview.multipleCandidates.peopleCount}人分 / {preview.multipleCandidates.rowCount}行</strong></div><div className="rounded-lg bg-slate-50 p-3">在籍期間外 <strong>{preview.outsideEnrollment.peopleCount}人分 / {preview.outsideEnrollment.rowCount}行</strong></div><div className="rounded-lg bg-slate-50 p-3">修正版候補 <strong>{preview.correctionCandidates.peopleCount}人分 / {preview.correctionCandidates.rowCount}行</strong></div><div className="rounded-lg bg-slate-50 p-3">A実行後推定 <strong>WAITING {preview.estimatedWaitingBatchCountAfterA} / 自動確定可能 {preview.estimatedAutoConfirmableFileCountAfterA}</strong><p className="mt-1 text-[11px] text-slate-500">B全承認時：WAITING {preview.estimatedWaitingBatchCountAfterApprovedB} / 自動確定可能 {preview.estimatedAutoConfirmableFileCountAfterApprovedB}</p></div></div><div className="flex flex-wrap gap-2">{(["A", "B", "C"] as const).map((category) => <button key={category} type="button" className={visibleCategory === category ? "primary-button" : "secondary-button"} onClick={() => setVisibleCategory(category)}>{CATEGORY_LABELS[category]}（{preview.categories[category].peopleCount}）</button>)}</div>{visibleCategory === "A" && <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">完全一致・候補1名・期間内・衝突なし・修正版でない候補だけです。Phase 1は確認のみです。</p><button type="button" className="secondary-button" disabled><CheckCircle2 className="size-4" />A一括実行（Phase 2）</button></div><CandidateTable candidates={byCategory.A} /></div>}{visibleCategory === "B" && <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">接頭辞「久」・過去名など、根拠を確認して選択した候補だけ承認します。Phase 1は確認のみです。</p><button type="button" className="secondary-button" disabled><CheckCircle2 className="size-4" />B一括承認（Phase 2）</button></div><CandidateTable candidates={byCategory.B} selected={selectedB} onToggle={(key) => setSelectedB((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} /></div>}{visibleCategory === "C" && <CWorkspace preview={preview} request={request} refreshPreview={analyze} />}<p className="text-[11px] text-slate-400">解析日時：{new Date(preview.generatedAt).toLocaleString("ja-JP")} / 候補フィンガープリント：{preview.fingerprint.slice(0, 12)}…</p></div>}</section>;
}
