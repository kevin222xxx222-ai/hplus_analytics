import { notFound } from "next/navigation";
import Link from "next/link";
import { HeavenPreviewActions, type HeavenUnmatchedAliasSummary } from "@/components/heaven-preview-actions";
import { HeavenBulkAliasApproval } from "@/components/heaven-bulk-alias-approval";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth";
import { formatDateOnly } from "@/lib/date";
import { readPreview } from "@/lib/imports/storage";
import type { HeavenPreview } from "@/lib/imports/heaven/service";
import { getHeavenBulkAliasApprovalPreview, getHeavenDuplicateInfo } from "@/lib/imports/heaven/service";
import { prisma } from "@/lib/prisma";

export default async function HeavenPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const batch = await prisma.importBatch.findUnique({ where: { id }, include: { importSource: { include: { store: true } } } });
  if (!batch || !["HEAVEN_STORE", "HEAVEN_CAST"].includes(batch.dataType)) notFound();
  const duplicateInfo = await getHeavenDuplicateInfo(id);
  let preview: HeavenPreview;
  try { preview = await readPreview<HeavenPreview>(id); } catch {
    const terminal = batch.metadata && typeof batch.metadata === "object" && !Array.isArray(batch.metadata) && (batch.metadata as Record<string, unknown>).terminalReason === "DUPLICATE_COMPLETED";
    if (!terminal || !duplicateInfo) notFound();
    return <><PageHeader eyebrow="HEAVEN PREVIEW" title={batch.originalFilename} description="同一ファイルの確定済みBatchが存在するため、重複として終了したBatchです。" /><section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>同一ファイル確定済み</strong><p className="mt-1">確定済みBatch：<Link className="underline" href={`/imports/heaven/${duplicateInfo.duplicateOfBatchId}`}>{duplicateInfo.duplicateOfBatchId}</Link>（{duplicateInfo.duplicateOfStatus}）</p>{duplicateInfo.duplicateDetectedAt && <p>重複検出日時：{duplicateInfo.duplicateDetectedAt}</p>}<p className="mt-1">このBatchはCANCELLEDで、実績保存対象ではありません。</p></section></>;
  }
  const unresolvedName = preview.castRows.find((r) => r.resolutionStatus === "UNMATCHED")?.normalizedSourceCastName;
  const unresolvedRows = preview.castRows.filter((row) => row.resolutionStatus === "UNMATCHED");
  const unresolvedNames = [...new Set(unresolvedRows.map((row) => row.normalizedSourceCastName))];
  const [casts, heavenAliases] = unresolvedNames.length ? await Promise.all([
    prisma.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, normalizedName: true, startedOn: true, endedOn: true }, orderBy: { displayName: "asc" }, take: 200 }),
    prisma.castAlias.findMany({ where: { mediaType: "HEAVEN", storeId: preview.storeId, normalizedAlias: { in: unresolvedNames }, cast: { mergedIntoCastId: null } }, select: { normalizedAlias: true, castId: true, validFrom: true, validTo: true } }),
  ]) : [[], []];
  const unmatchedAliases: HeavenUnmatchedAliasSummary[] = unresolvedNames.map((name) => {
    const rows = unresolvedRows.filter((row) => row.normalizedSourceCastName === name);
    const firstDate = rows.map((row) => row.date).sort()[0];
    const lastDate = rows.map((row) => row.date).sort().at(-1) || firstDate;
    const nameCandidates = casts.filter((cast) => cast.normalizedName === name);
    const aliasCandidates = heavenAliases.filter((alias) => alias.normalizedAlias === name).map((alias) => alias.castId).filter((castId): castId is string => Boolean(castId));
    const candidateIds = [...new Set([...nameCandidates.map((cast) => cast.id), ...aliasCandidates])];
    const inPeriodCandidateCount = candidateIds.filter((candidateId) => {
      const cast = casts.find((item) => item.id === candidateId);
      if (!cast) return false;
      const startsBeforeEnd = cast.startedOn.toISOString().slice(0, 10) <= lastDate;
      const endsAfterStart = !cast.endedOn || cast.endedOn.toISOString().slice(0, 10) >= firstDate;
      return startsBeforeEnd && endsAfterStart;
    }).length;
    const recommendation = candidateIds.length === 0 ? "新規Cast候補" : candidateIds.length === 1 && inPeriodCandidateCount === 1 ? "既存Cast候補あり" : "要確認";
    return { aliasName: rows[0].sourceCastName, normalizedName: name, rowCount: rows.length, firstDate, lastDate, candidateCount: candidateIds.length, inPeriodCandidateCount, recommendation };
  });
  const listRows = unmatchedAliases.reduce((sum, item) => sum + item.rowCount, 0);
  const integrity = { peopleMatches: unmatchedAliases.length === preview.unmatchedPeople, rowMatches: listRows === preview.unmatchedCount, previewPeople: preview.unmatchedPeople, previewRows: preview.unmatchedCount, listPeople: unmatchedAliases.length, listRows };
  const firstDate = preview.castRows.find((r) => r.normalizedSourceCastName === unresolvedName)?.date || preview.sourcePeriodFrom || undefined;
  const incomingKeys = new Set(preview.dataType === "HEAVEN_STORE" ? preview.shopRows.filter((r) => r.rawValueStatus === "VALUE").map((r) => `${r.date}|${r.metricKey}`) : preview.castRows.filter((r) => r.castId && r.rawValueStatus === "VALUE").map((r) => `${r.date}|${r.metricKey}|cast:${r.castId!.toLowerCase()}`));
  const existingRows = preview.sourcePeriodFrom && preview.sourcePeriodTo ? await (preview.dataType === "HEAVEN_STORE" ? prisma.heavenShopDaily.findMany({ where: { storeId: preview.storeId, businessDate: { gte: new Date(preview.sourcePeriodFrom), lte: new Date(preview.sourcePeriodTo) } }, select: { businessDate: true, metricKey: true } }) : prisma.heavenCastDaily.findMany({ where: { storeId: preview.storeId, businessDate: { gte: new Date(preview.sourcePeriodFrom), lte: new Date(preview.sourcePeriodTo) } }, select: { businessDate: true, metricKey: true, resolutionKey: true } })) : [];
  const existingKeys = new Set(existingRows.map((r) => preview.dataType === "HEAVEN_STORE" ? `${formatDateOnly(r.businessDate)}|${r.metricKey}` : `${formatDateOnly(r.businessDate)}|${r.metricKey}|${"resolutionKey" in r ? r.resolutionKey : ""}`));
  const updateEstimate = [...incomingKeys].filter((key) => existingKeys.has(key)).length;
  const confirmSummary = { storeName: preview.storeName, period: `${preview.sourcePeriodFrom}〜${preview.sourcePeriodTo}`, metrics: new Set((preview.dataType === "HEAVEN_STORE" ? preview.shopRows : preview.castRows).map((r) => r.metricKey)).size, rows: incomingKeys.size, inserted: incomingKeys.size - updateEstimate, updated: updateEstimate, errors: preview.errorCount, warnings: preview.warningCount };
  const duplicateTerminal = (batch.metadata && typeof batch.metadata === "object" && !Array.isArray(batch.metadata) && (batch.metadata as Record<string, unknown>).terminalReason === "DUPLICATE_COMPLETED");
  const confirmEnabled = !duplicateTerminal && !duplicateInfo && batch.status === "PREVIEW_READY" && preview.errorCount === 0 && preview.warningCount === 0 && preview.unmatchedCount === 0 && preview.ambiguousCount === 0;
  const bulkAliasPreview = batch.dataType === "HEAVEN_CAST" && !duplicateTerminal ? await getHeavenBulkAliasApprovalPreview(id).catch(() => null) : null;
  return <><PageHeader eyebrow="HEAVEN PREVIEW" title={batch.originalFilename} description="解析結果の確認画面です。確定操作まで実績テーブルは変更されません。" />{duplicateInfo && <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>同一ファイル確定済み</strong><p className="mt-1">確定済みBatch：<Link className="underline" href={`/imports/heaven/${duplicateInfo.duplicateOfBatchId}`}>{duplicateInfo.duplicateOfBatchId}</Link>（{duplicateInfo.duplicateOfStatus}）</p>{duplicateInfo.duplicateDetectedAt && <p>重複検出日時：{duplicateInfo.duplicateDetectedAt}</p>}<p className="mt-1">このBatchは確定できません。</p></section>}{duplicateTerminal && <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><strong>重複終了済み</strong><p>同一ファイルの確定済みBatchがあるため、このBatchはCANCELLEDです。</p></section>}<section className="grid gap-4 md:grid-cols-4"><div className="metric-card"><span>店舗</span><strong>{preview.storeName}</strong></div><div className="metric-card"><span>指標</span><strong>{preview.metricType === "UNKNOWN" ? "店舗指標" : preview.metricType}</strong></div><div className="metric-card"><span>valueKind</span><strong>{preview.valueKind}</strong></div><div className="metric-card"><span>対象月</span><strong>{preview.sourcePeriodFrom}〜{preview.sourcePeriodTo}</strong></div></section><section className="panel mt-6 p-5"><h2 className="text-lg font-semibold">検証サマリー</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><dt>キャスト数</dt><dd>{new Set(preview.castRows.map((r) => r.normalizedSourceCastName)).size}</dd></div><div><dt>行数</dt><dd>{preview.shopRows.length || preview.castRows.length}</dd></div><div><dt>未紐付け人数 / 行</dt><dd>{preview.unmatchedPeople} / {preview.unmatchedCount}</dd></div><div><dt>曖昧 / エラー</dt><dd>{preview.ambiguousCount} / {preview.errorCount}</dd></div></dl></section>{bulkAliasPreview && <HeavenBulkAliasApproval preview={bulkAliasPreview} />}<HeavenPreviewActions batchId={id} canResolve={batch.dataType === "HEAVEN_CAST" && unmatchedAliases.length > 0} normalizedName={unresolvedName} firstDate={firstDate} casts={casts} unmatchedAliases={unmatchedAliases} integrity={integrity} confirmEnabled={confirmEnabled} duplicateTerminal={Boolean(duplicateTerminal)} duplicateInfo={duplicateInfo} confirmSummary={confirmSummary} /></>;
}
