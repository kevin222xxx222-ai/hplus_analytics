import { describe, expect, it } from "vitest";
import { CastStatus } from "@/generated/prisma/client";
import { classifyCastForMembershipBackfill, summarizeBackfillAudit, type BackfillAuditCast } from "./membership-backfill-audit";

const base = (overrides: Partial<BackfillAuditCast> = {}): BackfillAuditCast => ({
  id: "cast-1", displayName: "Test", status: CastStatus.ACTIVE, startedOn: new Date("2025-01-01T00:00:00Z"), endedOn: null,
  primaryStoreId: "store-1", membershipCount: 0, evidence: { storeIds: ["store-1"], sourceKinds: ["PRIMARY_STORE"], dateRanges: [] }, ...overrides,
});

describe("membership backfill audit", () => {
  it("classifies a trusted active single-store cast as SAFE_AUTO", () => {
    expect(classifyCastForMembershipBackfill(base(), true).classification).toBe("SAFE_AUTO");
  });
  it("classifies a trusted inactive cast with dates as SAFE_LEFT", () => {
    expect(classifyCastForMembershipBackfill(base({ status: CastStatus.INACTIVE, endedOn: new Date("2025-06-30T00:00:00Z") }), true).classification).toBe("SAFE_LEFT");
  });
  it("does not trust legacy dates by default", () => {
    expect(classifyCastForMembershipBackfill(base()).classification).toBe("DATE_UNCERTAIN");
  });
  it("classifies missing primary store as STORE_UNCERTAIN", () => {
    expect(classifyCastForMembershipBackfill(base({ primaryStoreId: null, evidence: { storeIds: [], sourceKinds: [], dateRanges: [] } }), true).classification).toBe("STORE_UNCERTAIN");
  });
  it("classifies multi-store evidence as manual review", () => {
    expect(classifyCastForMembershipBackfill(base({ evidence: { storeIds: ["store-1", "store-2"], sourceKinds: ["FACT", "ALIAS"], dateRanges: [] } }), true).classification).toBe("MULTI_STORE_EVIDENCE");
  });
  it("does not classify invalid date ranges as safe", () => {
    expect(classifyCastForMembershipBackfill(base({ status: CastStatus.INACTIVE, endedOn: new Date("2024-12-31T00:00:00Z") }), true).classification).toBe("DATE_UNCERTAIN");
  });
  it("excludes existing Memberships from backfill", () => {
    expect(classifyCastForMembershipBackfill(base({ membershipCount: 1 }), true).classification).toBe("EXISTING_MEMBERSHIP");
  });
  it("summarizes classifications", () => {
    const results = [classifyCastForMembershipBackfill(base(), true), classifyCastForMembershipBackfill(base({ membershipCount: 1 }), true)];
    expect(summarizeBackfillAudit(results)).toMatchObject({ totalCasts: 2, safeAuto: 1, alreadyMigrated: 1 });
  });
});
