import Link from "next/link";
import { Download, Eye, FolderSearch } from "lucide-react";
import { TownUploadForm } from "@/components/town-upload-form";
import { PageHeader } from "@/components/page-header";
import { ImportDataType, MediaType } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { formatDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";

const townTypes = [ImportDataType.TOWN_STORE, ImportDataType.TOWN_CAST, ImportDataType.TOWN_URL, ImportDataType.TOWN_LANDING];
const labels: Record<string, string> = { TOWN_STORE: "店舗別", TOWN_CAST: "女子別", TOWN_URL: "URL別", TOWN_LANDING: "LP別" };

export default async function TownImportsPage() {
  await requireAdmin();
  const [sources, batches] = await Promise.all([
    prisma.importSource.findMany({ where: { isActive: true, mediaType: MediaType.TOWN, dataType: { in: townTypes }, store: { hasAcquisitionMetrics: true } }, include: { store: true }, orderBy: [{ store: { displayOrder: "asc" } }, { dataType: "asc" }] }),
    prisma.importBatch.findMany({ where: { dataType: { in: townTypes } }, include: { importSource: { include: { store: true } }, uploadedByUser: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const formSources = sources.flatMap((source) => source.store ? [{ id: source.id, name: source.name, storeId: source.store.id, storeName: source.store.shortName, dataType: source.dataType }] : []);
  return <><PageHeader eyebrow="TOWN IMPORT" title="デリヘルタウン取込" description="春日部・越谷を明示選択し、CSVを検証・プレビューしてから日次アクセス実績へ確定します。" />
    <div className="mb-4 flex justify-end"><Link href="/imports/town/bulk" className="secondary-button"><FolderSearch className="size-4" />ローカルフォルダ一括取込</Link></div>
    <section className="panel mb-6 p-5"><h2 className="text-base font-semibold text-slate-900">新規アップロード</h2><p className="mt-1 text-xs text-slate-500">ファイル名では店舗判定しません。元CSVは非公開領域へ保存されます。</p><div className="mt-5"><TownUploadForm sources={formSources} /></div>{sources.length < 8 && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Town用取込元が不足しています。シードを適用してください。</p>}</section>
    <section className="panel overflow-hidden"><div className="table-wrap"><table><thead><tr><th>取込日時</th><th>店舗</th><th>種別</th><th>ファイル</th><th>対象期間</th><th>状態</th><th>新規</th><th>更新</th><th>保留</th><th>警告</th><th>エラー</th><th></th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td>{batch.createdAt.toLocaleString("ja-JP")}</td><td>{batch.importSource.store?.shortName || "—"}</td><td>{labels[batch.dataType] || batch.dataType}</td><td className="max-w-[220px] truncate font-medium text-slate-900">{batch.originalFilename}</td><td>{formatDateOnly(batch.targetFrom)}〜{formatDateOnly(batch.targetTo)}</td><td><span className="status-badge bg-slate-100 text-slate-600">{batch.status}</span></td><td>{batch.insertedCount}</td><td>{batch.updatedCount}</td><td>{batch.pendingCount}</td><td>{batch.warningCount}</td><td>{batch.errorCount}</td><td><div className="flex gap-2"><Link href={`/imports/town/${batch.id}`} className="icon-button" title="詳細"><Eye className="size-4" /></Link><a href={`/api/imports/${batch.id}/file`} className="icon-button" title="元ファイル"><Download className="size-4" /></a></div></td></tr>)}</tbody></table>{batches.length === 0 && <p className="empty-state">タウン取込履歴はまだありません。</p>}</div></section>
  </>;
}
