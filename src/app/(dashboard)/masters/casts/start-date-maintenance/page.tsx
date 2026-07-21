import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CastStartDateMaintenance } from "@/components/cast-start-date-maintenance";
import { PageHeader } from "@/components/page-header";
import { formatDateOnly } from "@/lib/date";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function CastStartDateMaintenancePage() {
  await requireAdmin();
  const [casts, histories] = await Promise.all([
    prisma.cast.findMany({
      where: { mergedIntoCastId: null },
      select: { id: true, displayName: true, startedOn: true, endedOn: true, primaryStore: { select: { shortName: true } }, _count: { select: { aliases: true } } },
      orderBy: [{ startedOn: "desc" }, { displayName: "asc" }],
    }),
    prisma.castStartDateBulkChangeHistory.findMany({ include: { changedBy: { select: { displayName: true } } }, orderBy: { changedAt: "desc" }, take: 20 }),
  ]);

  return <>
    <Link href="/masters/casts" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />キャスト管理へ</Link>
    <PageHeader title="開始日の一括前倒し" description="過去データ投入前にCast.startedOnと既存Alias.validFromを、衝突検査付きで安全に前倒しします。" />
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">新しい日付が現在値より前の場合だけ更新します。validTo、ID、実績、掲載状態は変更しません。実際の入店日を確認してから実行してください。</div>
    <CastStartDateMaintenance candidates={casts.map((cast) => ({ id: cast.id, displayName: cast.displayName, primaryStoreName: cast.primaryStore?.shortName || null, startedOn: formatDateOnly(cast.startedOn), endedOn: cast.endedOn ? formatDateOnly(cast.endedOn) : null, aliasCount: cast._count.aliases }))} />
    <section className="panel mt-6 overflow-hidden"><div className="border-b border-slate-100 p-5"><h2 className="font-semibold">一括変更履歴</h2></div><div className="table-wrap"><table><thead><tr><th>実行日時</th><th>管理者</th><th>対象日</th><th>媒体</th><th>Cast</th><th>Alias</th><th>理由</th></tr></thead><tbody>{histories.map((history) => <tr key={history.id}><td>{history.changedAt.toLocaleString("ja-JP")}</td><td>{history.changedBy.displayName}</td><td>{formatDateOnly(history.targetDate)}</td><td>{history.mediaScope}</td><td>{history.castCount}</td><td>{history.aliasCount}</td><td>{history.reason}</td></tr>)}</tbody></table>{histories.length === 0 && <p className="empty-state">一括変更履歴はありません。</p>}</div></section>
  </>;
}
