import { CastStatus, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyCastForMembershipBackfill, type BackfillAuditResult } from "@/lib/casts/membership-backfill-audit";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type MembershipEvidenceRow = {
  sourceKind: "CTI" | "TOWN" | "HEAVEN" | "ALIAS" | "MEDIA_LISTING";
  storeId: string | null;
  from: Date | null;
  to: Date | null;
  count: number;
  mediaType?: string;
  isListed?: boolean;
};

export type MembershipReviewCast = BackfillAuditResult & {
  memberships: Array<{
    id: string;
    storeId: string;
    joinedAt: Date | null;
    leftAt: Date | null;
    status: string;
    source: string | null;
    sourceConfidence: string | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  evidenceRows: MembershipEvidenceRow[];
};

export async function loadMembershipReviewCasts(db: DbClient = prisma): Promise<MembershipReviewCast[]> {
  const [casts, aliases, listings, cti, town, heaven] = await Promise.all([
    db.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, status: true, startedOn: true, endedOn: true, primaryStoreId: true, memberships: { orderBy: [{ storeId: "asc" }, { joinedAt: "asc" }], select: { id: true, storeId: true, joinedAt: true, leftAt: true, status: true, source: true, sourceConfidence: true, note: true, createdAt: true, updatedAt: true } } }, orderBy: [{ status: "asc" }, { displayName: "asc" }] }),
    db.castAlias.findMany({ where: { castId: { not: null } }, select: { castId: true, storeId: true, validFrom: true, validTo: true, mediaType: true } }),
    db.mediaListing.findMany({ select: { castId: true, storeId: true, listedFrom: true, listedTo: true, isListed: true, mediaType: true } }),
    db.ctiCastDaily.groupBy({ by: ["castId", "storeId"], _min: { businessDate: true }, _max: { businessDate: true }, _count: { _all: true } }),
    db.townCastDaily.groupBy({ by: ["castId", "storeId"], _min: { date: true }, _max: { date: true }, _count: { _all: true } }),
    db.heavenCastDaily.groupBy({ by: ["castId", "storeId"], where: { castId: { not: null } }, _min: { businessDate: true }, _max: { businessDate: true }, _count: { _all: true } }),
  ]);
  const evidence = new Map<string, MembershipEvidenceRow[]>();
  const add = (castId: string | null, row: MembershipEvidenceRow) => { if (!castId) return; evidence.set(castId, [...(evidence.get(castId) ?? []), row]); };
  for (const row of cti) add(row.castId, { sourceKind: "CTI", storeId: row.storeId, from: row._min.businessDate, to: row._max.businessDate, count: row._count._all });
  for (const row of town) add(row.castId, { sourceKind: "TOWN", storeId: row.storeId, from: row._min.date, to: row._max.date, count: row._count._all });
  for (const row of heaven) add(row.castId, { sourceKind: "HEAVEN", storeId: row.storeId, from: row._min.businessDate, to: row._max.businessDate, count: row._count._all });
  for (const row of aliases) add(row.castId, { sourceKind: "ALIAS", storeId: row.storeId, from: row.validFrom, to: row.validTo, count: 1, mediaType: row.mediaType });
  for (const row of listings) add(row.castId, { sourceKind: "MEDIA_LISTING", storeId: row.storeId, from: row.listedFrom, to: row.listedTo, count: 1, mediaType: row.mediaType, isListed: row.isListed });

  return casts.map((cast) => {
    const rows = evidence.get(cast.id) ?? [];
    const storeIds = [...new Set([cast.primaryStoreId, ...rows.map((row) => row.storeId)].filter((id): id is string => Boolean(id)))];
    const sourceKinds: string[] = [...new Set([...rows.map((row) => row.sourceKind), ...(cast.primaryStoreId ? ["PRIMARY_STORE"] : [])])];
    const audit = classifyCastForMembershipBackfill({ id: cast.id, displayName: cast.displayName, status: cast.status, startedOn: cast.startedOn, endedOn: cast.endedOn, primaryStoreId: cast.primaryStoreId, membershipCount: cast.memberships.length, evidence: { storeIds, sourceKinds, dateRanges: rows.map((row) => ({ sourceKind: row.sourceKind, storeId: row.storeId, from: row.from, to: row.to })) } });
    return { ...audit, memberships: cast.memberships, evidenceRows: rows };
  });
}

export function reviewClassificationLabel(value: string) {
  return ({ MULTI_STORE_EVIDENCE: "複数店舗根拠", DATE_UNCERTAIN: "日付要確認", STORE_UNCERTAIN: "店舗要確認", SAFE_AUTO: "自動候補", SAFE_LEFT: "退店候補", EXISTING_MEMBERSHIP: "対応済み" } as Record<string, string>)[value] ?? value;
}

export function reviewStatusLabel(value: CastStatus) { return value === CastStatus.ACTIVE ? "在籍" : "退店"; }
