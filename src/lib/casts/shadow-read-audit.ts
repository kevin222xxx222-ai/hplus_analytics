import { CastMembershipStatus, CastStatus, type Prisma } from "@/generated/prisma/client";
import { isCastCurrentMember } from "@/lib/casts/membership-read";
import { prisma } from "@/lib/prisma";

export type ShadowClassification =
  | "MATCH"
  | "LEGACY_ACTIVE_MEMBERSHIP_INACTIVE"
  | "LEGACY_INACTIVE_MEMBERSHIP_ACTIVE"
  | "STORE_SCOPE_DIFFERENCE"
  | "PRIMARY_STORE_DIFFERENCE"
  | "MEMBERSHIP_MISSING"
  | "REENTRY_DIFFERENCE"
  | "UNKNOWN_DATE";

export type ShadowCast = {
  id: string;
  displayName: string;
  status: CastStatus;
  startedOn: Date;
  endedOn: Date | null;
  primaryStoreId: string | null;
  memberships: Array<{ storeId: string; status: CastMembershipStatus; joinedAt: Date | null; leftAt: Date | null }>;
};

export type ShadowStore = { id: string; shortName: string };

function legacyActive(cast: ShadowCast, date: Date) {
  return cast.status === CastStatus.ACTIVE && cast.startedOn <= date && (!cast.endedOn || date <= cast.endedOn);
}

function membershipState(membership: ShadowCast["memberships"][number] | undefined, date: Date, current: boolean) {
  if (!membership || membership.status === CastMembershipStatus.LEFT && (!membership.leftAt || membership.leftAt < date)) return "INACTIVE" as const;
  if (!current && !membership.joinedAt) return "UNKNOWN" as const;
  if (membership.joinedAt && membership.joinedAt > date) return "INACTIVE" as const;
  if (membership.leftAt && date > membership.leftAt) return "INACTIVE" as const;
  return membership.status === CastMembershipStatus.ON_LEAVE ? "ON_LEAVE" as const : "ACTIVE" as const;
}

export function classifyShadowCell(cast: ShadowCast, storeId: string, date: Date, current = false): ShadowClassification {
  const legacyGlobal = legacyActive(cast, date);
  const legacy = legacyGlobal && cast.primaryStoreId === storeId;
  const membership = current
    ? (isCastCurrentMember({ memberships: cast.memberships, storeId }) ? "ACTIVE" : "INACTIVE")
    : membershipState(cast.memberships.find((item) => item.storeId === storeId && item.status !== CastMembershipStatus.LEFT)
      ?? cast.memberships.find((item) => item.storeId === storeId), date, false);
  if (membership === "UNKNOWN") return "UNKNOWN_DATE";
  const membershipActive = membership === "ACTIVE" || membership === "ON_LEAVE";
  if (!membershipActive && cast.memberships.length === 0) return "MEMBERSHIP_MISSING";
  if (legacy === membershipActive) {
    if (legacy && cast.primaryStoreId !== storeId) return "PRIMARY_STORE_DIFFERENCE";
    return "MATCH";
  }
  if (legacy && !membershipActive) return "LEGACY_ACTIVE_MEMBERSHIP_INACTIVE";
  if (!legacy && membershipActive) {
    if (legacyGlobal && cast.primaryStoreId !== storeId) return "PRIMARY_STORE_DIFFERENCE";
    return cast.endedOn && date > cast.endedOn ? "REENTRY_DIFFERENCE" : "LEGACY_INACTIVE_MEMBERSHIP_ACTIVE";
  }
  return "STORE_SCOPE_DIFFERENCE";
}

export function summarizeShadowSnapshot(casts: ShadowCast[], stores: ShadowStore[], currentDate: Date) {
  const current = casts.flatMap((cast) => stores.map((store) => ({ cast, store, classification: classifyShadowCell(cast, store.id, currentDate, true) })));
  const differences = current.filter((item) => item.classification !== "MATCH");
  const activeMemberships = casts.flatMap((cast) => cast.memberships.filter((membership) => membership.status === CastMembershipStatus.ACTIVE));
  const onLeaveMemberships = casts.flatMap((cast) => cast.memberships.filter((membership) => membership.status === CastMembershipStatus.ON_LEAVE));
  const leftMemberships = casts.flatMap((cast) => cast.memberships.filter((membership) => membership.status === CastMembershipStatus.LEFT));
  return {
    castTotal: casts.length,
    membershipCastTotal: casts.filter((cast) => cast.memberships.length > 0).length,
    noMembershipCastTotal: casts.filter((cast) => cast.memberships.length === 0).length,
    activeMembershipTotal: activeMemberships.length,
    onLeaveMembershipTotal: onLeaveMemberships.length,
    leftMembershipTotal: leftMemberships.length,
    multiStoreActiveCastTotal: casts.filter((cast) => new Set(cast.memberships.filter((m) => m.status === CastMembershipStatus.ACTIVE).map((m) => m.storeId)).size > 1).length,
    legacyActiveTotal: casts.filter((cast) => cast.status === CastStatus.ACTIVE).length,
    legacyInactiveTotal: casts.filter((cast) => cast.status === CastStatus.INACTIVE).length,
    differences,
    differenceCounts: differences.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.classification]: (counts[item.classification] ?? 0) + 1 }), {}),
  };
}

export function summarizeHistoricalShadow(casts: ShadowCast[], stores: ShadowStore[], from: Date, to: Date) {
  const counts: Record<string, number> = {};
  let cells = 0;
  for (let date = new Date(from); date <= to; date.setUTCDate(date.getUTCDate() + 1)) {
    for (const cast of casts) for (const store of stores) {
      const classification = classifyShadowCell(cast, store.id, date, false);
      counts[classification] = (counts[classification] ?? 0) + 1;
      cells += 1;
    }
  }
  return { from, to, cells, differenceCounts: counts };
}

export async function loadShadowReadData(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const [casts, stores] = await Promise.all([
    db.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, status: true, startedOn: true, endedOn: true, primaryStoreId: true, memberships: { select: { storeId: true, status: true, joinedAt: true, leftAt: true } } } }),
    db.store.findMany({ where: { isActive: true }, select: { id: true, shortName: true }, orderBy: { displayOrder: "asc" } }),
  ]);
  return { casts, stores };
}
