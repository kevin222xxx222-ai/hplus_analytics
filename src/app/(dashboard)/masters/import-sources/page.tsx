import { PauseCircle, PlayCircle, Plus } from "lucide-react";
import { createImportSourceAction, toggleImportSourceAction } from "@/app/actions/masters";
import { PageHeader } from "@/components/page-header";
import { ImportDataType, ImportSourceKind, MediaType } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const dataTypeLabels: Record<ImportDataType, string> = {
  CTI_CAST_REPORT: "CTI 女子別レポート", TOWN_STORE: "タウン 店舗別", TOWN_CAST: "タウン 女子別", TOWN_URL: "タウン URL別", TOWN_LP: "タウン LP別", HEAVEN_STORE: "ヘブン 店舗別", HEAVEN_CAST: "ヘブン 女子別",
};

export default async function ImportSourcesPage() {
  await requireAdmin();
  const [sources, stores] = await Promise.all([prisma.importSource.findMany({ include: { store: true }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }), prisma.store.findMany({ orderBy: { displayOrder: "asc" } })]);
  return <><PageHeader title="媒体取込元設定" description="媒体・店舗・データ種別・指標を明示し、ファイル名の (1) などに依存しない判定基盤を作ります。" />
    <section className="panel mb-6 p-5"><h2 className="text-base font-semibold text-slate-900">取込元を追加</h2><form action={createImportSourceAction} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div><label className="form-label">設定名</label><input name="name" required className="form-input mt-2" placeholder="タウン春日部 女子別" /></div><div><label className="form-label">方式</label><select name="kind" className="form-input mt-2">{Object.values(ImportSourceKind).map((v) => <option key={v}>{v}</option>)}</select></div><div><label className="form-label">媒体</label><select name="mediaType" className="form-input mt-2">{Object.values(MediaType).map((v) => <option key={v}>{v}</option>)}</select></div><div><label className="form-label">データ種別</label><select name="dataType" className="form-input mt-2">{Object.values(ImportDataType).map((v) => <option key={v} value={v}>{dataTypeLabels[v]}</option>)}</select></div><div><label className="form-label">店舗</label><select name="storeId" className="form-input mt-2"><option value="">全店 / 未設定</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.shortName}</option>)}</select></div><div><label className="form-label">指標タイプ</label><input name="metricType" className="form-input mt-2" placeholder="必要な場合のみ" /></div><div className="xl:col-span-2"><label className="form-label">Google Driveフォルダ（将来用）</label><div className="mt-2 flex gap-3"><input name="folderPath" className="form-input" placeholder="HPLUS_ANALYTICS/TOWN_KASUKABE/GIRL" /><button className="primary-button"><Plus className="size-4" />追加</button></div></div></form></section>
    <section className="panel overflow-hidden"><div className="table-wrap"><table><thead><tr><th>設定名</th><th>方式</th><th>媒体</th><th>データ種別</th><th>店舗</th><th>指標</th><th>状態</th><th></th></tr></thead><tbody>{sources.map((source) => <tr key={source.id}><td className="font-medium text-slate-900">{source.name}</td><td>{source.kind}</td><td><span className="status-badge bg-slate-100 text-slate-600">{source.mediaType}</span></td><td>{dataTypeLabels[source.dataType]}</td><td>{source.store?.shortName || "—"}</td><td>{source.metricType || "—"}</td><td><span className={`status-badge ${source.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{source.isActive ? "有効" : "停止"}</span></td><td><form action={toggleImportSourceAction}><input type="hidden" name="id" value={source.id} /><input type="hidden" name="isActive" value={String(source.isActive)} /><button className="icon-button" title={source.isActive ? "停止" : "再開"}>{source.isActive ? <PauseCircle className="size-4" /> : <PlayCircle className="size-4" />}</button></form></td></tr>)}</tbody></table>{sources.length === 0 && <p className="empty-state">取込元はまだ登録されていません。</p>}</div></section>
  </>;
}
