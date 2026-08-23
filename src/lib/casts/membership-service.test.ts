import { describe, expect, it } from "vitest";
import { CastMembershipStatus } from "@/generated/prisma/client";
import { isMembershipActiveOn, membershipPeriodsOverlap, validateExitDateConsistency, validateExitDatePreflight, validateMembershipInput } from "./membership-service";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("membership-service validation", () => {
  it("accepts an active membership without a left date", () => {
    expect(() => validateMembershipInput({ status: CastMembershipStatus.ACTIVE, joinedAt: day("2025-01-01"), leftAt: null })).not.toThrow();
  });

  it("requires leftAt for LEFT", () => {
    expect(() => validateMembershipInput({ status: CastMembershipStatus.LEFT, joinedAt: day("2025-01-01"), leftAt: null })).toThrow();
  });

  it("rejects reversed dates", () => {
    expect(() => validateMembershipInput({ status: CastMembershipStatus.LEFT, joinedAt: day("2025-02-01"), leftAt: day("2025-01-31") })).toThrow();
  });

  it("detects overlap and permits adjacent periods", () => {
    expect(membershipPeriodsOverlap({ joinedAt: day("2025-01-01"), leftAt: day("2025-06-30") }, { joinedAt: day("2025-06-30"), leftAt: null })).toBe(true);
    expect(membershipPeriodsOverlap({ joinedAt: day("2025-01-01"), leftAt: day("2025-06-30") }, { joinedAt: day("2025-07-01"), leftAt: null })).toBe(false);
  });

  it("uses inclusive joinedAt and leftAt boundaries", () => {
    const membership = { joinedAt: day("2025-01-01"), leftAt: day("2025-06-30") };
    expect(isMembershipActiveOn(membership, day("2025-01-01"))).toBe(true);
    expect(isMembershipActiveOn(membership, day("2025-06-30"))).toBe(true);
    expect(isMembershipActiveOn(membership, day("2025-07-01"))).toBe(false);
  });

  it("keeps an ON_LEAVE membership in its date range", () => {
    expect(() => validateMembershipInput({ status: CastMembershipStatus.ON_LEAVE, joinedAt: day("2025-01-01"), leftAt: null })).not.toThrow();
    expect(isMembershipActiveOn({ joinedAt: day("2025-01-01"), leftAt: null }, day("2025-06-01"))).toBe(true);
  });

  it("allows idempotent exit repair and rejects a conflicting exit date", () => {
    expect(() => validateExitDateConsistency(day("2026-06-30"), [day("2026-06-30"), null])).not.toThrow();
    expect(() => validateExitDateConsistency(day("2026-07-01"), [day("2026-06-30")])).toThrow();
  });

  it("rejects future-started alias or listing before exit writes", () => {
    expect(() => validateExitDatePreflight(day("2026-06-30"), 0, 0)).not.toThrow();
    expect(() => validateExitDatePreflight(day("2026-06-30"), 1, 0)).toThrow();
    expect(() => validateExitDatePreflight(day("2026-06-30"), 0, 1)).toThrow();
  });
});
