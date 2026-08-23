import { describe, expect, it } from "vitest";
import { CastMembershipStatus, CastStatus } from "@/generated/prisma/client";
import { classifyShadowCell } from "@/lib/casts/shadow-read-audit";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const base = { id: "cast", displayName: "あんな", status: CastStatus.ACTIVE, startedOn: day("2026-04-01"), endedOn: null, primaryStoreId: "store-a", memberships: [] };

describe("cast membership shadow comparison", () => {
  it("matches active legacy and membership", () => {
    expect(classifyShadowCell({ ...base, memberships: [{ storeId: "store-a", status: CastMembershipStatus.ACTIVE, joinedAt: day("2026-08-01"), leftAt: null }] }, "store-a", day("2026-08-23"), true)).toBe("MATCH");
  });

  it("classifies missing membership without inferring a date", () => {
    expect(classifyShadowCell(base, "store-a", day("2026-08-23"), true)).toBe("MEMBERSHIP_MISSING");
    expect(classifyShadowCell({ ...base, memberships: [{ storeId: "store-a", status: CastMembershipStatus.ACTIVE, joinedAt: null, leftAt: null }] }, "store-a", day("2026-08-23"))).toBe("UNKNOWN_DATE");
  });

  it("keeps leftAt inclusive and identifies re-entry differences", () => {
    const retired = { ...base, status: CastStatus.INACTIVE, endedOn: day("2026-06-30"), memberships: [{ storeId: "store-a", status: CastMembershipStatus.ACTIVE, joinedAt: day("2026-08-23"), leftAt: null }] };
    expect(classifyShadowCell(retired, "store-a", day("2026-08-23"), true)).toBe("REENTRY_DIFFERENCE");
    expect(classifyShadowCell({ ...base, status: CastStatus.INACTIVE, endedOn: day("2026-06-30"), memberships: [{ storeId: "store-a", status: CastMembershipStatus.LEFT, joinedAt: null, leftAt: day("2026-06-30") }] }, "store-a", day("2026-06-30"), true)).toBe("LEGACY_INACTIVE_MEMBERSHIP_ACTIVE");
  });
});
