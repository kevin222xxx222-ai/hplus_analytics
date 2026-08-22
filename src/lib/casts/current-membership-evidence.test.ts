import { describe, expect, it } from "vitest";
import { classifyCurrentMembershipDecision } from "./current-membership-evidence";

const evidence = (extra = {}) => ({ ctiCurrent: false, townCurrent: false, reasons: [], ...extra });

describe("current membership evidence decision", () => {
  it("requires latest CTI/Town positive evidence", () => {
    expect(classifyCurrentMembershipDecision({ castStatus: "ACTIVE", displayName: "A", evidence: evidence({ townCurrent: true }) })).toBe("CREATE_ACTIVE");
    expect(classifyCurrentMembershipDecision({ castStatus: "ACTIVE", displayName: "A", evidence: evidence() })).toBe("NO_EVIDENCE");
  });
  it("does not create from Heaven, alias or listing-only evidence", () => {
    expect(classifyCurrentMembershipDecision({ castStatus: "ACTIVE", displayName: "A", evidence: evidence({ reasons: ["Heaven累計Fact（補足・自動初期化対象外）"] }) })).toBe("HEAVEN_CURRENT_REVIEW");
  });
  it("routes marker, inactive, and re-entry conflicts to review", () => {
    expect(classifyCurrentMembershipDecision({ castStatus: "ACTIVE", displayName: "A【退店】", evidence: evidence({ ctiCurrent: true }) })).toBe("LEGACY_STATUS_CONFLICT");
    expect(classifyCurrentMembershipDecision({ castStatus: "INACTIVE", displayName: "A", evidence: evidence({ townCurrent: true }) })).toBe("LEGACY_STATUS_CONFLICT");
    expect(classifyCurrentMembershipDecision({ castStatus: "ACTIVE", displayName: "A", membershipStatus: "LEFT", evidence: evidence({ townCurrent: true }) })).toBe("REENTRY_REVIEW");
  });
});
