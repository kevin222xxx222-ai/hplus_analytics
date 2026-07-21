import Link from "next/link";
import { ArrowLeftRight, History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth";
import { findDuplicateCastCandidates } from "@/lib/casts/duplicate-service";

export default async function DuplicateCastsPage() {
  await requireAdmin();
  const candidates = await findDuplicateCastCandidates();
  return <>
    <PageHeader eyebrow="DUPLICATE REVIEW" title="キャスト重複候補" description="名称・接頭辞・Town/Heaven Aliasから候補を提示します。自動統合は行いません。" />
    <div className="mb-5 flex gap-3"><Link href="/masters/casts" className="secondary-button">キャスト管理へ</Link><Link href="/masters/casts/merges" className="secondary-button"><History className="size-4" />統合履歴</Link></div>
    <div className="space-y-4">{candidates.map(({ left, right, reasons, periodsOverlap, differentPrimaryStore }) => <section key={`${left.id}-${right.id}`} className="panel p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold">{left.displayName}</h2><ArrowLeftRight className="size-5 text-slate-400" /><h2 className="text-xl font-bold">{right.displayName}</h2></div><div className="mt-2 flex flex-wrap gap-2">{reasons.map((reason) => <span key={reason} className="status-badge bg-amber-50 text-amber-700">{reason}</span>)}{periodsOverlap && <span className="status-badge bg-red-50 text-red-700">在籍期間重複</span>}{differentPrimaryStore && <span className="status-badge bg-slate-100 text-slate-600">主所属違い</span>}</div></div><div className="flex flex-wrap gap-2"><Link href={`/masters/casts/merge?sourceId=${left.id}&targetId=${right.id}`} className="secondary-button">{left.displayName} → {right.displayName}</Link><Link href={`/masters/casts/merge?sourceId=${right.id}&targetId=${left.id}`} className="secondary-button">{right.displayName} → {left.displayName}</Link></div></div><div className="mt-4 grid gap-4 md:grid-cols-2">{[left, right].map((cast) => <div key={cast.id} className="rounded-xl bg-slate-50 p-4 text-sm"><div className="font-semibold">{cast.displayName}</div><div className="mt-1 font-mono text-xs text-slate-400">{cast.id}</div><div className="mt-2">主所属: {cast.primaryStore?.shortName || "未設定"} / 在籍: {cast.startedOn.toLocaleDateString("ja-JP")}〜{cast.endedOn?.toLocaleDateString("ja-JP") || "在籍中"}</div><div className="mt-2 text-xs text-slate-500">CTI {cast._count.ctiCastDailies} / Town {cast._count.townCastDailies} / URL {cast._count.townUrlDailies} / LP {cast._count.townLandingDailies}</div></div>)}</div></section>)}{candidates.length === 0 && <div className="panel p-8 text-center text-slate-500">現在、重複候補はありません。</div>}</div>
  </>;
}
