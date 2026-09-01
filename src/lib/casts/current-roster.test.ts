import { describe, expect, it } from "vitest";
import { CastMembershipStatus } from "@/generated/prisma/client";
import { isCurrentRosterMember } from "./current-roster-pure";
describe("current roster membership", () => {
  it("is store scoped and includes ON_LEAVE", () => {
    expect(isCurrentRosterMember([{ storeId: "a", status: CastMembershipStatus.ON_LEAVE }], "a")).toBe(true);
    expect(isCurrentRosterMember([{ storeId: "b", status: CastMembershipStatus.ACTIVE }], "a")).toBe(false);
  });
  it("excludes LEFT", () => expect(isCurrentRosterMember([{ storeId: "a", status: CastMembershipStatus.LEFT }], "a")).toBe(false));
});
