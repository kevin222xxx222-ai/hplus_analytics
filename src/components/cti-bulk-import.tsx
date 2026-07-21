"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, LoaderCircle, PauseCircle, PlayCircle, RefreshCw, ShieldCheck } from "lucide-react";
import {
  type CtiBulkFailure,
  type CtiBulkProgressSummary,
  isCtiBulkReview,
  selectCtiBulkPendingFiles,
  selectCtiBulkRetryFiles,
  summarizeCtiBulkProgress,
} from "@/lib/imports/cti/bulk-progress";
import type { CtiBulkFile, CtiBulkProcessResult, CtiBulkScan } from "@/lib/imports/cti/bulk-types";

const PROCESS_API = "/api/imports/cti/bulk/process";
const SCAN_API = "/api/imports/cti/bulk/scan";
const STATE_LABELS: Record<string, string> = {
  NEW: "新規候補", CORRECTION_CANDIDATE: "修正版候補", EXISTING_BATCH: "既存バッチ",
  SKIPPED_DUPLICATE: "重複スキップ", INVALID: "取込不可", UNSUPPORTED: "対象外",
};
const EMPTY_SCAN: CtiBulkScan = {
  scannedAt: new Date(0).toISOString(), folder: { configured: false, fileCount: 0, targetFileCount: 0, error: null }, importSource: null, files: [],
};
type Progress = CtiBulkProgressSummary & { current: string | null; currentPosition: number | null; stopped: boolean };

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function asProgress(summary: CtiBulkProgressSummary, extra: Partial<Pick<Progress, "current" | "currentPosition" | "stopped">> = {}): Progress {
  return { ...summary, current: null, currentPosition: null, stopped: false, ...extra };
}

function parseResponse(text: string) {
  try { return JSON.parse(text) as CtiBulkProcessResult & { error?: string }; }
  catch { return { error: text.trim() || "応答を解析できませんでした。" } as CtiBulkProcessResult & { error?: string }; }
}

function reconcileFailures(scan: CtiBulkScan, failures: Record<string, CtiBulkFailure>) {
  return Object.fromEntries(Object.entries(failures).filter(([key]) => {
    const file = scan.files.find((candidate) => candidate.key === key);
    return !file || (file.canProcess && file.processStatus !== "PREVIEW_READY" && file.processStatus !== "WAITING_FOR_CAST_LINK");
  }));
}

export function CtiBulkImport() {
  const [scan, setScan] = useState<CtiBulkScan>(EMPTY_SCAN);
  const [scanLoading, setScanLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [reviewOnly, setReviewOnly] = useState(false);
  const [progress, setProgress] = useState<Progress>(asProgress(summarizeCtiBulkProgress([])));
  const [running, setRunning] = useState(false);
  const [failures, setFailures] = useState<Record<string, CtiBulkFailure>>({});
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);
  const stopRequestedRef = useRef(false);

  async function fetchScan() {
    const response = await fetch(SCAN_API, { cache: "no-store" });
    const text = await response.text();
    let result: CtiBulkScan & { error?: string };
    try { result = JSON.parse(text) as CtiBulkScan & { error?: string }; }
    catch { throw new Error(`scan APIがHTTP ${response.status}を返しました。`); }
    if (!response.ok) throw new Error(result.error || `scan APIがHTTP ${response.status}を返しました。`);
    return result;
  }

  async function applyScan() {
    setScanLoading(true); setError(null);
    try {
      const result = await fetchScan();
      const nextFailures = reconcileFailures(result, failures);
      setScan(result); setFailures(nextFailures); setProgress(asProgress(summarizeCtiBulkProgress(result.files, nextFailures)));
      return result;
    } finally { setScanLoading(false); }
  }

  useEffect(() => {
    let active = true;
    void fetchScan().then((result) => {
      if (!active) return;
      setScan(result); setProgress(asProgress(summarizeCtiBulkProgress(result.files))); setScanLoading(false);
    }).catch((caught) => {
      if (!active) return;
      setError(caught instanceof Error ? caught.message : "フォルダ走査に失敗しました。"); setScanLoading(false);
    });
    return () => { active = false; };
  }, []);

  const pendingFiles = useMemo(() => selectCtiBulkPendingFiles(scan.files), [scan.files]);
  const retryFiles = useMemo(() => selectCtiBulkRetryFiles(scan.files, failures), [failures, scan.files]);
  const selectedFiles = useMemo(() => pendingFiles.filter((file) => selectedKeys.has(file.key)), [pendingFiles, selectedKeys]);
  const confirmCandidates = useMemo(() => scan.files.filter((file) => file.autoConfirmSafe && file.processStatus === "PREVIEW_READY"), [scan.files]);
  const visibleFiles = useMemo(() => reviewOnly ? scan.files.filter((file) => isCtiBulkReview(file) || file.processStatus === "FAILED" || failures[file.key]) : scan.files, [failures, reviewOnly, scan.files]);
  const targetPositions = useMemo(() => new Map(scan.files.filter((file) => file.targetDate).map((file, index) => [file.key, index + 1])), [scan.files]);

  async function run(files: CtiBulkFile[], action: "VALIDATE" | "CONFIRM_SAFE", retryFailed = false) {
    if (runningRef.current || files.length === 0) return;
    runningRef.current = true; stopRequestedRef.current = false; setRunning(true); setError(null);
    let currentSummary = summarizeCtiBulkProgress(scan.files, failures);
    let nextFailures = { ...failures };
    setProgress(asProgress(currentSummary));

    for (const file of files) {
      if (stopRequestedRef.current) break;
      const position = targetPositions.get(file.key) || currentSummary.processed + 1;
      setProgress(asProgress(currentSummary, { current: file.filename, currentPosition: position }));
      let httpStatus: number | null = null;
      try {
        const response = await fetch(PROCESS_API, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: file.key, action, retryFailed }),
        });
        httpStatus = response.status;
        const result = parseResponse(await response.text());
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        const processed = Math.min(currentSummary.total, currentSummary.processed + 1);
        currentSummary = {
          ...currentSummary, processed, remaining: Math.max(0, currentSummary.total - processed),
          duplicates: currentSummary.duplicates + (result.outcome === "SKIPPED_DUPLICATE" ? 1 : 0),
          review: currentSummary.review + (result.outcome === "NEEDS_REVIEW" ? 1 : 0),
          completed: currentSummary.completed + (["VALIDATED", "EXISTING_BATCH", "CONFIRMED"].includes(result.outcome) ? 1 : 0),
          percent: currentSummary.total > 0 && processed === currentSummary.total ? 100 : currentSummary.total ? Math.floor((processed / currentSummary.total) * 100) : 0,
        };
        delete nextFailures[file.key];
      } catch (caught) {
        const failure: CtiBulkFailure = {
          key: file.key, filename: file.filename, position, httpStatus, apiUrl: PROCESS_API,
          message: caught instanceof Error ? caught.message : "通信または処理に失敗しました。",
        };
        nextFailures[file.key] = failure;
        const processed = Math.min(currentSummary.total, currentSummary.processed + 1);
        currentSummary = {
          ...currentSummary, processed, failed: currentSummary.failed + 1, remaining: Math.max(0, currentSummary.total - processed),
          percent: currentSummary.total > 0 && processed === currentSummary.total ? 100 : currentSummary.total ? Math.floor((processed / currentSummary.total) * 100) : 0,
        };
      }
      setFailures({ ...nextFailures });
      setProgress(asProgress(currentSummary, { current: file.filename, currentPosition: position }));
    }

    const stopped = stopRequestedRef.current;
    runningRef.current = false; setRunning(false);
    try {
      const nextScan = await fetchScan();
      nextFailures = reconcileFailures(nextScan, nextFailures);
      setScan(nextScan); setFailures(nextFailures);
      setProgress(asProgress(summarizeCtiBulkProgress(nextScan.files, nextFailures), { stopped: stopped && selectCtiBulkPendingFiles(nextScan.files).length > 0 }));
    } catch (caught) {
      setFailures(nextFailures); setProgress(asProgress(currentSummary, { stopped }));
      setError(caught instanceof Error ? caught.message : "処理後の再走査に失敗しました。");
    }
  }

  function stop() {
    stopRequestedRef.current = true;
    setProgress((current) => ({ ...current, stopped: true }));
  }

  return <div className="space-y-6">
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="font-semibold text-slate-900">許可フォルダ</h2><p className="mt-1 text-xs text-slate-500">環境変数で固定されたCTIフォルダだけを読み取ります。画面からパスは変更できません。</p></div>
        <button type="button" className="secondary-button" disabled={running || scanLoading} onClick={() => void applyScan().catch((caught) => setError(caught instanceof Error ? caught.message : "再走査に失敗しました。"))}><RefreshCw className={`size-4 ${scanLoading ? "animate-spin" : ""}`} />フォルダ再走査</button>
      </div>
      <div className="mt-4 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><strong>CTI女子別レポート</strong><span>対象{scan.folder.targetFileCount} XLSX / 全{scan.folder.fileCount}ファイル</span></div><p className="mt-1 text-xs text-slate-500">取込元：{scan.importSource?.name || (scanLoading ? "読込中" : "未設定または複数")}</p>{scan.folder.error && <p className="mt-2 text-xs text-red-700">{scan.folder.error}</p>}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="primary-button" disabled={running || scanLoading || pendingFiles.length === 0} onClick={() => void run(pendingFiles, "VALIDATE")}><ShieldCheck className="size-4" />全件検証</button>
        <button type="button" className="secondary-button" disabled={running || !progress.stopped || pendingFiles.length === 0} onClick={() => void run(pendingFiles, "VALIDATE")}><PlayCircle className="size-4" />再開</button>
        <button type="button" className="secondary-button" disabled={!running || progress.stopped} onClick={stop}><PauseCircle className="size-4" />停止</button>
        <button type="button" className="secondary-button" disabled={running || confirmCandidates.length === 0} onClick={() => void run(confirmCandidates, "CONFIRM_SAFE")}><CheckCircle2 className="size-4" />安全なファイルだけ一括確定</button>
        <button type="button" className="secondary-button" disabled={running || selectedFiles.length === 0} onClick={() => void run(selectedFiles, "VALIDATE")}>選択ファイルだけ検証</button>
        <button type="button" className="secondary-button" disabled={running || retryFiles.length === 0} onClick={() => void run(retryFiles, "VALIDATE", true)}>失敗のみ再試行</button>
        <button type="button" className="secondary-button" aria-pressed={reviewOnly} onClick={() => setReviewOnly((current) => !current)}>{reviewOnly ? "全件表示" : "要確認だけ表示"}</button>
        <button type="button" className="secondary-button" disabled={running} onClick={() => setSelectedKeys(new Set(pendingFiles.map((file) => file.key)))}>未処理を全選択</button>
        <button type="button" className="secondary-button" disabled={running} onClick={() => setSelectedKeys(new Set())}>選択解除</button>
        <span className="self-center text-sm text-slate-500">選択中：{selectedKeys.size}件</span>
      </div>

      <div className="mt-5 rounded-xl bg-slate-50 p-4" aria-live="polite">
        <div className="flex flex-wrap justify-between gap-2 text-sm"><span>処理済み{progress.processed}／全{progress.total} ・ 完了{progress.completed} ・ 重複{progress.duplicates} ・ 要確認{progress.review} ・ 失敗{progress.failed}</span><strong>{progress.percent}%</strong></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${progress.percent}%` }} /></div>
        <p className="mt-2 text-xs text-slate-500">{progress.current ? <><LoaderCircle className="mr-1 inline size-3 animate-spin" />{progress.currentPosition}件目：{progress.current}</> : progress.stopped ? `停止中：未処理${progress.remaining}件` : progress.remaining > 0 ? `未処理${progress.remaining}件` : progress.total > 0 ? "全対象の検証状態を確認済み" : "フォルダ走査中"}</p>
        {progress.stopped && running && <p className="mt-1 text-xs text-amber-700">現在の1ファイル完了後に停止します。</p>}
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {Object.values(failures).length > 0 && <div className="mt-4 space-y-2">{Object.values(failures).map((failure) => <div key={failure.key} className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><strong>{failure.position}件目：{failure.filename}</strong><p className="mt-1">API: {failure.apiUrl} / HTTP: {failure.httpStatus ?? "通信失敗"}</p><p>{failure.message}</p><button type="button" className="secondary-button mt-2" disabled={running} onClick={() => { const file = scan.files.find((candidate) => candidate.key === failure.key); if (file) void run([file], "VALIDATE", true); }}>このファイルを再試行</button></div>)}</div>}
    </section>

    <section className="panel overflow-hidden"><div className="table-wrap max-h-[680px]"><table><thead><tr><th>選択</th><th>ファイル名</th><th>対象日</th><th>サイズ</th><th>SHA-256</th><th>重複判定</th><th>状態</th><th>取込可能</th><th>未紐付け</th><th>警告</th><th>エラー</th><th></th></tr></thead><tbody>{visibleFiles.map((file) => <tr key={file.key} className={failures[file.key] ? "bg-red-50/50" : ""}>
      <td><input type="checkbox" aria-label={`${file.filename}を選択`} disabled={!pendingFiles.some((candidate) => candidate.key === file.key) || running} checked={selectedKeys.has(file.key)} onChange={() => setSelectedKeys((current) => { const next = new Set(current); if (next.has(file.key)) next.delete(file.key); else next.add(file.key); return next; })} /></td>
      <td className="max-w-[300px] font-medium text-slate-900"><span className="break-all">{file.filename}</span>{(file.error || failures[file.key]) && <p className="mt-1 text-xs text-red-700">{failures[file.key]?.message || file.error}</p>}</td>
      <td>{file.targetDate || "—"}</td><td>{formatBytes(file.size)}</td><td className="font-mono text-[10px]">{file.sha256 ? `${file.sha256.slice(0, 12)}…` : "—"}</td>
      <td>{STATE_LABELS[file.state] || file.state}{file.correctionBatchIds.length > 0 && <p className="text-xs text-amber-700">同日別SHA {file.correctionBatchIds.length}件</p>}</td>
      <td>{file.processStatus}</td><td>{file.importableCount}</td><td>{file.unmatchedCount || file.pendingCount}</td><td>{file.warningCount}</td><td>{file.errorCount}</td>
      <td><div className="flex gap-2">{file.batchId && <Link href={`/imports/${file.batchId}`} className="icon-button" title="要確認バッチを開く"><ExternalLink className="size-4" /></Link>}{failures[file.key] && <button type="button" className="secondary-button whitespace-nowrap" disabled={running} onClick={() => void run([file], "VALIDATE", true)}>再試行</button>}</div></td>
    </tr>)}</tbody></table></div><p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">走査日時：{scan.scannedAt === EMPTY_SCAN.scannedAt ? "読込中" : new Date(scan.scannedAt).toLocaleString("ja-JP")}。対象は「女子別レポート_YYYYMMDD.xlsx」だけです。</p></section>
  </div>;
}
