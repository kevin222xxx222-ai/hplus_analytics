import { CastMembershipStatus } from "@/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { getCastMembershipAsOf, isCastCurrentMember, parseMembershipReadMode, resolveCurrentMembershipRead, summarizeCurrentMembershipShadow } from "@/lib/casts/membership-read";

const storeId = "store-kasukabe";
const row = (status: CastMembershipStatus, joinedAt: string | null, leftAt: string | null, store = storeId) => ({ storeId: store, status, joinedAt: joinedAt ? new Date(`${joinedAt}T00:00:00.000Z`) : null, leftAt: leftAt ? new Date(`${leftAt}T00:00:00.000Z`) : null });

describe("membership read foundation", () => {
  it("treats ACTIVE and ON_LEAVE as current, but not LEFT or another store", () => {
    expect(isCastCurrentMember({ memberships: [row(CastMembershipStatus.ACTIVE, null, null)], storeId })).toBe(true);
    expect(isCastCurrentMember({ memberships: [row(CastMembershipStatus.ON_LEAVE, null, null)], storeId })).toBe(true);
    expect(isCastCurrentMember({ memberships: [row(CastMembershipStatus.LEFT, "2026-01-01", "2026-02-01")], storeId })).toBe(false);
    expect(isCastCurrentMember({ memberships: [row(CastMembershipStatus.ACTIVE, null, null, "store-koshigaya")], storeId })).toBe(false);
  });

  it("returns three-valued historical results with inclusive leftAt", () => {
    const memberships = [row(CastMembershipStatus.LEFT, "2026-04-01", "2026-06-30")];
    expect(getCastMembershipAsOf({ memberships, storeId, businessDate: new Date("2026-03-31T00:00:00Z") })).toBe("NOT_MEMBER");
    expect(getCastMembershipAsOf({ memberships, storeId, businessDate: new Date("2026-06-30T00:00:00Z") })).toBe("MEMBER");
    expect(getCastMembershipAsOf({ memberships, storeId, businessDate: new Date("2026-07-01T00:00:00Z") })).toBe("NOT_MEMBER");
    expect(getCastMembershipAsOf({ memberships: [row(CastMembershipStatus.ACTIVE, null, null)], storeId, businessDate: new Date("2026-05-01T00:00:00Z") })).toBe("UNKNOWN");
  });

  it("uses legacy as the safe default and keeps the formal result in shadow mode", () => {
    expect(parseMembershipReadMode(undefined)).toBe("legacy");
    expect(parseMembershipReadMode("invalid")).toBe("legacy");
    const shadow = resolveCurrentMembershipRead({ mode: "shadow", castId: "cast-1", storeId, legacyResult: false, memberships: [row(CastMembershipStatus.ACTIVE, null, null)] });
    expect(shadow.result).toBe(false);
    expect(shadow.membershipResult).toBe(true);
    expect(shadow.shadow?.differenceType).toBe("LEGACY_FALSE_MEMBERSHIP_TRUE");
    expect(resolveCurrentMembershipRead({ mode: "membership", castId: "cast-1", storeId, legacyResult: false, memberships: [row(CastMembershipStatus.ACTIVE, null, null)] }).result).toBe(true);
  });

  it("summarizes aggregate differences without requiring PII", () => {
    const rows = [
      resolveCurrentMembershipRead({ mode: "shadow", castId: "cast-1", storeId, legacyResult: true, memberships: [] }).shadow!,
      resolveCurrentMembershipRead({ mode: "shadow", castId: "cast-2", storeId, legacyResult: false, memberships: [] }).shadow!,
    ];
    expect(summarizeCurrentMembershipShadow(rows)).toEqual({ total: 2, differences: 1, differenceCounts: { MATCH: 1, LEGACY_TRUE_MEMBERSHIP_FALSE: 1 } });
  });
});
