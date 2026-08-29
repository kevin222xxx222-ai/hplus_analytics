import { MediaType, type Cast } from "@/generated/prisma/client";
import type { CtiPreviewRow } from "@/lib/imports/cti/types";
import { normalizeCastName } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { getCastMembershipAsOf, type HistoricalMembershipResult, type MembershipLike } from "@/lib/casts/membership-read";

export type ResolverCast = Pick<Cast, "id" | "displayName" | "startedOn" | "endedOn">;
export type ResolverAlias = {
  aliasName: string;
  normalizedAlias: string;
  storeId: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  cast: ResolverCast | null;
};

function inDateRange(date: Date, from: Date | null, to: Date | null) {
  return (!from || from <= date) && (!to || to >= date);
}

function activeCast(cast: ResolverCast, businessDate: Date) {
  return cast.startedOn <= businessDate && (!cast.endedOn || cast.endedOn >= businessDate);
}

function choose(candidates: Array<{ id: string; displayName: string }>) {
  const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  return unique.length === 1 ? { type: "ONE" as const, cast: unique[0] } : unique.length > 1 ? { type: "MANY" as const } : { type: "NONE" as const };
}

export async function resolvePreviewRows(rows: CtiPreviewRow[], businessDate: Date) {
  const [aliases, casts] = await Promise.all([
    prisma.castAlias.findMany({ where: { mediaType: MediaType.CTI, castId: { not: null }, cast: { mergedIntoCastId: null } }, include: { cast: true } }),
    prisma.cast.findMany({ where: { mergedIntoCastId: null, startedOn: { lte: businessDate }, OR: [{ endedOn: null }, { endedOn: { gte: businessDate } }] } }),
  ]);

  return rows.map((row) => resolvePreviewRow(row, businessDate, aliases, casts));
}

export type CtiHistoricalShadowRow = {
  rowKey: string;
  sourceSheetName: string;
  sourceRowNumber: number;
  castId: string;
  sourceName: string;
  storeId: string;
  datasetDate: Date;
  legacyResult: "RESOLVED";
  membershipHistoricalResult: HistoricalMembershipResult;
  differenceType: "MATCH_MEMBER" | "MATCH_NOT_MEMBER" | "LEGACY_TRUE_MEMBERSHIP_NOT_MEMBER" | "LEGACY_FALSE_MEMBERSHIP_MEMBER" | "MEMBERSHIP_UNKNOWN";
  memberships: MembershipLike[];
};

export async function resolveCtiRowsWithHistoricalShadow(rows: CtiPreviewRow[], businessDate: Date, datasetDate = businessDate) {
  const resolved = await resolvePreviewRows(rows, businessDate);
  const castIds = [...new Set(resolved.flatMap((row) => row.castId ? [row.castId] : []))];
  const casts = await prisma.cast.findMany({ where: { id: { in: castIds } }, select: { id: true, memberships: { select: { storeId: true, status: true, joinedAt: true, leftAt: true } } } });
  const membershipByCast = new Map(casts.map((cast) => [cast.id, cast.memberships]));
  const shadow: CtiHistoricalShadowRow[] = [];
  for (const row of resolved) {
    if (!row.castId || row.resolutionStatus === "SKIPPED" || row.resolutionStatus === "UNMATCHED" || row.resolutionStatus === "AMBIGUOUS") continue;
    const memberships = membershipByCast.get(row.castId) ?? [];
    const membershipHistoricalResult = getCastMembershipAsOf({ memberships, storeId: row.storeId, businessDate });
    const differenceType = membershipHistoricalResult === "UNKNOWN" ? "MEMBERSHIP_UNKNOWN" : membershipHistoricalResult === "MEMBER" ? "MATCH_MEMBER" : "LEGACY_TRUE_MEMBERSHIP_NOT_MEMBER";
    shadow.push({ rowKey: row.rowKey, sourceSheetName: row.sourceSheetName, sourceRowNumber: row.sourceRowNumber, castId: row.castId, sourceName: row.originalCastName, storeId: row.storeId, datasetDate, legacyResult: "RESOLVED", membershipHistoricalResult, differenceType, memberships });
  }
  return { rows: resolved, shadow };
}

export function resolvePreviewRow(row: CtiPreviewRow, businessDate: Date, aliases: ResolverAlias[], casts: ResolverCast[]) {
    if (row.exclusionReason) return { ...row, resolutionStatus: "SKIPPED" as const };
    const validAliases = aliases.filter((alias) => alias.cast && activeCast(alias.cast, businessDate) && inDateRange(businessDate, alias.validFrom, alias.validTo));
    const levels = [
      validAliases.filter((alias) => alias.storeId === row.storeId && alias.aliasName.trim() === row.originalCastName.trim()),
      validAliases.filter((alias) => !alias.storeId && alias.aliasName.trim() === row.originalCastName.trim()),
      validAliases.filter((alias) => alias.storeId === row.storeId && alias.normalizedAlias === row.normalizedCastName),
      validAliases.filter((alias) => !alias.storeId && alias.normalizedAlias === row.normalizedCastName),
    ];
    for (let index = 0; index < levels.length; index += 1) {
      const result = choose(levels[index].flatMap((alias) => alias.cast ? [{ id: alias.cast.id, displayName: alias.cast.displayName }] : []));
      if (result.type === "ONE") return { ...row, castId: result.cast.id, castDisplayName: result.cast.displayName, resolutionStatus: index < 2 ? "EXACT_ALIAS" as const : "NORMALIZED_ALIAS" as const };
      if (result.type === "MANY") return { ...row, resolutionStatus: "AMBIGUOUS" as const, issues: [...row.issues, { code: "AMBIGUOUS_CAST", level: "ERROR" as const, message: "期間内に同じ名前の候補が複数あります。" }] };
    }
    const castResult = choose(casts.filter((cast) => normalizeCastName(cast.displayName) === row.normalizedCastName).map((cast) => ({ id: cast.id, displayName: cast.displayName })));
    if (castResult.type === "ONE") return { ...row, castId: castResult.cast.id, castDisplayName: castResult.cast.displayName, resolutionStatus: "NORMALIZED_CAST" as const };
    if (castResult.type === "MANY") return { ...row, resolutionStatus: "AMBIGUOUS" as const, issues: [...row.issues, { code: "AMBIGUOUS_CAST", level: "ERROR" as const, message: "期間内に同じ正規化名のキャストが複数います。" }] };
    return { ...row, resolutionStatus: "UNMATCHED" as const, issues: [...row.issues, { code: "UNMATCHED_CAST", level: "WARNING" as const, message: "内部キャストへ自動紐付けできないため保留します。" }] };
}
