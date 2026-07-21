import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { CastMergeExecutionForm } from "@/components/cast-merge-execution-form";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth";
import { previewCastMerge } from "@/lib/casts/merge-service";
import { prisma } from "@/lib/prisma";

function CountTable({ title, counts }: { title: string; counts: Record<string, number> }) {
  const labels: Record<string, string> = { aliases: "Alias", mediaListings: "MediaListing", cti: "CTI実績", townCast: "Town女子実績", townUrl: "Town URL", townLanding: "Town LP", nameHistories: "表示名履歴", improvementLogs: "改善ログ", previouslyMergedSources: "過去に統合されたsource" };
  return <section className="panel p-5"><h2 className="font-semibold text-slate-900">{title}</h2><dl className="mt-3 grid grid-cols-2 gap-2 text-sm">{Object.entries(counts).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 p-2"><dt className="text-slate-500">{labels[key] || key}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd></div>)}</dl></section>;
}

export default async function CastMergePreviewPage({ searchParams }: { searchParams: Promise<{ sourceId?: string; targetId?: string }> }) {
  await requireAdmin();
  const query = await searchParams;
  if (!query.sourceId || !query.targetId) return <><PageHeader title="キャスト統合プレビュー" description="重複候補画面から統合元と統合先を選択してください。" /><Link href="/masters/casts/duplicates" className="secondary-button">重複候補へ</Link></>;
  let preview;
  try { preview = await previewCastMerge(query.sourceId, query.targetId); }
  catch (error) { return <><PageHeader title="キャスト統合プレビュー" description="指定された統合元・統合先を確認できませんでした。" /><div className="panel p-5 text-red-700">{error instanceof Error ? error.message : "プレビューを作成できませんでした。"}</div><Link href="/masters/casts/duplicates" className="secondary-button mt-4">重複候補へ戻る</Link></>; }
  const stores = await prisma.store.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" }, select: { id: true, shortName: true } });
  const source = preview.source; const target = preview.target;
  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><Link href="/masters/casts/duplicates" className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft className="size-4" />重複候補へ</Link><Link href={`/masters/casts/merge?sourceId=${source.id}&targetId=${target.id}`} className="secondary-button"><RefreshCw className="size-4" />データを再検証</Link></div>
    <PageHeader eyebrow="CAST MERGE PREVIEW" title={`${source.displayName} → ${target.displayName}`} description="統合元の関連データを統合先IDへ移行します。プレビュー後にデータが変化した場合、実行時の再検証で停止します。" />
    <div className="mb-6 grid gap-4 lg:grid-cols-2">{[{ label: "統合するキャスト（source）", cast: source }, { label: "残すキャスト（target）", cast: target }].map(({ label, cast }) => <section key={cast.id} className="panel p-5"><p className="text-xs font-semibold tracking-widest text-emerald-700">{label}</p><h2 className="mt-2 text-2xl font-bold">{cast.displayName}</h2><dl className="mt-4 grid grid-cols-[120px_1fr] gap-2 text-sm"><dt className="text-slate-500">内部ID</dt><dd className="font-mono text-xs">{cast.id}</dd><dt className="text-slate-500">主所属</dt><dd>{cast.primaryStoreName || "未設定"}</dd><dt className="text-slate-500">在籍期間</dt><dd>{cast.startedOn}〜{cast.endedOn || "在籍中"}</dd><dt className="text-slate-500">作成日時</dt><dd>{new Date(cast.createdAt).toLocaleString("ja-JP")}</dd></dl><h3 className="mt-4 text-sm font-semibold">Alias</h3><div className="mt-2 space-y-1 text-sm">{cast.aliases.length ? cast.aliases.map((alias) => <div key={alias.id}>{alias.mediaType} / {alias.storeName || "共通"} / <strong>{alias.aliasName}</strong> / {alias.validFrom || "開始未設定"}〜{alias.validTo || "継続"}</div>) : <p className="text-slate-400">なし</p>}</div><h3 className="mt-4 text-sm font-semibold">MediaListing</h3><div className="mt-2 space-y-1 text-sm">{cast.mediaListings.length ? cast.mediaListings.map((listing) => <div key={listing.id}>{listing.mediaType} / {listing.storeName} / {listing.isListed ? "掲載中" : "非掲載"}</div>) : <p className="text-slate-400">なし</p>}</div><dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600"><div>CTI: {cast.counts.cti}</div><div>Town女子: {cast.counts.town}</div><div>URL: {cast.counts.url}</div><div>LP: {cast.counts.landing}</div></dl></section>)}</div>
    <div className="mb-6 grid gap-4 lg:grid-cols-2"><CountTable title="sourceからの移行対象件数" counts={preview.counts} /><section className="panel p-5"><h2 className="font-semibold">統合後の推奨値</h2><dl className="mt-3 grid grid-cols-[120px_1fr] gap-2 text-sm"><dt>表示名</dt><dd>{preview.recommended.displayName}</dd><dt>主所属</dt><dd>{preview.recommended.primaryStoreName || "未設定"}</dd><dt>在籍期間</dt><dd>{preview.recommended.startedOn}〜{preview.recommended.endedOn || "在籍中"}</dd><dt>在籍期間重複</dt><dd>{preview.periodsOverlap ? "あり" : "なし"}</dd></dl></section></div>
    <section className="panel mb-6 p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">一意制約衝突</h2><span className={`status-badge ${preview.blockingConflicts.length ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>差分衝突 {preview.blockingConflicts.length}件 / 完全一致 {preview.exactDuplicates.length}件</span></div>{preview.collisions.length === 0 ? <p className="mt-3 text-sm text-emerald-700">衝突はありません。</p> : <div className="table-wrap mt-3"><table><thead><tr><th>モデル</th><th>一意キー</th><th>判定</th><th>差分</th></tr></thead><tbody>{preview.collisions.map((collision) => <tr key={`${collision.model}-${collision.sourceId}`}><td>{collision.model}</td><td className="font-mono text-xs">{collision.key}</td><td>{collision.identical ? "完全一致・整理可能" : "値が異なるため停止"}</td><td className="max-w-md text-xs">{collision.differences.map((difference) => `${difference.field}: ${JSON.stringify(difference.source)} → ${JSON.stringify(difference.target)}`).join(" / ") || "—"}</td></tr>)}</tbody></table></div>}</section>
    <p className="mb-3 text-xs text-slate-400">再検証フィンガープリント: {preview.fingerprint}</p>
    <CastMergeExecutionForm sourceCastId={source.id} targetCastId={target.id} sourceName={source.displayName} targetName={target.displayName} fingerprint={preview.fingerprint} recommended={preview.recommended} stores={stores} canMerge={preview.canMerge} />
  </>;
}
