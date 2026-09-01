import { describe, expect, it } from "vitest";
import { classifyTargetMembershipReview } from "./merged-target-membership-review";
const strong = { targetMembershipStatuses: [], targetCurrentAlias: true, targetCurrentListing: true, targetTownCurrent: true, sourceStoreEvidence: true };
describe("merged target membership review", () => {
  it("confirms a current evidence gap", () => expect(classifyTargetMembershipReview(strong).classification).toBe("TARGET_MEMBERSHIP_DATA_GAP_CONFIRMED"));
  it("does not create when target is active, on leave, or left", () => { expect(classifyTargetMembershipReview({ ...strong, targetMembershipStatuses: ["ACTIVE"] }).targetMembershipCreateCandidate).toBe(false); expect(classifyTargetMembershipReview({ ...strong, targetMembershipStatuses: ["ON_LEAVE"] }).targetMembershipCreateCandidate).toBe(false); expect(classifyTargetMembershipReview({ ...strong, targetMembershipStatuses: ["LEFT"] }).classification).toBe("TARGET_MEMBERSHIP_EVIDENCE_INSUFFICIENT"); });
  it("does not infer from historical evidence alone", () => expect(classifyTargetMembershipReview({ ...strong, targetCurrentAlias: false, targetCurrentListing: false, targetTownCurrent: false }).targetMembershipCreateCandidate).toBe(false));
});
