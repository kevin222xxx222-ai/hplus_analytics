import { CastMembershipStatus, CastStatus, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { loadCurrentMembershipCandidates } from "@/lib/casts/current-membership-evidence";
import { summarizeShadowSnapshot, type ShadowCast, type ShadowStore } from "@/lib/casts/shadow-read-audit";

export type GapCategory = "CURRENT_MEDIA_EVIDENCE" | "LEGACY_ACTIVE_NO_CURRENT_MEDIA" | "LEGACY_INACTIVE" | "DISPLAY_NAME_RETIRED_MARKER" | "STORE_EVIDENCE_UNKNOWN" | "HISTORICAL_ONLY" | "MERGE_OR_DUPLICATE_CANDIDATE";

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
