import { CastMembershipStatus, CastStatus } from "@/generated/prisma/client";
import { loadCurrentMembershipCandidates, type CurrentMembershipCandidate } from "@/lib/casts/current-membership-evidence";
import { loadShadowReadData, summarizeShadowSnapshot } from "@/lib/casts/shadow-read-audit";
import { loadGapApplyPreview } from "@/lib/casts/membership-gap-audit";
import { prisma } from "@/lib/prisma";

export type StoreScopeClassification = "EXPECTED_STORE_SCOPE_DIFFERENCE" | "EXPECTED_NON_REGULAR" | "CURRENT_STORE_MEMBERSHIP_MISSING" | "LEFT_STORE_CONFLICT" | "LEGACY_STATUS_STALE" | "OTHER";
export type PrimaryStoreClassification = "EXPECTED_MULTI_STORE_DIFFERENCE" | "PRIMARY_STORE_STALE" | "PRIMARY_STORE_MISSING" | "NO_ACTIVE_MEMBERSHIP" | "OTHER";

type CandidateMap = Map<string, CurrentMembershipCandidate>;

export function classifyLegacyActiveInactive(input: { legacyStatus: CastStatus; targetStatus?: CastMembershipStatus; otherActiveCount: number; townCurrent: boolean; ctiCurrent: boolean }): StoreScopeClassification {
  const strong = input.townCurrent || input.ctiCurrent;
  if (input.targetStatus === CastMembershipStatus.LEFT && strong) return "LEFT_STORE_CONFLICT";
  if (input.legacyStatus === CastStatus.ACTIVE && strong && input.targetStatus !== CastMembershipStatus.ACTIVE && input.targetStatus !== CastMembershipStatus.ON_LEAVE) return "CURRENT_STORE_MEMBERSHIP_MISSING";
  if (input.legacyStatus === CastStatus.ACTIVE && !strong && input.otherActiveCount > 0) return "EXPECTED_STORE_SCOPE_DIFFERENCE";
  if (input.legacyStatus === CastStatus.ACTIVE && !strong && input.otherActiveCount === 0) return "LEGACY_STATUS_STALE";
  return "OTHER";
}

export function classifyPrimaryStore(input: { primaryStoreId: string | null; activeStoreIds: string[] }): PrimaryStoreClassification {
  if (!input.primaryStoreId) return "PRIMARY_STORE_MISSING";
  if (input.activeStoreIds.length === 0) return "NO_ACTIVE_MEMBERSHIP";
  if (!input.activeStoreIds.includes(input.primaryStoreId)) return "PRIMARY_STORE_STALE";
  return input.activeStoreIds.length > 1 ? "EXPECTED_MULTI_STORE_DIFFERENCE" : "OTHER";
}

export async function loadStoreScopeAudit(db = prisma) {
  const [{ casts, stores }, candidates, gapPreview, reviews] = await Promise.all([loadShadowReadData(db), loadCurrentMembershipCandidates(db), loadGapApplyPreview(db), db.castStoreMembershipReview.findMany({ where: { isActive: true, classification: "EXPECTED_NON_REGULAR" }, select: { castId: true, storeId: true, reason: true } })]);
  const reviewMap = new Map(reviews.map((review) => [`${review.castId}:${review.storeId}`, review]));
  const candidateMap: CandidateMap = new Map(candidates.map((candidate) => [`${candidate.castId}:${candidate.storeId}`, candidate]));
  const summary = summarizeShadowSnapshot(casts, stores, new Date());
  const legacyRows = summary.differences.filter((row) => row.classification === "LEGACY_ACTIVE_MEMBERSHIP_INACTIVE").map((row) => {
    const candidate = candidateMap.get(`${row.cast.id}:${row.store.id}`);
    const target = row.cast.memberships.find((membership) => membership.storeId === row.store.id);
    const otherActive = row.cast.memberships.filter((membership) => membership.storeId !== row.store.id && (membership.status === CastMembershipStatus.ACTIVE || membership.status === CastMembershipStatus.ON_LEAVE));
    const townCurrent = candidate?.evidence.townCurrent ?? false;
    const ctiCurrent = candidate?.evidence.ctiCurrent ?? false;
    const explicitReview = reviewMap.get(`${row.cast.id}:${row.store.id}`);
    const classification = explicitReview && (townCurrent || ctiCurrent) && !target?.status ? "EXPECTED_NON_REGULAR" as const : classifyLegacyActiveInactive({ legacyStatus: row.cast.status, targetStatus: target?.status, otherActiveCount: otherActive.length, townCurrent, ctiCurrent });
    const recommendation = classification === "CURRENT_STORE_MEMBERSHIP_MISSING" ? "ADD_MEMBERSHIP_CANDIDATE" : classification === "EXPECTED_NON_REGULAR" ? "EXPECTED_NON_REGULAR" : classification === "LEFT_STORE_CONFLICT" ? "REENTRY_REVIEW" : classification === "OTHER" ? "DATA_CONFLICT" : "AUDIT_BUG";
    return { castId: row.cast.id, displayName: row.cast.displayName, storeId: row.store.id, storeName: row.store.shortName, legacyStatus: row.cast.status, legacyEndedOn: row.cast.endedOn, primaryStoreId: row.cast.primaryStoreId, targetMembershipStatus: target?.status ?? null, targetMembershipLeftAt: target?.leftAt ?? null, otherActiveMemberships: otherActive.map((membership) => ({ storeId: membership.storeId, status: membership.status })), townCurrent, townDatasetDate: candidate?.evidence.townDataset?.date ?? null, townBatchId: candidate?.evidence.townDataset?.batchId ?? null, ctiCurrent, ctiDatasetDate: candidate?.evidence.ctiDataset?.date ?? null, ctiBatchId: candidate?.evidence.ctiDataset?.batchId ?? null, aliasEvidence: candidate?.evidence.aliasEvidence ?? false, mediaListingEvidence: candidate?.evidence.mediaListingEvidence ?? false, classification, recommendation, reason: classification === "EXPECTED_NON_REGULAR" ? explicitReview?.reason : classification === "EXPECTED_STORE_SCOPE_DIFFERENCE" ? "他Storeに在籍Membershipがあり、対象StoreにCurrent Town/CTI evidenceなし" : classification === "CURRENT_STORE_MEMBERSHIP_MISSING" ? "対象Storeに最新Town/CTI evidenceがあるがActive Membershipなし" : classification === "LEFT_STORE_CONFLICT" ? "対象StoreがLEFT MembershipでCurrent evidenceあり" : classification === "LEGACY_STATUS_STALE" ? "Legacy ACTIVEだが在籍MembershipとCurrent evidenceなし" : "分類条件外" };
  });
  const primaryRows = summary.differences.filter((row) => row.classification === "PRIMARY_STORE_DIFFERENCE");
  const primaryByCast = new Map<string, typeof casts[number]>();
  for (const row of primaryRows) primaryByCast.set(row.cast.id, row.cast);
  const primary = [...primaryByCast.values()].map((cast) => {
    const activeStoreIds = cast.memberships.filter((membership) => membership.status === CastMembershipStatus.ACTIVE || membership.status === CastMembershipStatus.ON_LEAVE).map((membership) => membership.storeId);
    const classification = classifyPrimaryStore({ primaryStoreId: cast.primaryStoreId, activeStoreIds });
    return { castId: cast.id, displayName: cast.displayName, primaryStoreId: cast.primaryStoreId, activeStoreIds, classification, reason: classification === "EXPECTED_MULTI_STORE_DIFFERENCE" ? "Primary Storeを含む複数店舗Membership" : classification === "PRIMARY_STORE_STALE" ? "Primary StoreにActive/OnLeave Membershipなし" : classification === "PRIMARY_STORE_MISSING" ? "Legacy primaryStoreId未設定" : classification === "NO_ACTIVE_MEMBERSHIP" ? "Active/OnLeave Membershipなし" : "分類条件外" };
  });
  const counts = legacyRows.reduce<Record<string, number>>((out, row) => { out[row.classification] = (out[row.classification] ?? 0) + 1; return out; }, {});
  const primaryCounts = primary.reduce<Record<string, number>>((out, row) => { out[row.classification] = (out[row.classification] ?? 0) + 1; return out; }, {});
  const strongMembershipFree = new Set(gapPreview.filter((row) => row.membershipFree && (row.townCurrent || row.ctiCurrent)).map((row) => row.castId)).size;
  const strongMembershipFreeRows = gapPreview.filter((row) => row.membershipFree && (row.townCurrent || row.ctiCurrent));
  const validation = { legacyTotal: legacyRows.length, legacyExclusive: Object.values(counts).reduce((sum, count) => sum + count, 0) === legacyRows.length, primaryTotal: primaryRows.length, primaryCastTotal: primary.length, otherLegacy: counts.OTHER ?? 0, otherPrimary: primaryCounts.OTHER ?? 0, strongMembershipFree, strongMembershipFreeZero: strongMembershipFree === 0, createActive: gapPreview.filter((row) => row.action === "CREATE_ACTIVE").length };
  return { generatedAt: new Date(), legacyRows, legacyCounts: counts, primaryRows: primary, primaryCounts, strongMembershipFreeRows, validation };
}
