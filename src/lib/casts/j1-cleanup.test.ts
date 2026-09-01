import { describe, expect, it } from "vitest";
import { classifyJ1 } from "./j1-cleanup";
describe("J1 cleanup classification", () => {
  it("classifies safe inactive and media combinations", () => { expect(classifyJ1({ status: "ACTIVE", merged: false, memberships: 0, aliases: 0, listings: 0, townCurrent: false, hasEndedOn: false, marker: false }).classification).toBe("SAFE_GLOBAL_INACTIVE_CANDIDATE"); expect(classifyJ1({ status: "ACTIVE", merged: false, memberships: 0, aliases: 1, listings: 1, townCurrent: false, hasEndedOn: false, marker: false }).classification).toBe("STALE_ALIAS_AND_LISTING"); });
  it("never applies merged or current Town rows automatically", () => { expect(classifyJ1({ status: "ACTIVE", merged: true, memberships: 0, aliases: 1, listings: 0, townCurrent: false, hasEndedOn: false, marker: false }).applyEligible).toBe(false); expect(classifyJ1({ status: "ACTIVE", merged: false, memberships: 0, aliases: 0, listings: 0, townCurrent: true, hasEndedOn: false, marker: false }).classification).toBe("MEMBERSHIP_DATA_GAP_CONFIRMED"); });
});
