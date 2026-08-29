import { CastMembershipStatus } from "@/generated/prisma/client";

export type MembershipReadMode = "legacy" | "shadow" | "membership";
export type HistoricalMembershipResult = "MEMBER" | "NOT_MEMBER" | "UNKNOWN";
export type MembershipLike = {
  storeId: string;
  status: CastMembershipStatus;
  joinedAt: Date | null;
  leftAt: Date | null;
};

export type CurrentShadowDifference =
  | "MATCH"
  | "LEGACY_TRUE_MEMBERSHIP_FALSE"
  | "LEGACY_FALSE_MEMBERSHIP_TRUE"
  | "MEMBERSHIP_UNKNOWN";

export type CurrentMembershipShadowRow = {
  castId: string;
  storeId: string;
  legacyResult: boolean;
  membershipResult: boolean;
  differenceType: CurrentShadowDifference;
  reason?: "EXPECTED_STORE_SCOPE" | "MEMBERSHIP_MISSING" | "LEGACY_STATUS_STALE" | "PRIMARY_STORE_DIFFERENCE" | "OTHER";
};

const currentStatuses = new Set<CastMembershipStatus>([CastMembershipStatus.ACTIVE, CastMembershipStatus.ON_LEAVE]);

/** Current membership is store-scoped. ON_LEAVE remains part of the roster. */
export function isCastCurrentMember(input: { memberships: MembershipLike[]; storeId: string }): boolean {
  return input.memberships.some((membership) => membership.storeId === input.storeId && currentStatuses.has(membership.status));
}

/**
 * Historical membership deliberately returns UNKNOWN when a candidate period
 * has no known start date. Legacy startedOn must not be used as a fallback.
 */
export function getCastMembershipAsOf(input: { memberships: MembershipLike[]; storeId: string; businessDate: Date }): HistoricalMembershipResult {
  const rows = input.memberships.filter((membership) => membership.storeId === input.storeId);
  if (rows.some((membership) => membership.joinedAt && membership.joinedAt <= input.businessDate && (!membership.leftAt || input.businessDate <= membership.leftAt))) return "MEMBER";
  if (rows.some((membership) => !membership.joinedAt)) return "UNKNOWN";
  return "NOT_MEMBER";
}

export function isCastMemberAt(input: { memberships: MembershipLike[]; storeId: string; businessDate: Date }): HistoricalMembershipResult {
  return getCastMembershipAsOf(input);
}

export function parseMembershipReadMode(raw: string | undefined): MembershipReadMode {
  if (raw === "shadow" || raw === "membership" || raw === "legacy") return raw;
  return "legacy";
}

export function resolveMembershipReadMode(env: NodeJS.ProcessEnv = process.env): MembershipReadMode {
  return parseMembershipReadMode(env.MEMBERSHIP_READ_MODE);
}

export function resolveTownCastMembershipReadMode(env: NodeJS.ProcessEnv = process.env): MembershipReadMode {
  return parseMembershipReadMode(env.TOWN_CAST_MEMBERSHIP_READ_MODE ?? env.MEMBERSHIP_READ_MODE);
}

export function classifyCurrentMembershipDifference(legacyResult: boolean, membershipResult: boolean): CurrentShadowDifference {
  if (legacyResult === membershipResult) return "MATCH";
  return legacyResult ? "LEGACY_TRUE_MEMBERSHIP_FALSE" : "LEGACY_FALSE_MEMBERSHIP_TRUE";
}

/** Return the formal result while retaining a comparison payload in shadow mode. */
export function resolveCurrentMembershipRead(input: {
  mode: MembershipReadMode;
  castId: string;
  storeId: string;
  legacyResult: boolean;
  memberships: MembershipLike[];
  reason?: CurrentMembershipShadowRow["reason"];
}) {
  const membershipResult = isCastCurrentMember({ memberships: input.memberships, storeId: input.storeId });
  const shadow: CurrentMembershipShadowRow = {
    castId: input.castId,
    storeId: input.storeId,
    legacyResult: input.legacyResult,
    membershipResult,
    differenceType: classifyCurrentMembershipDifference(input.legacyResult, membershipResult),
    reason: input.reason,
  };
  return { result: input.mode === "membership" ? membershipResult : input.legacyResult, membershipResult, shadow: input.mode === "legacy" ? null : shadow };
}

export function summarizeCurrentMembershipShadow(rows: CurrentMembershipShadowRow[]) {
  return {
    total: rows.length,
    differences: rows.filter((row) => row.differenceType !== "MATCH").length,
    differenceCounts: rows.reduce<Record<string, number>>((counts, row) => {
      counts[row.differenceType] = (counts[row.differenceType] ?? 0) + 1;
      return counts;
    }, {}),
  };
}
