import { CastMembershipStatus } from "@/generated/prisma/client";

export type DriftCast = { id: string; displayName: string; status: string; endedOn: Date | null; primaryStoreId: string | null; mergedIntoCastId: string | null; memberships: Array<{ storeId: string; status: CastMembershipStatus }> };
export function classifyLegacyStateDrift(cast: DriftCast) {
  const current = cast.memberships.filter((m) => m.status === CastMembershipStatus.ACTIVE || m.status === CastMembershipStatus.ON_LEAVE);
  const activeStores = [...new Set(current.map((m) => m.storeId))];
  const reasons: string[] = [];
  if (cast.mergedIntoCastId && current.length) reasons.push("MERGED_CAST_CURRENT_MEMBERSHIP");
  if (cast.status === "INACTIVE" && current.length) reasons.push("CURRENT_MEMBERSHIP_WITH_INACTIVE_CAST");
  if (cast.status === "ACTIVE" && current.length === 0) reasons.push("ALL_MEMBERSHIPS_LEFT_BUT_CAST_ACTIVE");
  if (cast.primaryStoreId && !activeStores.includes(cast.primaryStoreId)) reasons.push("PRIMARY_STORE_STALE");
  if (!cast.primaryStoreId && current.length) reasons.push("PRIMARY_STORE_NULL_WITH_MEMBERSHIP");
  if (cast.endedOn && current.length) reasons.push("ENDED_ON_STALE");
  return { castId: cast.id, displayName: cast.displayName, reasons, currentStoreIds: activeStores, drift: reasons.length > 0 };
}
