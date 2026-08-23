import { AliasReviewStatus, CastMembershipStatus, CastStatus, MediaType, type Prisma } from "@/generated/prisma/client";

export function canCurrentizeTownCastState(input: {
  status: CastStatus;
  endedOn: Date | null;
  targetDate: Date;
  membershipStatuses: CastMembershipStatus[];
  ignoredAlias: boolean;
}) {
  if (input.endedOn && input.targetDate > input.endedOn) return false;
  if (input.status === CastStatus.INACTIVE && (!input.endedOn || input.targetDate > input.endedOn)) return false;
  if (input.membershipStatuses.length > 0 && input.membershipStatuses.every((status) => status === CastMembershipStatus.LEFT)) return false;
  return !input.ignoredAlias;
}

/** Import facts may be historical; re-entry is an explicit operator action. */
export async function canCurrentizeTownCast(
  tx: Prisma.TransactionClient,
  input: { castId: string; storeId: string; targetDate: Date; normalizedAlias?: string | null },
) {
  const cast = await tx.cast.findUnique({ where: { id: input.castId }, select: { status: true, endedOn: true } });
  if (!cast) return false;
  // Older isolated test databases may predate J0-B. Check catalog first so a
  // missing optional table never aborts the surrounding transaction.
  const [{ tableName }] = await tx.$queryRaw<Array<{ tableName: string | null }>>`SELECT to_regclass('public.cast_store_memberships')::text AS "tableName"`;
  const memberships = tableName
    ? await tx.castStoreMembership.findMany({ where: { castId: input.castId }, select: { status: true } })
    : [];
  if (input.normalizedAlias) {
    const ignored = await tx.castAlias.findFirst({
      where: { castId: input.castId, storeId: input.storeId, mediaType: MediaType.TOWN, normalizedAlias: input.normalizedAlias, reviewStatus: AliasReviewStatus.IGNORED },
      select: { id: true },
    });
    return canCurrentizeTownCastState({ status: cast.status, endedOn: cast.endedOn, targetDate: input.targetDate, membershipStatuses: memberships.map((membership) => membership.status), ignoredAlias: Boolean(ignored) });
  }
  return canCurrentizeTownCastState({ status: cast.status, endedOn: cast.endedOn, targetDate: input.targetDate, membershipStatuses: memberships.map((membership) => membership.status), ignoredAlias: false });
}
