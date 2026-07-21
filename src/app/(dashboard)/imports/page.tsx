import Link from "next/link";
import { Download, Eye, FolderSearch } from "lucide-react";
import { ImportUploadForm } from "@/components/import-upload-form";
import { PageHeader } from "@/components/page-header";
import { ImportDataType, MediaType } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { formatDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export default async function ImportsPage() {
  await requireAdmin();
  const [sources, batches] = await Promise.all([
    prisma.importSource.findMany({ where: { isActive: true, mediaType: MediaType.CTI, dataType: ImportDataType.CTI_CAST_REPORT }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.importBatch.findMany({ where: { dataType: ImportDataType.CTI_CAST_REPORT }, include: { importSource: true, uploadedByUser: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return <><PageHeader eyebrow="CTI IMPORT" title="CTI女子別レポート取込" description="XLSXを検証し、プレビューと未紐付け確認を経てから日次実績へ確定します。" />
    <div className="mb-4 flex justify-end"><Link href="/imports/cti/bulk" className="secondary-button"><FolderSearch className="size-4" />ローカルフォルダ一括取込</Link></div>
    <section className="panel mb-6 p-5"><h2 className="text-base font-semibold text-slate-900">新規アップロード</h2><p className="mt-1 text-xs text-slate-500">元ファイルは非公開領域へ保存され、アップロードだけでは実績へ反映されません。</p><div className="mt-5"><ImportUploadForm sources={sources} /></div>{sources.length === 0 && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">CTI女子別レポート用の有効な取込元を先に設定してください。</p>}</section>
    <section className="panel overflow-hidden"><div className="table-wrap"><table><thead><tr><th>取込日時</th><th>ファイル</th><th>対象期間</th><th>種別</th><th>状態</th><th>新規</th><th>更新</th><th>保留</th><th>警告</th><th>エラー</th><th>実行者</th><th></th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td>{batch.createdAt.toLocaleString("ja-JP")}</td><td className="max-w-[220px] truncate font-medium text-slate-900">{batch.originalFilename}</td><td>{formatDateOnly(batch.targetFrom)}〜{formatDateOnly(batch.targetTo)}</td><td>{batch.importMode}</td><td><span className="status-badge bg-slate-100 text-slate-600">{batch.status}</span></td><td>{batch.insertedCount}</td><td>{batch.updatedCount}</td><td>{batch.pendingCount}</td><td>{batch.warningCount}</td><td>{batch.errorCount}</td><td>{batch.uploadedByUser?.displayName || "—"}</td><td><div className="flex gap-2"><Link href={`/imports/${batch.id}`} className="icon-button" title="詳細"><Eye className="size-4" /></Link><a href={`/api/imports/${batch.id}/file`} className="icon-button" title="元ファイル"><Download className="size-4" /></a></div></td></tr>)}</tbody></table>{batches.length === 0 && <p className="empty-state">取込履歴はまだありません。</p>}</div></section>
  </>;
}
