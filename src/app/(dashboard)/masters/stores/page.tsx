import { Save } from "lucide-react";
import { updateStoreAction } from "@/app/actions/masters";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function StoresPage() {
  await requireAdmin();
  const stores = await prisma.store.findMany({ orderBy: { displayOrder: "asc" } });
  return <><PageHeader title="店舗マスタ" description="経営実績と集客分析の対象範囲を管理します。管轄全体は3店舗、集客全体は春日部・越谷です。" />
    <div className="grid gap-4 xl:grid-cols-3">{stores.map((store) => <form action={updateStoreAction} key={store.id} className="panel p-5">
      <input type="hidden" name="id" value={store.id} /><div className="mb-5 flex items-center justify-between"><span className="status-badge bg-slate-100 text-slate-600">{store.code}</span><span className={`status-dot ${store.isActive ? "bg-emerald-500" : "bg-slate-300"}`} /></div>
      <label className="form-label">正式名称</label><input name="name" defaultValue={store.name} className="form-input mt-2" required />
      <label className="form-label mt-4 block">表示名</label><input name="shortName" defaultValue={store.shortName} className="form-input mt-2" required />
      <div className="mt-5 space-y-3 text-sm text-slate-600"><label className="check-row"><input type="checkbox" name="isActive" defaultChecked={store.isActive} />有効</label><label className="check-row"><input type="checkbox" name="hasManagementMetrics" defaultChecked={store.hasManagementMetrics} />経営実績の対象</label><label className="check-row"><input type="checkbox" name="hasAcquisitionMetrics" defaultChecked={store.hasAcquisitionMetrics} />集客分析の対象</label></div>
      <button className="secondary-button mt-5 w-full"><Save className="size-4" />保存</button>
    </form>)}</div></>;
}
