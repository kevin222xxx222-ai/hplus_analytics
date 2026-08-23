import { CastMembershipStatus, CastStatus, ImportBatchStatus, ImportDataType } from "@/generated/prisma/client";
import { classifyLegacyActiveInactive } from "@/lib/casts/store-scope-audit";
import { loadCurrentMembershipCandidates } from "@/lib/casts/current-membership-evidence";
import { readPreview } from "@/lib/imports/storage";
import { resolveTownPreviewRows, resolveTownPreviewRowsWithShadow } from "@/lib/imports/town/resolver";
import type { TownPreview } from "@/lib/imports/town/types";
import { prisma } from "@/lib/prisma";

const successful = [ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS];

async function main() {
  const batches = await prisma.importBatch.findMany({
    where: { dataType: ImportDataType.TOWN_CAST, status: { in: successful } },
    include: { importSource: { include: { store: true } } },
    orderBy: [{ targetTo: "desc" }, { completedAt: "desc" }, { createdAt: "desc" }],
  });
  const latestByStore = new Map<string, (typeof batches)[number]>();
  for (const batch of batches) {
    const storeId = batch.importSource.storeId;
    if (storeId && !latestByStore.has(storeId)) latestByStore.set(storeId, batch);
  }
  const stores = [...latestByStore.values()].map((batch) => batch.importSource.store).filter((store): store is NonNullable<typeof store> => Boolean(store));
  const candidates = await loadCurrentMembershipCandidates(prisma);
  const candidateByKey = new Map(candidates.map((candidate) => [`${candidate.castId}:${candidate.storeId}`, candidate]));
  const reviews = await prisma.castStoreMembershipReview.findMany({ where: { isActive: true }, select: { castId: true, storeId: true, classification: true, reason: true } });
  const reviewByKey = new Map(reviews.map((review) => [`${review.castId}:${review.storeId}`, review]));
  const reports = [];
  for (const batch of latestByStore.values()) {
    const store = batch.importSource.store;
    if (!store) continue;
    const preview = await readPreview<TownPreview>(batch.id);
    // Two legacy-only runs isolate resolver nondeterminism from the shadow pass.
    const legacyRunA = await resolveTownPreviewRows(preview.rows, store.id, batch.targetTo);
    const legacyRunB = await resolveTownPreviewRows(preview.rows, store.id, batch.targetTo);
    const result = await resolveTownPreviewRowsWithShadow(preview.rows, store.id, batch.targetTo, "shadow", 10_000);
    const rowState = (row: TownPreview["rows"][number] | undefined) => row ? { rowKey: row.rowKey, sourceRowNumber: row.sourceRowNumber, mediaCastName: row.kind === "CAST" ? row.originalCastName : row.kind === "URL" || row.kind === "LANDING" ? row.sourceCastName : null, castId: row.castId, resolutionStatus: row.resolutionStatus, castDisplayName: row.castDisplayName, normalizedCastName: row.kind === "CAST" || row.kind === "URL" || row.kind === "LANDING" ? row.normalizedCastName : null, issues: row.issues } : null;
    const byKey = (rows: TownPreview["rows"]) => new Map(rows.map((row) => [row.rowKey, row]));
    const originalByKey = byKey(preview.rows);
    const runAByKey = byKey(legacyRunA);
    const runBByKey = byKey(legacyRunB);
    const changedRows = [...new Set([...originalByKey.keys(), ...runAByKey.keys()])].map((rowKey) => ({ rowKey, original: originalByKey.get(rowKey), reResolved: runAByKey.get(rowKey) })).filter(({ original, reResolved }) => original?.castId !== reResolved?.castId || original?.resolutionStatus !== reResolved?.resolutionStatus);
    const legacyRunDifferences = [...new Set([...runAByKey.keys(), ...runBByKey.keys()])].filter((rowKey) => runAByKey.get(rowKey)?.castId !== runBByKey.get(rowKey)?.castId || runAByKey.get(rowKey)?.resolutionStatus !== runBByKey.get(rowKey)?.resolutionStatus);
    const exampleCastIds = [...new Set((result.shadow?.examples ?? []).map((example) => example.castId))];
    const exampleCasts = await prisma.cast.findMany({ where: { id: { in: exampleCastIds } }, select: { id: true, displayName: true, status: true, endedOn: true, primaryStoreId: true, memberships: { select: { storeId: true, status: true, leftAt: true } } } });
    const exampleById = new Map(exampleCasts.map((cast) => [cast.id, cast]));
    const shadow = result.shadow;
    const classified = (shadow?.examples ?? []).map((example) => {
      const cast = exampleById.get(example.castId);
      const candidate = candidateByKey.get(`${example.castId}:${store.id}`);
      const target = cast?.memberships.find((membership) => membership.storeId === store.id);
      const otherActiveCount = cast?.memberships.filter((membership) => membership.storeId !== store.id && (membership.status === CastMembershipStatus.ACTIVE || membership.status === CastMembershipStatus.ON_LEAVE)).length ?? 0;
      const marker = /(?:【?退店】?|退店|【?休業】?|休業)/u.test(cast?.displayName ?? "");
      const review = reviewByKey.get(`${example.castId}:${store.id}`);
      const baseClassification = cast?.status === CastStatus.ACTIVE ? classifyLegacyActiveInactive({ legacyStatus: cast.status, targetStatus: target?.status, otherActiveCount, townCurrent: candidate?.evidence.townCurrent ?? false, ctiCurrent: candidate?.evidence.ctiCurrent ?? false }) : "OTHER";
      const classification = marker || review ? "RETIRED_OR_REVIEW_REQUIRED" : baseClassification;
      return { ...example, displayName: cast?.displayName ?? null, store: store.shortName, legacyStatus: cast?.status ?? null, legacyEndedOn: cast?.endedOn ?? null, primaryStoreId: cast?.primaryStoreId ?? null, targetMembershipStatus: target?.status ?? null, targetMembershipLeftAt: target?.leftAt ?? null, otherStoreActiveMemberships: cast?.memberships.filter((membership) => membership.storeId !== store.id && (membership.status === CastMembershipStatus.ACTIVE || membership.status === CastMembershipStatus.ON_LEAVE)).map((membership) => ({ storeId: membership.storeId, status: membership.status })) ?? [], townCurrent: candidate?.evidence.townCurrent ?? false, townDatasetDate: candidate?.evidence.townDataset?.date ?? null, townBatchId: candidate?.evidence.townDataset?.batchId ?? null, ctiCurrent: candidate?.evidence.ctiCurrent ?? false, ctiDatasetDate: candidate?.evidence.ctiDataset?.date ?? null, ctiBatchId: candidate?.evidence.ctiDataset?.batchId ?? null, aliasEvidence: candidate?.evidence.aliasEvidence ?? false, mediaListingEvidence: candidate?.evidence.mediaListingEvidence ?? false, retiredMarker: marker, activeReview: review?.classification ?? null, classification, reason: review?.reason ?? (classification === "EXPECTED_STORE_SCOPE_DIFFERENCE" ? "他StoreにACTIVE/ON_LEAVE Membershipがあり、対象StoreにDataset Evidenceなし" : classification === "CURRENT_STORE_MEMBERSHIP_MISSING" ? "対象StoreにCurrent Town/CTI Dataset Evidenceあり" : classification === "LEFT_STORE_CONFLICT" ? "対象StoreがLEFT MembershipでCurrent Dataset Evidenceあり" : classification === "LEGACY_STATUS_STALE" ? "Legacy ACTIVEだがMembershipとCurrent Dataset Evidenceなし" : classification === "RETIRED_OR_REVIEW_REQUIRED" ? "退店markerまたはHuman Reviewあり" : "分類条件外") };
    });
    const classificationCounts = classified.reduce<Record<string, number>>((counts, row) => { counts[row.classification] = (counts[row.classification] ?? 0) + 1; return counts; }, {});
    reports.push({
      store: store.shortName,
      storeId: store.id,
      datasetDate: batch.targetTo.toISOString().slice(0, 10),
      importBatchId: batch.id,
      fileName: batch.originalFilename,
      importBatchStatus: batch.status,
      evaluated: shadow?.evaluated ?? 0,
      match: shadow?.differenceCounts.MATCH ?? 0,
      legacyTrueMembershipFalse: shadow?.differenceCounts.LEGACY_TRUE_MEMBERSHIP_FALSE ?? 0,
      legacyFalseMembershipTrue: shadow?.differenceCounts.LEGACY_FALSE_MEMBERSHIP_TRUE ?? 0,
      differenceRate: shadow?.evaluated ? (shadow.differences / shadow.evaluated) : 0,
      examples: classified.slice(0, 20).map((example) => {
        const cast = exampleById.get(example.castId);
        return { ...example, membershipStatuses: cast?.memberships.map((membership) => membership.status) ?? [] };
      }),
      shadowClassification: { counts: classificationCounts, total: classified.length, exclusive: Object.values(classificationCounts).reduce((sum, count) => sum + count, 0) === classified.length, other: classificationCounts.OTHER ?? 0 },
      legacyPreviewValidation: {
        rows: preview.rows.length,
        reResolvedRows: legacyRunA.length,
        changedRows: changedRows.length,
        unchanged: changedRows.length === 0,
        legacyRunAComparedToRunBChangedRows: legacyRunDifferences.length,
        shadowLegacyRowsComparedToLegacyRunChangedRows: [...new Set([...runAByKey.keys(), ...byKey(result.rows).keys()])].filter((rowKey) => runAByKey.get(rowKey)?.castId !== byKey(result.rows).get(rowKey)?.castId || runAByKey.get(rowKey)?.resolutionStatus !== byKey(result.rows).get(rowKey)?.resolutionStatus).length,
        changedRowDetails: changedRows.map(({ original, reResolved }) => ({ store: batch.importSource.store?.shortName ?? null, original: rowState(original), reResolved: rowState(reResolved) })),
        legacyNondeterministicRowKeys: legacyRunDifferences,
      },
    });
  }
  console.log(JSON.stringify({ mode: "shadow", readOnly: true, resolver: "TOWN_CAST", stores: stores.map((store) => store.shortName), reports }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
