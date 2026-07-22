import Link from "next/link";
import { HeavenUploadForm } from "@/components/heaven-upload-form";
import { HeavenDuplicateAction } from "@/components/heaven-duplicate-action";
import { PageHeader } from "@/components/page-header";
import { ImportDataType } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export default async function HeavenImportsPage() {
  await requireAdmin();
  const [stores, batches, completed] = await Promise.all([
    prisma.store.findMany({ where: { isActive: true, hasAcquisitionMetrics: true }, orderBy: { displayOrder: "asc" } }),
    prisma.importBatch.findMany({ where: { dataType: { in: [ImportDataType.HEAVEN_STORE, ImportDataType.HEAVEN_CAST] } }, include: { importSource: { include: { store: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.importBatch.findMany({ where: { dataType: { in: [ImportDataType.HEAVEN_STORE, ImportDataType.HEAVEN_CAST] }, status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } }, select: { id: true, fileHash: true, dataType: true, importSource: { select: { storeId: true } }, status: true }, orderBy: { completedAt: "desc" } }),
  ]);
  const completedByKey = new Map(completed.map((b) => [`${b.fileHash}:${b.dataType}:${b.importSource.storeId || ""}`, b]));
  return <><PageHeader eyebrow="HEAVEN IMPORT" title="Heaven CSV取込" description="店舗CSVは内容から判定し、女子CSVは指標を明示して検証・プレビューします。確定保存はこのフェーズでは変更されません。" /><section className="panel mb-6 p-5"><HeavenUploadForm stores={stores.map((s) => ({ id: s.id, name: s.shortName }))} /></section><section className="panel overflow-hidden"><div className="table-wrap"><table><thead><tr><th>日時</th><th>店舗</th><th>ファイル</th><th>種別</th><th>状態</th><th>未紐付け</th><th>警告</th><th>エラー</th><th>重複</th><th /></tr></thead><tbody>{batches.map((b) => { const duplicate = completedByKey.get(`${b.fileHash}:${b.dataType}:${b.importSource.storeId || ""}`); const isDuplicate = duplicate && duplicate.id !== b.id; return <tr key={b.id}><td>{b.createdAt.toLocaleString("ja-JP")}</td><td>{b.importSource.store?.shortName || "—"}</td><td>{b.originalFilename}</td><td>{b.dataType}</td><td>{b.status}</td><td>{b.pendingCount}</td><td>{b.warningCount}</td><td>{b.errorCount}</td><td>{isDuplicate ? <span className="text-sm text-amber-700">同一ファイル確定済み<br /><Link className="underline" href={`/imports/heaven/${duplicate.id}`}>{duplicate.id}</Link>{b.status !== "CANCELLED" && <HeavenDuplicateAction batchId={b.id} duplicateOfBatchId={duplicate.id} />}</span> : "—"}</td><td><Link className="secondary-button" href={`/imports/heaven/${b.id}`}>詳細</Link></td></tr>; })}</tbody></table>{batches.length === 0 && <p className="empty-state">Heaven取込履歴はまだありません。</p>}</div></section></>;
}
