import { describe, expect, it } from "vitest";
import { CastMembershipStatus } from "@/generated/prisma/client";
import { classifyLegacyStateDrift } from "./legacy-state-drift";
import type { DriftCast } from "./legacy-state-drift";
const base = { id: "c", displayName: "A", status: "ACTIVE", endedOn: null, primaryStoreId: "s", mergedIntoCastId: null, memberships: [] } as unknown as DriftCast;
describe("legacy state drift", () => {
  it("detects inactive cast with current membership", () => expect(classifyLegacyStateDrift({ ...base, status: "INACTIVE", memberships: [{ storeId: "s", status: CastMembershipStatus.ACTIVE }] } as unknown as DriftCast).reasons).toContain("CURRENT_MEMBERSHIP_WITH_INACTIVE_CAST"));
  it("detects stale primary store and accepts valid state", () => { expect(classifyLegacyStateDrift({ ...base, memberships: [{ storeId: "x", status: CastMembershipStatus.ACTIVE }] } as unknown as DriftCast).reasons).toContain("PRIMARY_STORE_STALE"); expect(classifyLegacyStateDrift({ ...base, memberships: [{ storeId: "s", status: CastMembershipStatus.ACTIVE }] } as unknown as DriftCast).drift).toBe(false); });
});
