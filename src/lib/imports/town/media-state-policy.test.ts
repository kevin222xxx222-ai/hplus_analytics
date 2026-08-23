import { describe, expect, it } from "vitest";
import { CastMembershipStatus, CastStatus } from "@/generated/prisma/client";
import { canCurrentizeTownCastState } from "@/lib/imports/town/media-state-policy";

const exitDate = new Date("2026-06-30T00:00:00.000Z");

describe("Town CAST media currentization policy", () => {
  it("opens an active cast for a current dataset", () => {
    expect(canCurrentizeTownCastState({ status: CastStatus.ACTIVE, endedOn: null, targetDate: new Date("2026-08-22T00:00:00.000Z"), membershipStatuses: [CastMembershipStatus.ACTIVE], ignoredAlias: false })).toBe(true);
  });

  it("keeps a retired cast closed for post-exit facts", () => {
    expect(canCurrentizeTownCastState({ status: CastStatus.INACTIVE, endedOn: exitDate, targetDate: new Date("2026-08-22T00:00:00.000Z"), membershipStatuses: [CastMembershipStatus.LEFT], membershipEvidenceAvailable: true, ignoredAlias: false })).toBe(false);
  });

  it("allows historical facts through the media-state gate", () => {
    expect(canCurrentizeTownCastState({ status: CastStatus.INACTIVE, endedOn: exitDate, targetDate: new Date("2026-06-15T00:00:00.000Z"), membershipStatuses: [CastMembershipStatus.ACTIVE], ignoredAlias: false })).toBe(true);
  });

  it("does not currentize an ignored alias or an all-left cast", () => {
    expect(canCurrentizeTownCastState({ status: CastStatus.ACTIVE, endedOn: null, targetDate: new Date("2026-08-22T00:00:00.000Z"), membershipStatuses: [CastMembershipStatus.ACTIVE], ignoredAlias: true })).toBe(false);
    expect(canCurrentizeTownCastState({ status: CastStatus.ACTIVE, endedOn: null, targetDate: new Date("2026-08-22T00:00:00.000Z"), membershipStatuses: [CastMembershipStatus.LEFT], membershipEvidenceAvailable: true, ignoredAlias: false })).toBe(false);
  });
});
