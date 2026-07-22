"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { TownBulkLinkPreviewPanel } from "@/components/town-bulk-link-preview";
import { runTownBulkSequentially, selectTownBulkReparseCandidates } from "@/lib/imports/town/bulk-order";
import type { TownBulkFile, TownBulkProcessResult, TownBulkScan } from "@/lib/imports/town/bulk-types";

const TYPE_LABELS: Record<string, string> = { TOWN_STORE: "店舗", TOWN_CAST: "女子", TOWN_URL: "URL", TOWN_LANDING: "LP" };
const STATE_LABELS: Record<string, string> = {
  NEW: "新規候補", CORRECTION_CANDIDATE: "修正版候補", EXISTING_BATCH: "既存バッチ", SKIPPED_DUPLICATE: "重複スキップ", INVALID: "取込不可", UNSUPPORTED: "対象外",
};

type Progress = { total: number; completed: number; duplicates: number; review: number; failed: number; current: string | null };

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

// Keep the initial server and client markup byte-for-byte identical. Locale
// formatting can differ between the Node runtime and the browser (especially
// timezone/ICU data), which would abort hydration before the bulk workspace
// becomes interactive.
export function formatScanTimestamp(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().replace("T", " ").replace(".000Z", "Z");
}

export function TownBulkImport({ initialScan }: { initialScan: TownBulkScan }) {
  const [scan, setScan] = useState(initialScan);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [scanPending, setScanPending] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);
  const scanRef = useRef(false);
  const processable = useMemo(() => scan.files.filter((file) => file.canProcess), [scan.files]);
  const validationCandidates = useMemo(() => scan.files.filter((file) => file.canProcess || file.state === "SKIPPED_DUPLICATE"), [scan.files]);
  const confirmCandidates = useMemo(() => scan.files.filter((file) => file.canProcess || (file.autoConfirmSafe && file.processStatus === "PREVIEW_READY")), [scan.files]);
  const reparseCandidates = useMemo(() => selectTownBulkReparseCandidates(scan.files), [scan.files]);

  async function rescan() {
    if (runningRef.current || scanRef.current) return;
    scanRef.current = true;
    setScanPending(true);
    setError(null);
    setScanMessage("再走査中");
    try {
      const apiUrl = "/api/imports/town/bulk/scan";
      const response = await fetch(apiUrl, { cache: "no-store" });
      const result = await response.json().catch(() => ({})) as Partial<TownBulkScan> & { error?: string };
      if (!response.ok) throw new Error(`${apiUrl} / HTTP ${response.status}: ${result.error || "フォルダ再走査に失敗しました。"}`);
      setScan(result as TownBulkScan);
      setScanMessage(`再走査完了：${result.files?.length ?? 0}ファイル`);
    } finally {
      scanRef.current = false;
      setScanPending(false);
    }
  }

  async function run(files: TownBulkFile[], action: "VALIDATE" | "CONFIRM_SAFE" | "CONFIRM_PARTIAL" | "CONFIRM_ID_NO_SOURCE_URL_PARTIAL", retryFailed = false) {
    if (runningRef.current || files.length === 0) return;
    runningRef.current = true;
    setRunning(true);
    setError(null);
    setProgress({ total: files.length, completed: 0, duplicates: 0, review: 0, failed: 0, current: null });
    let completed = 0; let duplicates = 0; let review = 0; let failed = 0;
    const nextFailures = { ...failures };
    await runTownBulkSequentially(files, async (file) => {
      setProgress({ total: files.length, completed, duplicates, review, failed, current: file.filename });
      const response = await fetch("/api/imports/town/bulk/process", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: file.key, action, retryFailed }),
      });
      const result = await response.json() as TownBulkProcessResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "処理に失敗しました。");
      if (result.outcome === "SKIPPED_DUPLICATE") duplicates += 1;
      else if (result.outcome === "NEEDS_REVIEW") review += 1;
      else completed += 1;
      delete nextFailures[file.key];
      setProgress({ total: files.length, completed, duplicates, review, failed, current: file.filename });
      return result;
    }).then((results) => {
      for (const item of results) if (item.error) {
        failed += 1;
        nextFailures[item.item.key] = item.error;
        setProgress({ total: files.length, completed, duplicates, review, failed, current: item.item.filename });
      }
    });
    setFailures(nextFailures);
    setProgress({ total: files.length, completed, duplicates, review, failed, current: null });
    runningRef.current = false;
    setRunning(false);
    try { await rescan(); } catch (caught) { setError(caught instanceof Error ? caught.message : "再走査に失敗しました。"); }
  }

  async function reparseAll() {
    if (runningRef.current || reparseCandidates.length === 0) return;
    runningRef.current = true;
    setRunning(true);
    setError(null);
    setProgress({ total: reparseCandidates.length, completed: 0, duplicates: 0, review: 0, failed: 0, current: null });
    let completed = 0; let review = 0; let failed = 0;
    const nextFailures = { ...failures };
    try {
      await runTownBulkSequentially(reparseCandidates, async (file) => {
        setProgress({ total: reparseCandidates.length, completed, duplicates: 0, review, failed, current: file.filename });
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120_000);
        try {
          const response = await fetch(`/api/imports/town/${file.batchId}/reparse`, { method: "POST", signal: controller.signal });
          const result = await response.json() as { after?: { unmatchedCount: number; errorCount: number }; error?: string };
          if (!response.ok) throw new Error(result.error || "再解析に失敗しました。");
          if ((result.after?.unmatchedCount || 0) > 0 || (result.after?.errorCount || 0) > 0) review += 1;
          else completed += 1;
          delete nextFailures[file.key];
          return result;
        } catch (cause) {
          throw new Error(controller.signal.aborted ? "再解析がタイムアウトしました。再度お試しください。" : cause instanceof Error ? cause.message : "再解析に失敗しました。");
        } finally {
          clearTimeout(timeoutId);
          setProgress({ total: reparseCandidates.length, completed, duplicates: 0, review, failed, current: file.filename });
        }
      }).then((results) => {
        for (const item of results) if (item.error) {
          failed += 1;
          nextFailures[item.item.key] = item.error;
        }
      });
    } finally {
      setFailures(nextFailures);
      setProgress({ total: reparseCandidates.length, completed, duplicates: 0, review, failed, current: null });
      runningRef.current = false;
      setRunning(false);
    }
    try { await rescan(); } catch (caught) { setError(caught instanceof Error ? caught.message : "再走査に失敗しました。"); }
  }

  const selectedFiles = scan.files.filter((file) => selectedKeys.has(file.key) && file.canProcess);
  const partialConfirmCandidates = useMemo(() => scan.files.filter((file) => file.partialConfirmEligible), [scan.files]);
  const partialSummary = scan.partialConfirmSummary || { fileCount: partialConfirmCandidates.length, unmatchedRows: partialConfirmCandidates.reduce((n, file) => n + (file.partialUnmatchedUrlCount || 0) + (file.partialUnmatchedLandingCount || 0), 0), urlRows: partialConfirmCandidates.reduce((n, file) => n + (file.partialUnmatchedUrlCount || 0), 0), landingRows: partialConfirmCandidates.reduce((n, file) => n + (file.partialUnmatchedLandingCount || 0), 0), saveRows: partialConfirmCandidates.reduce((n, file) => n + (file.partialSaveRowCount || 0), 0) };
  const idNoSourceUrlPartialCandidates = useMemo(() => scan.files.filter((file) => file.idNoSourceUrlPartialConfirmEligible), [scan.files]);
  const idNoSourceUrlPartialSummary = scan.idNoSourceUrlPartialSummary || {
    fileCount: idNoSourceUrlPartialCandidates.length,
    saveRows: idNoSourceUrlPartialCandidates.reduce((n, file) => n + (file.idNoSourceUrlPartialSaveRowCount || 0), 0),
    newRows: idNoSourceUrlPartialCandidates.reduce((n, file) => n + (file.idNoSourceUrlPartialNewRowCount || 0), 0),
    updatedRows: idNoSourceUrlPartialCandidates.reduce((n, file) => n + (file.idNoSourceUrlPartialUpdatedRowCount || 0), 0),
    heldRows: idNoSourceUrlPartialCandidates.reduce((n, file) => n + (file.idNoSourceUrlPartialHeldRowCount || 0), 0),
  };
  const failedFiles = scan.files.filter((file) => failures[file.key]);
  const percent = progress?.total ? Math.round(((progress.completed + progress.duplicates + progress.review + progress.failed) / progress.total) * 100) : 0;

  return <div className="space-y-6">
    <TownBulkLinkPreviewPanel onBatchChanged={rescan} />
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="font-semibold text-slate-900">許可フォルダ</h2><p className="mt-1 text-xs text-slate-500">環境変数で固定された春日部・越谷フォルダだけを読み取ります。画面からパスは変更できません。</p></div>
        <button type="button" className="secondary-button" disabled={running || scanPending} onClick={() => void rescan().catch((caught) => setError(caught instanceof Error ? caught.message : "再走査に失敗しました。"))}><RefreshCw className={`size-4 ${scanPending ? "animate-spin" : ""}`} />{scanPending ? "再走査中" : "フォルダ再走査"}</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{scan.folders.map((folder) => { const csvCount = scan.files.filter((file) => file.folderKey === folder.folderKey && file.dataType).length; return <div key={folder.folderKey} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between"><strong>{folder.storeName}</strong><span>{csvCount} CSV / 全{folder.fileCount}ファイル</span></div>{folder.error && <p className="mt-2 text-xs text-red-700">{folder.error}</p>}</div>; })}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="primary-button" disabled={running || validationCandidates.length === 0} onClick={() => void run(validationCandidates, "VALIDATE")}><ShieldCheck className="size-4" />全件検証</button>
        <button type="button" className="secondary-button" disabled={running || reparseCandidates.length === 0} onClick={() => void reparseAll()}><RefreshCw className="size-4" />未確定Townバッチを全再解析</button>
        <button type="button" className="secondary-button" disabled={running || confirmCandidates.length === 0} onClick={() => void run(confirmCandidates, "CONFIRM_SAFE")}><CheckCircle2 className="size-4" />安全なファイルだけ一括確定</button>
        <button type="button" className="secondary-button" disabled={running || partialConfirmCandidates.length === 0} onClick={() => { if (window.confirm(`URL/LP未紐付け${partialSummary.unmatchedRows}行を含む${partialSummary.fileCount}ファイルを部分確定します。\n未紐付けURL/LPはcastIdなしで保存され、現時点ではキャスト別分析に入りません。実行しますか？`)) void run(partialConfirmCandidates, "CONFIRM_PARTIAL"); }}><CheckCircle2 className="size-4" />URL/LP未紐付けを含めて部分確定</button>
        {partialConfirmCandidates.length > 0 && <span className="self-center text-xs text-amber-700">対象{partialSummary.fileCount}ファイル / 未紐付け{partialSummary.unmatchedRows}行（URL {partialSummary.urlRows}・LP {partialSummary.landingRows}）</span>}
        <button type="button" className="secondary-button" disabled={running || idNoSourceUrlPartialCandidates.length === 0} onClick={() => { if (window.confirm(`ID不明CAST${idNoSourceUrlPartialSummary.heldRows}行を保留したまま、${idNoSourceUrlPartialSummary.fileCount}ファイルの紐付け済みCAST${idNoSourceUrlPartialSummary.saveRows}行を部分確定します。\nキャスト名を特定できない行は保存されません。実行しますか？`)) void run(idNoSourceUrlPartialCandidates, "CONFIRM_ID_NO_SOURCE_URL_PARTIAL"); }}><CheckCircle2 className="size-4" />ID不明CASTを保留して部分確定</button>
        {idNoSourceUrlPartialCandidates.length > 0 && <span className="self-center text-xs text-amber-700">対象{idNoSourceUrlPartialSummary.fileCount}ファイル / 保存見込み{idNoSourceUrlPartialSummary.saveRows}行（新規{idNoSourceUrlPartialSummary.newRows}・更新{idNoSourceUrlPartialSummary.updatedRows}） / D保留{idNoSourceUrlPartialSummary.heldRows}行</span>}
        <button type="button" className="secondary-button" disabled={running || selectedFiles.length === 0} onClick={() => void run(selectedFiles, "VALIDATE")}>選択ファイルだけ検証</button>
        <button type="button" className="secondary-button" disabled={running || failedFiles.length === 0} onClick={() => void run(failedFiles, "VALIDATE", true)}>失敗ファイルだけ再試行</button>
        <button type="button" className="secondary-button" onClick={() => setSelectedKeys(new Set(processable.map((file) => file.key)))}>処理可能を全選択</button>
        <button type="button" className="secondary-button" onClick={() => setSelectedKeys(new Set())}>選択解除</button>
        <span className="self-center text-sm text-slate-500">選択中：{selectedKeys.size}件</span>
      </div>
      {progress && <div className="mt-5 rounded-xl bg-slate-50 p-4" aria-live="polite">
        <div className="flex flex-wrap justify-between gap-2 text-sm"><span>全{progress.total} / 完了{progress.completed} / 重複{progress.duplicates} / 要確認{progress.review} / 失敗{progress.failed}</span><strong>{percent}%</strong></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${percent}%` }} /></div>
        <p className="mt-2 text-xs text-slate-500">{progress.current ? <><LoaderCircle className="mr-1 inline size-3 animate-spin" />処理中：{progress.current}</> : "待機中"}</p>
      </div>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {scanMessage && <p role="status" className="mt-3 text-sm text-slate-600" aria-live="polite">{scanMessage}</p>}
    </section>

    <section className="panel overflow-hidden">
      <div className="table-wrap max-h-[680px]"><table><thead><tr><th>選択</th><th>店舗</th><th>ファイル名</th><th>種別</th><th>対象日</th><th>サイズ</th><th>SHA-256</th><th>既存取込</th><th>処理状態</th><th>未紐付け</th><th>警告</th><th>エラー</th><th></th></tr></thead>
        <tbody>{scan.files.map((file) => <tr key={file.key} className={failures[file.key] ? "bg-red-50/50" : ""}>
          <td><input type="checkbox" aria-label={`${file.filename}を選択`} disabled={!file.canProcess || running} checked={selectedKeys.has(file.key)} onChange={() => setSelectedKeys((current) => { const next = new Set(current); if (next.has(file.key)) next.delete(file.key); else next.add(file.key); return next; })} /></td>
          <td>{file.storeName}</td><td className="max-w-[300px] font-medium text-slate-900"><span className="break-all">{file.filename}</span>{(file.error || failures[file.key]) && <p className="mt-1 text-xs text-red-700">{failures[file.key] || file.error}</p>}</td>
          <td>{file.dataType ? TYPE_LABELS[file.dataType] : "—"}</td><td>{file.targetFrom ? `${file.targetFrom}${file.targetTo !== file.targetFrom ? `〜${file.targetTo}` : ""}` : "—"}</td><td>{formatBytes(file.size)}</td>
          <td className="font-mono text-[10px]">{file.sha256 ? `${file.sha256.slice(0, 12)}…` : "—"}</td><td>{STATE_LABELS[file.state] || file.state}{file.correctionBatchIds.length > 0 && <p className="text-xs text-amber-700">別SHA {file.correctionBatchIds.length}件</p>}</td>
          <td>{file.processStatus}</td><td>{file.unmatchedCount || file.pendingCount}</td><td>{file.warningCount}</td><td>{file.errorCount}</td>
          <td><div className="flex gap-2">{file.batchId && <Link href={`/imports/town/${file.batchId}`} className="icon-button" title="要確認バッチを開く"><ExternalLink className="size-4" /></Link>}{failures[file.key] && <button type="button" className="secondary-button whitespace-nowrap" disabled={running} onClick={() => void run([file], "VALIDATE", true)}>再試行</button>}</div></td>
        </tr>)}</tbody></table></div>
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">走査日時：{formatScanTimestamp(scan.scannedAt)}。ファイル名の「(1)」は店舗判定に使用せず、格納フォルダを正とします。</p>
    </section>
  </div>;
}
