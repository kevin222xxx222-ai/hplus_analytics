import { describe, expect, it } from "vitest";
import { planMergedStateRepair } from "./merged-state-repair";
const membership = (storeId: string, status = "ACTIVE") => ({ id: `${storeId}-m`, storeId, status, joinedAt: null, leftAt: null, source: null, sourceConfidence: null, store: { shortName: storeId } });
const listing = (storeId: string, mediaType = "TOWN", isListed = true) => ({ id: `${storeId}-l`, storeId, mediaType, listedFrom: null, listedTo: null, isListed, store: { shortName: storeId } });
describe("merged state repair planning", () => {
  it("requires same-store membership equivalence", () => { expect(planMergedStateRepair([membership("a")], [membership("a")], [], []).membershipPairs[0].safeToCloseSource).toBe(true); expect(planMergedStateRepair([membership("a")], [membership("b")], [], []).membershipPairs[0].action).toBe("REVIEW_TARGET_MEMBERSHIP_MISSING"); });
  it("requires same store and media listing equivalence", () => { expect(planMergedStateRepair([], [], [listing("a")], [listing("a")]).listingPairs[0].safeToCloseSource).toBe(true); expect(planMergedStateRepair([], [], [listing("a")], [listing("a", "CTI")]).listingPairs[0].safeToCloseSource).toBe(false); });
  it("does not plan already closed resources", () => { expect(planMergedStateRepair([membership("a", "LEFT")], [], [listing("a", "TOWN", false)], []).membershipPairs).toHaveLength(0); });
});
