import Link from "next/link";
import { ArrowLeft, Download, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { CtiConfirmImport } from "@/components/cti-confirm-import";
import { CtiHeaderDiagnostics } from "@/components/cti-header-diagnostics";
import { CtiReparseButton } from "@/components/cti-reparse-button";
import { CtiRowResolution } from "@/components/cti-row-resolution";
import { PageHeader } from "@/components/page-header";
import { ImportBatchStatus, ImportMode } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { formatDateOnly } from "@/lib/date";
import { inspectCtiWorkbookHeaders } from "@/lib/imports/cti/parser";
import type { CtiPreview } from "@/lib/imports/cti/types";
import { readPreview, readWorkbook } from "@/lib/imports/storage";
import { prisma } from "@/lib/prisma";

function hasDuplicate(metadata: unknown) {
  return Boolean(metadata && typeof metadata === "object" && !Array.isArray(metadata) && "duplicateCompletedBatchId" in metadata);
}

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : value.toLocaleString("ja-JP");
}

export default async function ImportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const batch = await prisma.importBatch.findUnique({ where: { id }, include: { importSource: true, uploadedByUser: true, errors: { orderBy: { createdAt: "asc" } } } });
  if (!batch) notFound();
  let preview: CtiPreview | null = null;
  try { preview = await readPreview<CtiPreview>(id); } catch { preview = null; }
  let headerDiagnostics = preview?.sheets.flatMap((sheet) => sheet.headerDiagnostics ? [sheet.headerDiagnostics] : []) || [];
  if (preview && headerDiagnostics.length < preview.sheets.length) {
    try { headerDiagnostics = await inspectCtiWorkbookHeaders(await readWorkbook(id)); } catch { headerDiagnostics = []; }
  }
  const editable = batch.status === ImportBatchStatus.PREVIEW_READY || batch.status === ImportBatchStatus.WAITING_FOR_CAST_LINK;
  const casts = await prisma.cast.findMany({
    where: { startedOn: { lte: batch.targetTo }, OR: [{ endedOn: null }, { endedOn: { gte: batch.targetTo } }] },
    select: { id: true, displayName: true, startedOn: true, endedOn: true }, orderBy: { displayName: "asc" },
  });
  const castOptions = casts.map((cast) => ({ id: cast.id, displayName: cast.displayName, startedOn: formatDateOnly(cast.startedOn), endedOn: cast.endedOn ? formatDateOnly(cast.endedOn) : null }));
  return <>
    <Link href="/imports" className="mb-5 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-700"><ArrowLeft className="size-4" />取込一覧へ</Link>
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4"><PageHeader eyebrow="CTI PREVIEW" title={batch.originalFilename} description={`${formatDateOnly(batch.targetFrom)}〜${formatDateOnly(batch.targetTo)} / ${batch.importMode}`} /><div className="flex flex-wrap items-start gap-3"><span className="status-badge bg-slate-100 text-slate-700">{batch.status}</span><a href={`/api/imports/${id}/file`} className="secondary-button"><Download className="size-4" />元ファイル</a>{batch.status === ImportBatchStatus.FAILED && <CtiReparseButton batchId={id} />}</div></div>
    <section className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{[
      ["新規", batch.insertedCount], ["更新", batch.updatedCount], ["保留", batch.pendingCount], ["除外", batch.skippedCount], ["警告", batch.warningCount], ["エラー", batch.errorCount],
    ].map(([label, value]) => <div className="panel p-4" key={String(label)}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p></div>)}</section>
    {batch.failureMessage && <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{batch.failureMessage}</p>}
    {preview && preview.globalIssues.length > 0 && <section className="panel mb-6 p-5"><h2 className="flex items-center gap-2 font-semibold text-slate-900"><TriangleAlert className="size-4 text-amber-600" />ファイル全体の確認事項</h2><ul className="mt-3 space-y-2">{preview.globalIssues.map((issue, index) => <li key={`${issue.code}-${index}`} className={`text-sm ${issue.level === "ERROR" ? "text-red-700" : "text-amber-700"}`}>{issue.code}: {issue.message}</li>)}</ul></section>}
    {headerDiagnostics.map((diagnostics) => <CtiHeaderDiagnostics key={diagnostics.sheetName} diagnostics={diagnostics} headerNotFound={Boolean(preview?.globalIssues.some((issue) => issue.code === "HEADER_NOT_FOUND" && issue.message.startsWith(`${diagnostics.sheetName}:`)))} />)}
    {preview?.sheets.map((sheet) => {
      const usable = sheet.rows.filter((row) => row.castId && row.metrics && !row.issues.some((issue) => issue.level === "ERROR"));
      const previewable = sheet.rows.filter((row) => row.metrics && !row.issues.some((issue) => issue.level === "ERROR"));
      const pending = sheet.rows.filter((row) => row.resolutionStatus === "UNMATCHED" || row.resolutionStatus === "AMBIGUOUS");
      const warningCount = sheet.rows.flatMap((row) => row.issues).filter((issue) => issue.level === "WARNING").length;
      const errorCount = sheet.rows.flatMap((row) => row.issues).filter((issue) => issue.level === "ERROR").length;
      return <section key={sheet.sheetName} className="panel mb-6 overflow-hidden"><div className="border-b border-slate-200 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold text-slate-900">{sheet.sheetName}</h2><p className="mt-1 text-xs text-slate-500">ヘッダー行 {sheet.detectedHeaderRow} / 検出列 {sheet.detectedColumns.length} / 除外 {sheet.excludedRows}</p></div><div className="flex flex-wrap gap-2 text-xs"><span className="status-badge bg-sky-50 text-sky-700">読込 {sheet.rows.length}</span><span className="status-badge bg-emerald-50 text-emerald-700">取込可能 {usable.length}</span><span className="status-badge bg-amber-50 text-amber-700">未紐付け {pending.length}</span><span className="status-badge bg-amber-50 text-amber-700">警告 {warningCount}</span><span className="status-badge bg-red-50 text-red-700">エラー {errorCount}</span></div></div><div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-xl"><div><p className="text-xs text-slate-400">料金合計</p><p className="font-semibold">¥{formatNumber(previewable.reduce((sum, row) => sum + row.metrics!.salesAmount, 0))}</p></div><div><p className="text-xs text-slate-400">女子報酬合計</p><p className="font-semibold">¥{formatNumber(previewable.reduce((sum, row) => sum + row.metrics!.castRewardAmount, 0))}</p></div><div><p className="text-xs text-slate-400">成約数合計</p><p className="font-semibold">{formatNumber(previewable.reduce((sum, row) => sum + row.metrics!.contractCount, 0))}</p></div></div></div>
        <div className="table-wrap"><table><thead><tr><th>行</th><th>キャスト原文名</th><th>紐付け</th><th>出勤時間</th><th>料金</th><th>女子報酬</th><th>成約（CTI / 再計算）</th><th>接客（CTI / 再計算）</th><th>状態</th><th>確認事項</th></tr></thead><tbody>{sheet.rows.map((row) => <tr key={row.rowKey}><td>{row.sourceRowNumber}</td><td className="font-medium text-slate-900">{row.originalCastName}</td><td>{row.castDisplayName || "—"}</td><td>{row.metrics ? `${row.metrics.attendanceMinutes}分` : "—"}</td><td>{row.metrics ? `¥${formatNumber(row.metrics.salesAmount)}` : "—"}</td><td>{row.metrics ? `¥${formatNumber(row.metrics.castRewardAmount)}` : "—"}</td><td>{row.metrics ? `${formatNumber(row.metrics.sourceContractCount)} / ${formatNumber(row.metrics.contractCount)}` : "—"}</td><td>{row.metrics ? `${formatNumber(row.metrics.sourceServiceCount)} / ${formatNumber(row.metrics.serviceCount)}` : "—"}</td><td><span className={`status-badge ${row.castId ? "bg-emerald-50 text-emerald-700" : row.resolutionStatus === "SKIPPED" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>{row.resolutionStatus}</span></td><td><div className="max-w-[380px] space-y-2 whitespace-normal text-xs">{editable && !row.castId && row.resolutionStatus !== "SKIPPED" && <CtiRowResolution batchId={id} rowKey={row.rowKey} originalCastName={row.originalCastName} casts={castOptions} targetDate={preview.targetTo} />}{row.issues.map((issue) => <p key={`${issue.code}-${issue.columnName || ""}`} className={issue.level === "ERROR" ? "text-red-600" : "text-amber-700"}>{issue.code}: {issue.message}</p>)}</div></td></tr>)}</tbody></table></div>
      </section>;
    })}
    {preview && editable && <section className="panel p-5"><h2 className="mb-3 font-semibold text-slate-900">取込確定</h2><p className="mb-4 text-sm text-slate-500">保留行が残っていても、紐付け済みかつエラーのない行だけを部分取込できます。既存実績は上書きし、見つからなくなった行は削除しません。</p><CtiConfirmImport batchId={id} disabled={!preview.sheets.some((sheet) => sheet.rows.some((row) => row.castId && row.metrics))} duplicate={hasDuplicate(batch.metadata)} previewOnly={batch.importMode !== ImportMode.DAILY} /></section>}
    {!preview && <section className="panel p-8 text-center text-sm text-slate-500">プレビューデータを読み込めません。取込エラー詳細を確認してください。</section>}
  </>;
}
