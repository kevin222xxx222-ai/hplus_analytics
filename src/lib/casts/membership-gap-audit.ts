import { CastMembershipStatus, CastStatus, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { loadCurrentMembershipCandidates, type CurrentMembershipCandidate } from "@/lib/casts/current-membership-evidence";
import { summarizeShadowSnapshot, type ShadowCast, type ShadowStore } from "@/lib/casts/shadow-read-audit";

export type GapCategory = "CURRENT_MEDIA_EVIDENCE" | "LEGACY_ACTIVE_NO_CURRENT_MEDIA" | "LEGACY_INACTIVE" | "DISPLAY_NAME_RETIRED_MARKER" | "STORE_EVIDENCE_UNKNOWN" | "HISTORICAL_ONLY" | "MERGE_OR_DUPLICATE_CANDIDATE";

export type GapApplyCandidate = {
  castId: string;
  storeId: string;
  displayName: string;
  storeName: string;
  legacyStatus: CastStatus;
  legacyEndedOn: Date | null;
  primaryStoreId: string | null;
  membershipFree: boolean;
  existingMembershipCount: number;
  existingMembershipStatuses: CastMembershipStatus[];
  sources: string[];
  datasets: Array<{ source: string; date: Date | null; batchId: string | null; fileName: string | null }>;
  townCurrent: boolean;
  townLatestDatasetDate: Date | null;
  townImportBatchId: string | null;
  ctiCurrent: boolean;
  ctiLatestDatasetDate: Date | null;
  ctiImportBatchId: string | null;
  aliasEvidence: boolean;
  currentAliasCount: number;
  mediaListingEvidence: boolean;
  currentMediaListingCount: number;
  heavenEvidence: boolean;
  displayNameRetiredMarker: boolean;
  legacyConflict: boolean;
  action: "CREATE_ACTIVE" | "NOOP" | "REENTRY_REVIEW" | "REVIEW_REQUIRED";
  decision: "CREATE_ACTIVE" | "NOOP" | "REENTRY_REVIEW" | "REVIEW_REQUIRED";
  reviewReasons: string[];
};

export type GapApplyValidation = {
  valid: boolean;
  errors: string[];
  membershipFreeCastCount: number;
  membershipFreeCellCount: number;
  createActiveCount: number;
  reviewRequiredCount: number;
  reentryReviewCount: number;
  noopCount: number;
  townOnly: number;
  ctiOnly: number;
  both: number;
  storeCounts: Record<string, number>;
  currentEvidence60: Record<string, number>;
};

function reviewReasons(candidate: CurrentMembershipCandidate, input: { marker: boolean; legacyInactive: boolean; alias: boolean; listing: boolean; heaven: boolean; strong: boolean }): string[] {
  const reasons: string[] = [];
  if (input.marker) reasons.push("RETIRED_MARKER");
  if (input.legacyInactive) reasons.push("LEGACY_INACTIVE");
  if (input.strong && (input.marker || input.legacyInactive)) reasons.push("LEGACY_CONFLICT");
  if (!input.strong) {
    if (input.alias && input.listing) reasons.push("ALIAS_AND_LISTING_ONLY");
    else if (input.alias) reasons.push("ALIAS_ONLY");
    else if (input.listing) reasons.push("MEDIA_LISTING_ONLY");
    if (input.heaven) reasons.push("HEAVEN_ONLY");
    if (!input.alias && !input.listing && !input.heaven) reasons.push("NO_CURRENT_DATASET_EVIDENCE", "STORE_NO_EVIDENCE");
  }
  if (!reasons.length && candidate.decision !== "CREATE_ACTIVE") reasons.push("OTHER");
  return reasons;
}

export function classifyGapApplyAction(input: {
  membershipCount: number;
  currentMembershipStatus?: CastMembershipStatus;
  decision: CurrentMembershipCandidate["decision"];
  positiveEvidence: boolean;
}): GapApplyCandidate["action"] {
  if (input.membershipCount > 0) {
    return input.currentMembershipStatus === CastMembershipStatus.LEFT ? "REENTRY_REVIEW" : "NOOP";
  }
  return input.decision === "CREATE_ACTIVE" && input.positiveEvidence ? "CREATE_ACTIVE" : "REVIEW_REQUIRED";
}

export async function loadGapApplyPreview(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const candidates = await loadCurrentMembershipCandidates(db);
  const casts = await db.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, status: true, endedOn: true, primaryStoreId: true, memberships: { select: { storeId: true, status: true } }, aliases: { where: { validTo: null, reviewStatus: { not: "IGNORED" } }, select: { storeId: true } }, mediaListings: { where: { isListed: true }, select: { storeId: true } } } });
  const castMap = new Map(casts.map((cast) => [cast.id, cast]));
  const rows: GapApplyCandidate[] = candidates.map((candidate) => {
    const cast = castMap.get(candidate.castId)!;
    const current = cast.memberships.find((membership) => membership.storeId === candidate.storeId);
    const positive = candidate.evidence.ctiCurrent || candidate.evidence.townCurrent;
    const action = classifyGapApplyAction({ membershipCount: cast.memberships.length, currentMembershipStatus: current?.status, decision: candidate.decision, positiveEvidence: positive });
    const marker = /(?:退店|休業)/u.test(candidate.displayName);
    const aliasCount = cast.aliases.filter((alias) => alias.storeId === candidate.storeId).length;
    const listingCount = cast.mediaListings.filter((listing) => listing.storeId === candidate.storeId).length;
    const heaven = candidate.evidence.reasons.some((reason) => reason.startsWith("Heaven累計Fact"));
    const reasons = action === "REVIEW_REQUIRED" ? reviewReasons(candidate, { marker, legacyInactive: cast.status !== CastStatus.ACTIVE, alias: aliasCount > 0, listing: listingCount > 0, heaven, strong: positive }) : [];
    return {
      castId: candidate.castId, storeId: candidate.storeId, displayName: candidate.displayName, storeName: candidate.storeName,
      legacyStatus: cast.status, legacyEndedOn: cast.endedOn, primaryStoreId: cast.primaryStoreId,
      membershipFree: cast.memberships.length === 0, existingMembershipCount: cast.memberships.length, existingMembershipStatuses: cast.memberships.map((membership) => membership.status),
      sources: [candidate.evidence.townCurrent ? "TOWN_CAST" : null, candidate.evidence.ctiCurrent ? "CTI" : null].filter((value): value is string => Boolean(value)),
      datasets: [candidate.evidence.townDataset ? { source: "TOWN_CAST", date: candidate.evidence.townDataset.date, batchId: candidate.evidence.townDataset.batchId, fileName: candidate.evidence.townDataset.fileName } : null, candidate.evidence.ctiDataset ? { source: "CTI", date: candidate.evidence.ctiDataset.date, batchId: candidate.evidence.ctiDataset.batchId, fileName: candidate.evidence.ctiDataset.fileName } : null].filter((value): value is NonNullable<typeof value> => Boolean(value)),
      townCurrent: candidate.evidence.townCurrent, townLatestDatasetDate: candidate.evidence.townDataset?.date ?? null, townImportBatchId: candidate.evidence.townDataset?.batchId ?? null,
      ctiCurrent: candidate.evidence.ctiCurrent, ctiLatestDatasetDate: candidate.evidence.ctiDataset?.date ?? null, ctiImportBatchId: candidate.evidence.ctiDataset?.batchId ?? null,
      aliasEvidence: aliasCount > 0, currentAliasCount: aliasCount, mediaListingEvidence: listingCount > 0, currentMediaListingCount: listingCount, heavenEvidence: heaven,
      displayNameRetiredMarker: marker, legacyConflict: positive && (marker || cast.status !== CastStatus.ACTIVE),
      action,
      decision: action, reviewReasons: reasons,
    };
  });
  return rows;
}

export function validateGapApplyPreview(rows: GapApplyCandidate[]): GapApplyValidation {
  const errors: string[] = [];
  const membershipFreeRows = rows.filter((row) => row.membershipFree);
  const membershipFreeCastCount = new Set(membershipFreeRows.map((row) => row.castId)).size;
  const create = rows.filter((row) => row.decision === "CREATE_ACTIVE");
  const review = rows.filter((row) => row.decision === "REVIEW_REQUIRED");
  const reentry = rows.filter((row) => row.decision === "REENTRY_REVIEW");
  const noop = rows.filter((row) => row.decision === "NOOP");
  const townOnly = create.filter((row) => row.townCurrent && !row.ctiCurrent).length;
  const ctiOnly = create.filter((row) => !row.townCurrent && row.ctiCurrent).length;
  const both = create.filter((row) => row.townCurrent && row.ctiCurrent).length;
  const storeCounts = create.reduce<Record<string, number>>((out, row) => { out[row.storeName] = (out[row.storeName] ?? 0) + 1; return out; }, {});
  if (create.length + review.length !== membershipFreeRows.length) errors.push("membership-free rows do not reconcile to CREATE_ACTIVE + REVIEW_REQUIRED");
  if (townOnly + ctiOnly + both !== create.length) errors.push("CREATE_ACTIVE evidence totals do not reconcile");
  if (Object.values(storeCounts).reduce((sum, count) => sum + count, 0) !== create.length) errors.push("CREATE_ACTIVE store totals do not reconcile");
  if (create.some((row) => row.displayNameRetiredMarker || row.legacyStatus !== CastStatus.ACTIVE || !row.membershipFree || row.existingMembershipStatuses.includes(CastMembershipStatus.LEFT) || (!row.townCurrent && !row.ctiCurrent))) errors.push("CREATE_ACTIVE contains an unsafe row");
  const evidenceRows = rows.filter((row) => row.membershipFree && (row.aliasEvidence || row.mediaListingEvidence || row.townCurrent || row.ctiCurrent));
  const currentEvidence60: Record<string, number> = { STRONG_DATASET_EVIDENCE: 0, ALIAS_ONLY: 0, LISTING_ONLY: 0, ALIAS_AND_LISTING_ONLY: 0, HEAVEN_ONLY: 0, OTHER_CURRENT_EVIDENCE: 0 };
  for (const castId of new Set(evidenceRows.map((row) => row.castId))) {
    const castRows = evidenceRows.filter((row) => row.castId === castId);
    const strong = castRows.some((row) => row.townCurrent || row.ctiCurrent);
    const alias = castRows.some((row) => row.aliasEvidence);
    const listing = castRows.some((row) => row.mediaListingEvidence);
    const heaven = castRows.some((row) => row.heavenEvidence);
    const key = strong ? "STRONG_DATASET_EVIDENCE" : alias && listing ? "ALIAS_AND_LISTING_ONLY" : alias ? "ALIAS_ONLY" : listing ? "LISTING_ONLY" : heaven ? "HEAVEN_ONLY" : "OTHER_CURRENT_EVIDENCE";
    currentEvidence60[key] += 1;
  }
  return { valid: errors.length === 0, errors, membershipFreeCastCount, membershipFreeCellCount: membershipFreeRows.length, createActiveCount: create.length, reviewRequiredCount: review.length, reentryReviewCount: reentry.length, noopCount: noop.length, townOnly, ctiOnly, both, storeCounts, currentEvidence60 };
}

export async function applyGapMemberships(candidateKeys: Array<{ castId: string; storeId: string }>, confirmation: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  if (confirmation !== "CONFIRM") throw new Error("Gap ApplyにはCONFIRMの明示確認が必要です。");
  return db.$transaction(async (tx) => {
    const latest = await loadGapApplyPreview(tx);
    const selectedKeys = new Set(candidateKeys.map((candidate) => `${candidate.castId}:${candidate.storeId}`));
    const selected = latest.filter((candidate) => selectedKeys.has(`${candidate.castId}:${candidate.storeId}`));
    if (selected.some((candidate) => candidate.action !== "CREATE_ACTIVE")) throw new Error("Preview後に候補状態が変化しました。再PreviewしてREVIEW/NOOPを確認してください。");
    const castIds = [...new Set(selected.map((candidate) => candidate.castId))].sort();
    for (const castId of castIds) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cast-membership-gap:${castId}`})) IS NULL AS locked`;
    const existingByCast = await tx.castStoreMembership.findMany({ where: { castId: { in: castIds } }, select: { castId: true } });
    if (existingByCast.length) throw new Error("Apply対象Castに既存Membershipがあります。自動再入店は行わずReviewへ送ります。");
    const created: string[] = [];
    for (const candidate of selected) {
      const row = await tx.castStoreMembership.create({ data: { castId: candidate.castId, storeId: candidate.storeId, status: CastMembershipStatus.ACTIVE, joinedAt: null, leftAt: null, source: "MEDIA_EVIDENCE_GAP_RESOLUTION", sourceConfidence: "CONFIRMED" } });
      created.push(row.id);
    }
    return { created };
  });
}

export async function loadMembershipGapAudit(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const [candidates, casts, stores, facts] = await Promise.all([
    loadCurrentMembershipCandidates(db),
    db.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, status: true, startedOn: true, endedOn: true, primaryStoreId: true, memberships: { select: { storeId: true, status: true, joinedAt: true, leftAt: true } }, aliases: { where: { validTo: null, reviewStatus: { not: "IGNORED" } }, select: { storeId: true, aliasName: true } }, mediaListings: { where: { isListed: true }, select: { storeId: true, mediaType: true } } } }),
    db.store.findMany({ where: { isActive: true }, select: { id: true, shortName: true } }),
    db.townCastDaily.findMany({ select: { castId: true, date: true } }),
  ]);
  const byCast = new Map<string, typeof candidates>();
  for (const candidate of candidates) byCast.set(candidate.castId, [...(byCast.get(candidate.castId) ?? []), candidate]);
  const factMax = new Map<string, Date>();
  for (const fact of facts) if (fact.castId && (!factMax.get(fact.castId) || fact.date > factMax.get(fact.castId)!)) factMax.set(fact.castId, fact.date);
  const noMembership = casts.filter((cast) => cast.memberships.length === 0).map((cast) => {
    const rows = byCast.get(cast.id) ?? [];
    const positive = rows.some((row) => row.evidence.ctiCurrent || row.evidence.townCurrent || row.evidence.mediaListingEvidence || row.evidence.aliasEvidence);
    const marker = /(?:退店|休業)/u.test(cast.displayName);
    const category: GapCategory = marker ? "DISPLAY_NAME_RETIRED_MARKER" : positive ? "CURRENT_MEDIA_EVIDENCE" : factMax.has(cast.id) ? "HISTORICAL_ONLY" : cast.status === CastStatus.INACTIVE ? "LEGACY_INACTIVE" : "LEGACY_ACTIVE_NO_CURRENT_MEDIA";
    return { castId: cast.id, displayName: cast.displayName, legacyStatus: cast.status, endedOn: cast.endedOn, primaryStoreId: cast.primaryStoreId, currentAliases: cast.aliases, currentListings: cast.mediaListings, evidence: rows.map((row) => ({ storeId: row.storeId, storeName: row.storeName, ctiCurrent: row.evidence.ctiCurrent, townCurrent: row.evidence.townCurrent, reasons: row.evidence.reasons })), factLatestDate: factMax.get(cast.id) ?? null, membershipCount: 0, category };
  });
  const shadowCasts = casts.map((cast) => ({ ...cast, memberships: cast.memberships.map((membership) => ({ ...membership })) })) as ShadowCast[];
  const shadowStores = stores as ShadowStore[];
  const shadow = summarizeShadowSnapshot(shadowCasts, shadowStores, new Date());
  const legacyActiveMembershipInactive = shadow.differences.filter((difference) => difference.classification === "LEGACY_ACTIVE_MEMBERSHIP_INACTIVE");
  const primaryStoreStale = shadow.differences.filter((difference) => difference.classification === "PRIMARY_STORE_DIFFERENCE" && difference.cast.primaryStoreId && !difference.cast.memberships.some((membership) => membership.storeId === difference.cast.primaryStoreId && membership.status !== CastMembershipStatus.LEFT));
  return { noMembership, noMembershipCounts: noMembership.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.category]: (counts[item.category] ?? 0) + 1 }), {}), legacyActiveMembershipInactive, legacyActiveMembershipInactiveCastCount: new Set(legacyActiveMembershipInactive.map((item) => item.cast.id)).size, primaryStoreStale, shadowSummary: shadow };
}
