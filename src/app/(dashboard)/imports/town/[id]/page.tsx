import Link from "next/link";
import { ArrowLeft, Download, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { TownConfirmImport } from "@/components/town-confirm-import";
import { TownReparseButton } from "@/components/town-reparse-button";
import { TownRowResolution } from "@/components/town-row-resolution";
import { PageHeader } from "@/components/page-header";
import { ImportBatchStatus, ImportDataType, StoreCode } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { formatDateOnly } from "@/lib/date";
import { readPreview } from "@/lib/imports/storage";
import { canResolveTownRow, openUnmatchedRowNumbers } from "@/lib/imports/town/resolution-policy";
import type { TownPreview, TownPreviewRow } from "@/lib/imports/town/types";
import { prisma } from "@/lib/prisma";

function metadataDuplicate(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).duplicateCompletedBatchId);
}
function number(value: number | null | undefined, digits = 0) { return value === null || value === undefined ? "—" : value.toLocaleString("ja-JP", { maximumFractionDigits: digits }); }
function sourceName(row: TownPreviewRow) { return row.kind === "CAST" ? row.originalCastName : row.kind === "URL" || row.kind === "LANDING" ? row.sourceCastName : null; }

export default async function TownImportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const batch = await prisma.importBatch.findUnique({ where: { id }, include: { importSource: { include: { store: true } }, errors: { orderBy: { createdAt: "asc" } } } });
  if (!batch) notFound();
  let preview: TownPreview | null = null;
  try { preview = await readPreview<TownPreview>(id); } catch { preview = null; }
  const confirmable = batch.status === ImportBatchStatus.PREVIEW_READY || batch.status === ImportBatchStatus.WAITING_FOR_CAST_LINK;
  const reparseable = batch.status === ImportBatchStatus.FAILED || batch.status === ImportBatchStatus.PREVIEW_READY || batch.status === ImportBatchStatus.WAITING_FOR_CAST_LINK;
  const openUnmatchedRows = openUnmatchedRowNumbers(batch.errors);
  const [casts, primaryStores] = await Promise.all([
    prisma.cast.findMany({ where: { mergedIntoCastId: null, startedOn: { lte: batch.targetTo }, OR: [{ endedOn: null }, { endedOn: { gte: batch.targetTo } }] }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    prisma.store.findMany({ where: { code: { in: [StoreCode.KASUKABE, StoreCode.KOSHIGAYA, StoreCode.NODA, StoreCode.KUKI] } }, select: { id: true, shortName: true, code: true }, orderBy: { displayOrder: "asc" } }),
  ]);
  const pv = preview?.rows.reduce((sum, row) => sum + (row.kind === "LANDING" ? 0 : row.pv), 0) || 0;
  const uu = preview?.rows.reduce((sum, row) => sum + row.uu, 0) || 0;
  const tel = preview?.rows.reduce((sum, row) => sum + row.telTapUu, 0) || 0;
  const pending = preview?.rows.filter((row) => row.kind !== "STORE" && row.castId === null && row.resolutionStatus !== "SKIPPED" && openUnmatchedRows.has(row.sourceRowNumber)).length || 0;
  const eligible = preview?.rows.filter((row) => row.resolutionStatus !== "SKIPPED" && !row.issues.some((issue) => issue.level === "ERROR") && (row.kind !== "CAST" || row.castId)).length || 0;
  return <>
    <Link href="/imports/town" className="mb-5 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-700"><ArrowLeft className="size-4" />タウン取込一覧へ</Link>
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4"><PageHeader eyebrow="TOWN PREVIEW" title={batch.originalFilename} description={`${batch.importSource.store?.shortName || "—"} / ${batch.dataType} / ${formatDateOnly(batch.targetFrom)}〜${formatDateOnly(batch.targetTo)}`} /><div className="flex flex-wrap items-start gap-3"><span className="status-badge bg-slate-100 text-slate-700">{batch.status}</span><a href={`/api/imports/${id}/file`} className="secondary-button"><Download className="size-4" />元ファイル</a>{reparseable && <TownReparseButton batchId={id} />}</div></div>
    <section className="mb-6 grid gap-3 sm:grid-cols-4 lg:grid-cols-8">{[["読込", preview?.rows.length || 0], ["取込可能", eligible], ["未紐付け", pending], ["PV", pv], ["UU", uu], ["TEL", tel], ["警告", batch.warningCount], ["エラー", batch.errorCount]].map(([label, value]) => <div className="panel p-4" key={String(label)}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-900">{number(Number(value))}</p></div>)}</section>
    {batch.failureMessage && <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{batch.failureMessage}</p>}
    {preview?.globalIssues.length ? <section className="panel mb-6 p-5"><h2 className="flex items-center gap-2 font-semibold text-slate-900"><TriangleAlert className="size-4 text-amber-600" />ファイル全体の確認事項</h2><ul className="mt-3 space-y-2">{preview.globalIssues.map((issue, index) => <li key={`${issue.code}-${index}`} className={`text-sm ${issue.level === "ERROR" ? "text-red-700" : "text-amber-700"}`}>{issue.code}: {issue.message}</li>)}</ul></section> : null}
    {preview && <section className="panel mb-6 overflow-hidden"><div className="border-b border-slate-200 p-5"><h2 className="font-semibold text-slate-900">プレビュー明細</h2><p className="mt-1 text-xs text-slate-500">文字コード {preview.encoding} / ヘッダー行 {preview.headerRow} / 検出列 {preview.detectedColumns.join(" / ")}</p></div><div className="table-wrap"><table><thead><tr><th>行</th><th>日付</th><th>対象</th><th>ページ種別</th><th>PV</th><th>UU</th><th>平均PV</th><th>直帰率</th><th>TEL</th><th>TEL率</th><th>紐付け</th><th>確認事項</th></tr></thead><tbody>{preview.rows.map((row) => {
      const name = sourceName(row);
      const target = row.kind === "STORE" ? preview.storeName : row.kind === "CAST" ? row.originalCastName : row.kind === "URL" ? row.url : row.landingUrl;
      const canResolve = Boolean(name) && canResolveTownRow(batch.dataType, batch.status, row, openUnmatchedRows);
      return <tr key={row.rowKey}><td>{row.sourceRowNumber}</td><td>{row.date}</td><td className="max-w-[360px] break-all font-medium text-slate-900">{target}</td><td>{row.kind === "URL" || row.kind === "LANDING" ? row.pageType : "—"}</td><td>{row.kind === "LANDING" ? "—" : number(row.pv)}</td><td>{number(row.uu)}</td><td>{row.kind === "LANDING" ? "—" : number(row.averagePv, 2)}</td><td>{row.kind === "STORE" || row.kind === "LANDING" ? `${number(row.bounceRate === null ? null : row.bounceRate * 100, 1)}%` : "—"}</td><td>{number(row.telTapUu)}</td><td>{row.conversionRate === null ? "—" : `${number(row.conversionRate * 100, 2)}%`}</td><td>{"castDisplayName" in row ? row.castDisplayName || "—" : "—"}</td><td><div className="max-w-[520px] space-y-2 whitespace-normal text-xs">{canResolve && <TownRowResolution
        batchId={id}
        rowKey={row.rowKey}
        casts={casts}
        allowNewCast={batch.dataType === ImportDataType.TOWN_CAST && row.kind === "CAST"}
        originalCastName={row.kind === "CAST" ? row.originalCastName : undefined}
        targetDate={row.date}
        primaryStores={primaryStores.map(({ id: storeId, shortName }) => ({ id: storeId, shortName }))}
        defaultPrimaryStoreId={primaryStores.some((store) => store.id === preview.storeId) ? preview.storeId : ""}
      />}{row.issues.map((issue, index) => <p key={`${issue.code}-${index}`} className={issue.level === "ERROR" ? "text-red-600" : "text-amber-700"}>{issue.code}: {issue.message}</p>)}</div></td></tr>;
    })}</tbody></table></div></section>}
    {preview && confirmable && <section className="panel p-5"><h2 className="mb-3 font-semibold text-slate-900">取込確定</h2><p className="mb-4 text-sm text-slate-500">未紐付け女子行は保留し、URL・LPの未紐付けキャストはcast_idを空欄のまま保存できます。削除同期は行いません。</p><TownConfirmImport batchId={id} disabled={eligible === 0} duplicate={metadataDuplicate(batch.metadata)} /></section>}
    {!preview && <section className="panel p-8 text-center text-sm text-slate-500">プレビューデータを読み込めません。</section>}
  </>;
}
