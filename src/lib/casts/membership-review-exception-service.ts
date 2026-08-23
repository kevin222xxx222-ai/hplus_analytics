import { CastMembershipReviewClassification, CastMembershipStatus, type Prisma } from "@/generated/prisma/client";
import { loadGapApplyPreview } from "@/lib/casts/membership-gap-audit";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type MembershipReviewSnapshot = {
  townCurrent: boolean;
  townDatasetDate: Date | null;
  townBatchId: string | null;
  ctiCurrent: boolean;
  ctiDatasetDate: Date | null;
  ctiBatchId: string | null;
  aliasEvidence: boolean;
  mediaListingEvidence: boolean;
  legacyStatus: string;
  legacyEndedOn: Date | null;
  membershipStatuses: string[];
};

export async function createExpectedNonRegularReview(input: { castId: string; storeId: string; reason: string; note?: string | null; confirmedByUserId: string }, db: DbClient = prisma) {
  if (!input.reason.trim()) throw new Error("非レギュラー確認の理由は必須です。");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`membership-review:${input.castId}:${input.storeId}`})) IS NULL AS locked`;
    const row = (await loadGapApplyPreview(tx)).find((candidate) => candidate.castId === input.castId && candidate.storeId === input.storeId);
    if (!row) throw new Error("対象Cast×Storeが見つかりません。");
    if (row.existingMembershipStatuses.some((status) => status === CastMembershipStatus.ACTIVE || status === CastMembershipStatus.ON_LEAVE)) throw new Error("既存の在籍Membershipがあるため、非レギュラー例外を登録できません。");
    if (!row.townCurrent && !row.ctiCurrent) throw new Error("Current Town/CTI Evidenceがないため、非レギュラー例外を登録できません。");
    const evidenceSnapshot: MembershipReviewSnapshot = { townCurrent: row.townCurrent, townDatasetDate: row.townLatestDatasetDate, townBatchId: row.townImportBatchId, ctiCurrent: row.ctiCurrent, ctiDatasetDate: row.ctiLatestDatasetDate, ctiBatchId: row.ctiImportBatchId, aliasEvidence: row.aliasEvidence, mediaListingEvidence: row.mediaListingEvidence, legacyStatus: row.legacyStatus, legacyEndedOn: row.legacyEndedOn, membershipStatuses: row.existingMembershipStatuses };
    await tx.castStoreMembershipReview.updateMany({ where: { castId: input.castId, storeId: input.storeId, isActive: true }, data: { isActive: false } });
    return tx.castStoreMembershipReview.create({ data: { castId: input.castId, storeId: input.storeId, classification: CastMembershipReviewClassification.EXPECTED_NON_REGULAR, reason: input.reason.trim(), note: input.note?.trim() || null, evidenceSnapshot: evidenceSnapshot as unknown as Prisma.InputJsonValue, confirmedByUserId: input.confirmedByUserId, confirmedAt: new Date(), isActive: true } });
  });
}

export async function listActiveMembershipReviews(castId?: string, db: DbClient = prisma) {
  return db.castStoreMembershipReview.findMany({ where: { isActive: true, ...(castId ? { castId } : {}) }, include: { cast: { select: { displayName: true } }, store: { select: { shortName: true } } }, orderBy: { updatedAt: "desc" } });
}
