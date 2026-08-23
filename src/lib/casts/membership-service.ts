import { CastMembershipSourceConfidence, CastMembershipStatus, CastStatus, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type MembershipInput = {
  castId: string;
  storeId: string;
  joinedAt?: Date | null;
  leftAt?: Date | null;
  status?: CastMembershipStatus;
  source?: string | null;
  sourceConfidence?: CastMembershipSourceConfidence | null;
  note?: string | null;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
};

export type MembershipDateRange = Pick<MembershipInput, "joinedAt" | "leftAt">;

function dateValue(value: Date | null | undefined) {
  return value ? value.getTime() : null;
}

export function isMembershipActiveOn(membership: MembershipDateRange, businessDate: Date) {
  const date = businessDate.getTime();
  const joined = dateValue(membership.joinedAt);
  const left = dateValue(membership.leftAt);
  return (joined === null || joined <= date) && (left === null || date <= left);
}

export function membershipPeriodsOverlap(left: MembershipDateRange, right: MembershipDateRange) {
  const leftStart = dateValue(left.joinedAt) ?? Number.NEGATIVE_INFINITY;
  const leftEnd = dateValue(left.leftAt) ?? Number.POSITIVE_INFINITY;
  const rightStart = dateValue(right.joinedAt) ?? Number.NEGATIVE_INFINITY;
  const rightEnd = dateValue(right.leftAt) ?? Number.POSITIVE_INFINITY;
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

export function validateMembershipInput(input: Pick<MembershipInput, "joinedAt" | "leftAt" | "status">) {
  const status = input.status ?? CastMembershipStatus.ACTIVE;
  if (input.joinedAt && input.leftAt && input.joinedAt > input.leftAt) {
    throw new Error("在籍開始日は退店日以前にしてください。");
  }
  if (status === CastMembershipStatus.LEFT && !input.leftAt) {
    throw new Error("退店済みMembershipには退店日が必要です。");
  }
  if ((status === CastMembershipStatus.ACTIVE || status === CastMembershipStatus.ON_LEAVE) && input.leftAt) {
    throw new Error("在籍中・休業中Membershipの退店日はNULLにしてください。");
  }
}

export function validateExitDateConsistency(requestedDate: Date, existingDates: Array<Date | null | undefined>) {
  const requested = requestedDate.getTime();
  if (existingDates.some((value) => value && value.getTime() !== requested)) {
    throw new Error("既存の退店日と異なる日付では退店同期を再実行できません。");
  }
}

export function validateExitDatePreflight(exitDate: Date, futureAliasCount: number, futureListingCount: number) {
  if (futureAliasCount || futureListingCount) {
    throw new Error(`退店日より後に開始した媒体履歴があります。Alias ${futureAliasCount}件、MediaListing ${futureListingCount}件の確認が必要です。`);
  }
}

export function classifyMediaRepair(startDate: Date | null, castEndedOn: Date) {
  if (!startDate || startDate.getTime() <= castEndedOn.getTime()) return "NORMAL_CLOSE" as const;
  return "FUTURE_START_CONFLICT" as const;
}

export async function auditCastDateRangeConflicts(db: DbClient = prisma) {
  const [aliases, listings] = await Promise.all([
    db.castAlias.findMany({ where: { validFrom: { not: null }, validTo: { not: null } }, select: { id: true, castId: true, validFrom: true, validTo: true } }),
    db.mediaListing.findMany({ where: { listedFrom: { not: null }, listedTo: { not: null } }, select: { id: true, castId: true, listedFrom: true, listedTo: true } }),
  ]);
  const aliasConflicts = aliases.filter((row) => row.validFrom && row.validTo && row.validTo < row.validFrom);
  const listingConflicts = listings.filter((row) => row.listedFrom && row.listedTo && row.listedTo < row.listedFrom);
  return { aliasCount: aliasConflicts.length, listingCount: listingConflicts.length, aliases: aliasConflicts, listings: listingConflicts };
}

export async function auditCastMediaStateConflicts(db: DbClient = prisma) {
  const [casts, aliases, listings] = await Promise.all([
    db.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, status: true, endedOn: true, memberships: { select: { status: true } } } }),
    db.castAlias.findMany({ where: { castId: { not: null } }, select: { id: true, castId: true, aliasName: true, validFrom: true, validTo: true, reviewStatus: true } }),
    db.mediaListing.findMany({ select: { id: true, castId: true, storeId: true, isListed: true, listedFrom: true, listedTo: true } }),
  ]);
  const castMap = new Map(casts.map((cast) => [cast.id, cast]));
  const range = await auditCastDateRangeConflicts(db);
  const retired = (castId: string) => {
    const cast = castMap.get(castId);
    return Boolean(cast && (cast.status === "INACTIVE" || cast.endedOn));
  };
  const currentAliases = aliases.filter((alias) => alias.castId && retired(alias.castId) && alias.validTo === null && alias.reviewStatus !== "IGNORED");
  const currentListings = listings.filter((listing) => retired(listing.castId) && listing.isListed);
  const allLeftCastIds = new Set(casts.filter((cast) => cast.memberships.length > 0 && cast.memberships.every((membership) => membership.status === "LEFT")).map((cast) => cast.id));
  const allLeftAliases = currentAliases.filter((alias) => alias.castId && allLeftCastIds.has(alias.castId));
  const allLeftListings = currentListings.filter((listing) => allLeftCastIds.has(listing.castId));
  return {
    ...range,
    retiredCurrentAliasCount: currentAliases.length,
    retiredCurrentListingCount: currentListings.length,
    allLeftCurrentAliasCount: allLeftAliases.length,
    allLeftCurrentListingCount: allLeftListings.length,
    retiredCurrentAliases: currentAliases,
    retiredCurrentListings: currentListings,
  };
}

export type LegacyMediaRepairCandidate = {
  castId: string;
  castName: string;
  recordType: "ALIAS" | "MEDIA_LISTING";
  recordId: string;
  storeId: string | null;
  mediaType: string | null;
  startDate: Date | null;
  currentEndDate: Date | null;
  castEndedOn: Date;
  classification: "NORMAL_CLOSE" | "FUTURE_START_CONFLICT";
  repair: Record<string, string | null | boolean>;
};

export async function previewLegacyMediaConflictRepair(db: DbClient = prisma, castIds?: string[]) {
  const [casts, aliases, listings] = await Promise.all([
    db.cast.findMany({ where: { mergedIntoCastId: null, endedOn: { not: null }, ...(castIds?.length ? { id: { in: castIds } } : {}) }, select: { id: true, displayName: true, endedOn: true } }),
    db.castAlias.findMany({ where: { castId: castIds?.length ? { in: castIds } : { not: null } }, select: { id: true, castId: true, storeId: true, mediaType: true, validFrom: true, validTo: true, reviewStatus: true } }),
    db.mediaListing.findMany({ where: { castId: castIds?.length ? { in: castIds } : undefined }, select: { id: true, castId: true, storeId: true, mediaType: true, listedFrom: true, listedTo: true, isListed: true } }),
  ]);
  const castMap = new Map(casts.map((cast) => [cast.id, cast]));
  const result: LegacyMediaRepairCandidate[] = [];
  for (const alias of aliases) {
    const cast = alias.castId ? castMap.get(alias.castId) : undefined;
    if (!cast?.endedOn || alias.reviewStatus === "IGNORED") continue;
    const invalid = Boolean(alias.validFrom && alias.validTo && alias.validTo < alias.validFrom);
    const current = alias.validTo === null;
    if (!invalid && !current) continue;
    const future = Boolean(alias.validFrom && alias.validFrom > cast.endedOn);
    result.push({ castId: cast.id, castName: cast.displayName, recordType: "ALIAS", recordId: alias.id, storeId: alias.storeId, mediaType: alias.mediaType, startDate: alias.validFrom, currentEndDate: alias.validTo, castEndedOn: cast.endedOn, classification: future ? "FUTURE_START_CONFLICT" : "NORMAL_CLOSE", repair: future ? { reviewStatus: "IGNORED", validTo: null } : { reviewStatus: alias.reviewStatus, validTo: cast.endedOn.toISOString().slice(0, 10) } });
  }
  for (const listing of listings) {
    const cast = castMap.get(listing.castId);
    if (!cast?.endedOn) continue;
    const invalid = Boolean(listing.listedFrom && listing.listedTo && listing.listedTo < listing.listedFrom);
    if (!invalid && !listing.isListed) continue;
    const future = Boolean(listing.listedFrom && listing.listedFrom > cast.endedOn);
    result.push({ castId: cast.id, castName: cast.displayName, recordType: "MEDIA_LISTING", recordId: listing.id, storeId: listing.storeId, mediaType: listing.mediaType, startDate: listing.listedFrom, currentEndDate: listing.listedTo, castEndedOn: cast.endedOn, classification: future ? "FUTURE_START_CONFLICT" : "NORMAL_CLOSE", repair: future ? { isListed: false, listedTo: null } : { isListed: false, listedTo: cast.endedOn.toISOString().slice(0, 10) } });
  }
  return result;
}

export async function repairLegacyMediaConflicts(candidates: Array<Pick<LegacyMediaRepairCandidate, "recordType" | "recordId">>, confirmation: string, db: DbClient = prisma) {
  if (confirmation !== "REPAIR") throw new Error("RepairにはREPAIRの明示確認が必要です。");
  const ids = candidates.map((candidate) => candidate.recordId);
  if (!ids.length) return { updated: 0 };
  return db.$transaction(async (tx) => {
    const preview = await previewLegacyMediaConflictRepair(tx);
    const selected = preview.filter((candidate) => candidates.some((input) => input.recordType === candidate.recordType && input.recordId === candidate.recordId));
    const castIds = [...new Set(selected.map((candidate) => candidate.castId))].sort();
    for (const castId of castIds) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cast-media-repair:${castId}`})) IS NULL AS locked`;
    let updated = 0;
    for (const candidate of selected) {
      const castEndedOn = candidate.castEndedOn;
      if (candidate.recordType === "ALIAS") {
        const result = candidate.classification === "FUTURE_START_CONFLICT"
          ? await tx.castAlias.updateMany({ where: { id: candidate.recordId }, data: { reviewStatus: "IGNORED", validTo: null } })
          : await tx.castAlias.updateMany({ where: { id: candidate.recordId, validTo: null }, data: { validTo: castEndedOn } });
        updated += result.count;
      } else {
        const result = candidate.classification === "FUTURE_START_CONFLICT"
          ? await tx.mediaListing.updateMany({ where: { id: candidate.recordId }, data: { isListed: false, listedTo: null } })
          : await tx.mediaListing.updateMany({ where: { id: candidate.recordId, isListed: true }, data: { isListed: false, listedTo: castEndedOn } });
        updated += result.count;
      }
    }
    return { updated };
  });
}

async function lockMembershipScope(db: DbClient, castId: string, storeId: string) {
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cast-membership:${castId}:${storeId}`})) IS NULL AS locked`;
}

async function assertNoOverlap(db: DbClient, input: MembershipDateRange & { castId: string; storeId: string; excludeId?: string }) {
  const existing = await db.castStoreMembership.findMany({
    where: { castId: input.castId, storeId: input.storeId, id: input.excludeId ? { not: input.excludeId } : undefined },
    select: { id: true, joinedAt: true, leftAt: true },
  });
  if (existing.some((membership) => membershipPeriodsOverlap(input, membership))) {
    throw new Error("同一店舗の在籍期間が既存Membershipと重複しています。");
  }
}

export async function listMemberships(castId: string, db: DbClient = prisma) {
  return db.castStoreMembership.findMany({
    where: { castId },
    orderBy: [{ storeId: "asc" }, { joinedAt: "asc" }, { createdAt: "asc" }],
  });
}

export async function getMembershipAsOf(castId: string, storeId: string, date: Date, db: DbClient = prisma) {
  const memberships = await db.castStoreMembership.findMany({
    where: {
      castId,
      storeId,
      AND: [{ OR: [{ joinedAt: null }, { joinedAt: { lte: date } }] }, { OR: [{ leftAt: null }, { leftAt: { gte: date } }] }],
    },
    orderBy: [{ joinedAt: "desc" }, { createdAt: "desc" }],
  });
  if (memberships.length > 1) throw new Error("対象日のMembership期間が重複しています。");
  return memberships[0] ?? null;
}

export async function createMembership(input: MembershipInput) {
  const status = input.status ?? CastMembershipStatus.ACTIVE;
  validateMembershipInput({ ...input, status });
  return prisma.$transaction(async (tx) => {
    await lockMembershipScope(tx, input.castId, input.storeId);
    await assertNoOverlap(tx, input);
    return tx.castStoreMembership.create({
      data: {
        castId: input.castId,
        storeId: input.storeId,
        joinedAt: input.joinedAt ?? null,
        leftAt: input.leftAt ?? null,
        status,
        source: input.source ?? null,
        sourceConfidence: input.sourceConfidence ?? null,
        note: input.note ?? null,
        createdByUserId: input.createdByUserId ?? null,
        updatedByUserId: input.updatedByUserId ?? input.createdByUserId ?? null,
      },
    });
  });
}

export async function initializeCurrentMemberships(inputs: MembershipInput[]) {
  return prisma.$transaction(async (tx) => {
    const created: string[] = [];
    for (const input of inputs) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cast-membership:${input.castId}:${input.storeId}`})) IS NULL AS locked`;
      const existing = await tx.castStoreMembership.findMany({ where: { castId: input.castId, storeId: input.storeId }, select: { status: true } });
      if (existing.length) continue;
      validateMembershipInput({ ...input, status: input.status ?? CastMembershipStatus.ACTIVE });
      const row = await tx.castStoreMembership.create({ data: { castId: input.castId, storeId: input.storeId, joinedAt: null, leftAt: null, status: CastMembershipStatus.ACTIVE, source: input.source ?? "MEDIA_EVIDENCE_BACKFILL", sourceConfidence: input.sourceConfidence ?? CastMembershipSourceConfidence.CONFIRMED, createdByUserId: input.createdByUserId ?? null, updatedByUserId: input.updatedByUserId ?? input.createdByUserId ?? null } });
      created.push(row.id);
    }
    return created;
  });
}

export async function exitCast(castId: string, leftAt: Date, updatedByUserId?: string | null) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cast-exit:${castId}`})) IS NULL AS locked`;
    const cast = await tx.cast.findFirst({ where: { id: castId, mergedIntoCastId: null }, select: { id: true, status: true, endedOn: true } });
    if (!cast) throw new Error("キャストが見つかりません。");
    const [memberships, aliases, listings] = await Promise.all([
      tx.castStoreMembership.findMany({ where: { castId }, select: { id: true, status: true, leftAt: true } }),
      tx.castAlias.findMany({ where: { castId, validTo: null }, select: { validFrom: true } }),
      tx.mediaListing.findMany({ where: { castId, isListed: true }, select: { listedFrom: true, listedTo: true } }),
    ]);
    validateExitDateConsistency(leftAt, [cast.endedOn, ...memberships.filter((membership) => membership.status === CastMembershipStatus.LEFT).map((membership) => membership.leftAt)]);
    validateExitDatePreflight(leftAt, aliases.filter((alias) => alias.validFrom && alias.validFrom > leftAt).length, listings.filter((listing) => listing.listedFrom && listing.listedFrom > leftAt).length);
    const openMemberships = memberships.filter((membership) => membership.status === CastMembershipStatus.ACTIVE || membership.status === CastMembershipStatus.ON_LEAVE);
    await tx.castStoreMembership.updateMany({ where: { id: { in: openMemberships.map((membership) => membership.id) } }, data: { status: CastMembershipStatus.LEFT, leftAt, updatedByUserId: updatedByUserId ?? null } });
    await tx.castAlias.updateMany({ where: { castId, validTo: null }, data: { validTo: leftAt } });
    await tx.mediaListing.updateMany({ where: { castId, isListed: true, listedTo: null }, data: { isListed: false, listedTo: leftAt } });
    await tx.mediaListing.updateMany({ where: { castId, isListed: true, listedTo: { not: null } }, data: { isListed: false } });
    return tx.cast.update({ where: { id: castId }, data: { status: CastStatus.INACTIVE, endedOn: leftAt } });
  });
}

export async function updateMembership(id: string, input: Omit<MembershipInput, "castId" | "storeId"> & { castId?: string; storeId?: string }) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.castStoreMembership.findUnique({ where: { id } });
    if (!current) throw new Error("Membershipが見つかりません。");
    const next = {
      castId: input.castId ?? current.castId,
      storeId: input.storeId ?? current.storeId,
      joinedAt: input.joinedAt === undefined ? current.joinedAt : input.joinedAt,
      leftAt: input.leftAt === undefined ? current.leftAt : input.leftAt,
      status: input.status ?? current.status,
    };
    validateMembershipInput(next);
    await lockMembershipScope(tx, next.castId, next.storeId);
    await assertNoOverlap(tx, { ...next, excludeId: id });
    return tx.castStoreMembership.update({
      where: { id },
      data: {
        castId: next.castId,
        storeId: next.storeId,
        joinedAt: next.joinedAt,
        leftAt: next.leftAt,
        status: next.status,
        source: input.source === undefined ? current.source : input.source,
        sourceConfidence: input.sourceConfidence === undefined ? current.sourceConfidence : input.sourceConfidence,
        note: input.note === undefined ? current.note : input.note,
        updatedByUserId: input.updatedByUserId ?? current.updatedByUserId,
      },
    });
  });
}

export async function closeMembership(id: string, leftAt: Date, updatedByUserId?: string | null) {
  return updateMembership(id, { leftAt, status: CastMembershipStatus.LEFT, updatedByUserId });
}

export async function createReentryMembership(input: Omit<MembershipInput, "status">) {
  return createMembership({ ...input, status: CastMembershipStatus.ACTIVE });
}

export async function setOnLeave(id: string, updatedByUserId?: string | null) {
  return updateMembership(id, { status: CastMembershipStatus.ON_LEAVE, updatedByUserId });
}

export async function resumeFromLeave(id: string, updatedByUserId?: string | null) {
  return updateMembership(id, { status: CastMembershipStatus.ACTIVE, updatedByUserId });
}
