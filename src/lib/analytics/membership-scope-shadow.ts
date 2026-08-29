import type { CastMembershipStatus } from "@/generated/prisma/client";

export type ScopeCast = { id: string; displayName: string; status: string; endedOn: Date | null; primaryStoreId: string | null; memberships: Array<{ storeId: string; status: CastMembershipStatus }> };
export type ScopeStore = { id: string; name: string; shortName: string };
export type ScopeShadowRow = ScopeCast & { storeId: string; storeName: string; legacyIncluded: boolean; membershipIncluded: boolean; differenceType: "MATCH_INCLUDED" | "MATCH_EXCLUDED" | "LEGACY_ONLY" | "MEMBERSHIP_ONLY"; classification: "EXPECTED_MULTI_STORE_DIFFERENCE" | "PRIMARY_STORE_STALE" | "LEGACY_STATUS_STALE" | "CURRENT_STORE_MEMBERSHIP_MISSING" | "RETIRED_OR_REVIEW_REQUIRED" | "OTHER" };

export function buildCurrentScopeShadow(casts: ScopeCast[], stores: ScopeStore[]): ScopeShadowRow[] {
  return stores.flatMap((store) => casts.map((cast) => {
    const legacyIncluded = cast.status === "ACTIVE" && cast.primaryStoreId === store.id;
    const membershipIncluded = cast.memberships.some((membership) => membership.storeId === store.id && (membership.status === "ACTIVE" || membership.status === "ON_LEAVE"));
    const differenceType = legacyIncluded === membershipIncluded ? (legacyIncluded ? "MATCH_INCLUDED" : "MATCH_EXCLUDED") : legacyIncluded ? "LEGACY_ONLY" : "MEMBERSHIP_ONLY";
    let classification: ScopeShadowRow["classification"] = "OTHER";
    if (differenceType === "LEGACY_ONLY" && cast.memberships.some((membership) => membership.status === "ACTIVE" || membership.status === "ON_LEAVE")) classification = "EXPECTED_MULTI_STORE_DIFFERENCE";
    else if (differenceType === "LEGACY_ONLY" && cast.primaryStoreId === store.id) classification = "CURRENT_STORE_MEMBERSHIP_MISSING";
    else if (differenceType === "MEMBERSHIP_ONLY" && cast.status !== "ACTIVE") classification = "RETIRED_OR_REVIEW_REQUIRED";
    else if (differenceType === "MEMBERSHIP_ONLY") classification = "PRIMARY_STORE_STALE";
    return { ...cast, storeId: store.id, storeName: store.shortName || store.name, legacyIncluded, membershipIncluded, differenceType, classification };
  }));
}

export function summarizeScopeShadow(rows: ScopeShadowRow[]) {
  const differences = rows.filter((row) => row.differenceType === "LEGACY_ONLY" || row.differenceType === "MEMBERSHIP_ONLY");
  const classificationCounts = differences.reduce<Record<string, number>>((out, row) => { out[row.classification] = (out[row.classification] ?? 0) + 1; return out; }, {});
  return { evaluated: rows.length, legacyIncluded: rows.filter((row) => row.legacyIncluded).length, membershipIncluded: rows.filter((row) => row.membershipIncluded).length, match: rows.length - differences.length, legacyOnly: rows.filter((row) => row.differenceType === "LEGACY_ONLY").length, membershipOnly: rows.filter((row) => row.differenceType === "MEMBERSHIP_ONLY").length, classificationCounts, exclusive: Object.values(classificationCounts).reduce((sum, count) => sum + count, 0) === differences.length, OTHER: classificationCounts.OTHER ?? 0 };
}
