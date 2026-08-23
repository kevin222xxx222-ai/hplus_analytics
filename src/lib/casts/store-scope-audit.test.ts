import { describe, expect, it } from "vitest";
import { CastMembershipStatus, CastStatus } from "@/generated/prisma/client";
import { classifyLegacyActiveInactive, classifyPrimaryStore, hasCurrentStoreMembership } from "@/lib/casts/store-scope-audit";

describe("store scope audit", () => {
  it("classifies expected non-primary scope without current dataset", () => {
    expect(classifyLegacyActiveInactive({ legacyStatus: CastStatus.ACTIVE, otherActiveCount: 1, townCurrent: false, ctiCurrent: false })).toBe("EXPECTED_STORE_SCOPE_DIFFERENCE");
  });
  it("recognizes ACTIVE and ON_LEAVE membership for the exact store", () => {
    expect(hasCurrentStoreMembership([{ storeId: "a", status: CastMembershipStatus.ACTIVE }], "a")).toBe(true);
    expect(hasCurrentStoreMembership([{ storeId: "a", status: CastMembershipStatus.ON_LEAVE }], "a")).toBe(true);
    expect(hasCurrentStoreMembership([{ storeId: "b", status: CastMembershipStatus.ACTIVE }], "a")).toBe(false);
  });
  it("classifies current evidence without membership as a gap", () => {
    expect(classifyLegacyActiveInactive({ legacyStatus: CastStatus.ACTIVE, otherActiveCount: 1, townCurrent: true, ctiCurrent: false })).toBe("CURRENT_STORE_MEMBERSHIP_MISSING");
  });
  it("classifies LEFT current evidence as re-entry review", () => {
    expect(classifyLegacyActiveInactive({ legacyStatus: CastStatus.ACTIVE, targetStatus: CastMembershipStatus.LEFT, otherActiveCount: 0, townCurrent: true, ctiCurrent: false })).toBe("LEFT_STORE_CONFLICT");
  });
  it("separates primary multi-store, stale, and missing", () => {
    expect(classifyPrimaryStore({ primaryStoreId: "a", activeStoreIds: ["a", "b"] })).toBe("EXPECTED_MULTI_STORE_DIFFERENCE");
    expect(classifyPrimaryStore({ primaryStoreId: "a", activeStoreIds: ["b"] })).toBe("PRIMARY_STORE_STALE");
    expect(classifyPrimaryStore({ primaryStoreId: null, activeStoreIds: ["b"] })).toBe("PRIMARY_STORE_MISSING");
  });
});
