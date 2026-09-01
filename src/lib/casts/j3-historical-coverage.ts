import { getCastMembershipAsOf, type HistoricalMembershipResult, type MembershipLike } from "@/lib/casts/membership-read";
export function classifyHistoricalResult(memberships: MembershipLike[], storeId: string, date: Date): { result: HistoricalMembershipResult; reason?: string } {
  const rows = memberships.filter((m) => m.storeId === storeId);
  const result = getCastMembershipAsOf({ memberships, storeId, businessDate: date });
  if (result !== "UNKNOWN") return { result };
  if (!rows.length) return { result, reason: "NO_MEMBERSHIP_RECORD" };
  if (rows.every((m) => !m.joinedAt)) return { result, reason: "BOTH_BOUNDS_UNKNOWN" };
  return { result, reason: "JOINED_AT_UNKNOWN" };
}
export function readiness(unknownRate: number): "READY" | "PARTIAL" | "NOT_READY" { return unknownRate === 0 ? "READY" : unknownRate < 0.2 ? "PARTIAL" : "NOT_READY"; }
