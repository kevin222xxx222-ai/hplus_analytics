import { CastMembershipStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type CurrentRosterCast = { id: string; displayName: string; status: string; primaryStoreId: string | null; memberships: Array<{ storeId: string; status: CastMembershipStatus }> };

/** Store-scoped current roster; intentionally independent of legacy status/primaryStore. */
export async function getCurrentStoreRosterMembership(storeId: string) {
  return prisma.cast.findMany({ where: { mergedIntoCastId: null, memberships: { some: { storeId, status: { in: [CastMembershipStatus.ACTIVE, CastMembershipStatus.ON_LEAVE] } } } }, select: { id: true, displayName: true, status: true, primaryStoreId: true, memberships: { where: { storeId }, select: { storeId: true, status: true } } }, orderBy: { displayName: "asc" } });
}

/** Existing /masters/casts baseline: all non-merged casts, with optional name search. */
export async function getMastersCastsLegacyRoster(query?: string) {
  return prisma.cast.findMany({ where: { mergedIntoCastId: null, ...(query ? { OR: [{ displayName: { contains: query, mode: "insensitive" } }, { aliases: { some: { aliasName: { contains: query, mode: "insensitive" } } } }] } : {}) }, select: { id: true, displayName: true, status: true, primaryStoreId: true }, orderBy: [{ status: "asc" }, { displayName: "asc" }] });
}
