import { CastMembershipSourceConfidence, CastMembershipStatus, type Prisma } from "@/generated/prisma/client";
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
