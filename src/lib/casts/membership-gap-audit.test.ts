import { describe, expect, it } from "vitest";
import { CastMembershipStatus } from "@/generated/prisma/client";
import { classifyGapApplyAction } from "@/lib/casts/membership-gap-audit";

const evidence = (decision: "CREATE_ACTIVE" | "NO_EVIDENCE" = "CREATE_ACTIVE", positiveEvidence = true) => classifyGapApplyAction({ membershipCount: 0, decision, positiveEvidence });

describe("membership gap apply classification", () => {
  it("creates only for a positive current Town/CTI candidate", () => {
    expect(evidence()).toBe("CREATE_ACTIVE");
    expect(evidence("NO_EVIDENCE", false)).toBe("REVIEW_REQUIRED");
  });

  it("keeps existing active memberships as NOOP", () => {
    expect(classifyGapApplyAction({ membershipCount: 1, currentMembershipStatus: CastMembershipStatus.ACTIVE, decision: "CREATE_ACTIVE", positiveEvidence: true })).toBe("NOOP");
    expect(classifyGapApplyAction({ membershipCount: 1, currentMembershipStatus: CastMembershipStatus.ON_LEAVE, decision: "CREATE_ACTIVE", positiveEvidence: true })).toBe("NOOP");
  });

  it("does not auto-reenter a Cast with a previous LEFT membership", () => {
    expect(classifyGapApplyAction({ membershipCount: 1, currentMembershipStatus: CastMembershipStatus.LEFT, decision: "CREATE_ACTIVE", positiveEvidence: true })).toBe("REENTRY_REVIEW");
  });

  it("supports multiple stores as independent Cast×Store candidates", () => {
    const stores = ["kasukabe", "koshigaya"].map(() => evidence());
    expect(stores).toEqual(["CREATE_ACTIVE", "CREATE_ACTIVE"]);
  });
});
