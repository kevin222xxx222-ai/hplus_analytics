import { MediaType, type Cast } from "@/generated/prisma/client";
import type { TownPreviewRow } from "@/lib/imports/town/types";
import { normalizeCastName } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { resolveTownCastMembershipReadMode, resolveCurrentMembershipRead, summarizeCurrentMembershipShadow, isCastCurrentMember, type CurrentMembershipShadowRow, type MembershipLike, type MembershipReadMode } from "@/lib/casts/membership-read";
import { type TownDatasetSemantics } from "@/lib/imports/town/dataset-semantics";

export type TownResolverCast = Pick<Cast, "id" | "displayName" | "startedOn" | "endedOn"> & { primaryStoreId?: string | null; memberships?: MembershipLike[] };
export type TownResolverAlias = {
  aliasName: string;
  normalizedAlias: string;
  storeId: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  cast: TownResolverCast | null;
};

function inRange(date: Date, from: Date | null, to: Date | null) {
  return (!from || from <= date) && (!to || to >= date);
}

function active(cast: TownResolverCast, date: Date, storeId?: string, mode: MembershipReadMode = "legacy") {
  if (mode === "membership" && storeId && cast.memberships) return isCastCurrentMember({ memberships: cast.memberships, storeId });
  return cast.startedOn <= date && (!cast.endedOn || cast.endedOn >= date);
}

function unique(candidates: Array<{ id: string; displayName: string }>) {
  const values = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  return values.length === 1 ? { type: "ONE" as const, cast: values[0] } : values.length > 1 ? { type: "MANY" as const } : { type: "NONE" as const };
}

function sourceName(row: TownPreviewRow) {
  if (row.kind === "CAST") return { raw: row.originalCastName, normalized: row.normalizedCastName };
  if (row.kind === "URL" || row.kind === "LANDING") return row.sourceCastName && row.normalizedCastName ? { raw: row.sourceCastName, normalized: row.normalizedCastName } : null;
  return null;
}

export function resolveTownPreviewRow(row: TownPreviewRow, storeId: string, businessDate: Date, aliases: TownResolverAlias[], casts: TownResolverCast[], mode: MembershipReadMode = "legacy"): TownPreviewRow {
  if (row.kind === "STORE") return row;
  const name = sourceName(row);
  if (!name) return row;
  const validAliases = aliases.filter((alias) => alias.storeId === storeId && alias.cast && active(alias.cast, businessDate, storeId, mode) && inRange(businessDate, alias.validFrom, alias.validTo));
  const levels = [
    validAliases.filter((alias) => alias.aliasName.trim() === name.raw.trim()),
    validAliases.filter((alias) => alias.normalizedAlias === name.normalized),
  ];
  for (let index = 0; index < levels.length; index += 1) {
    const result = unique(levels[index].flatMap((alias) => alias.cast ? [{ id: alias.cast.id, displayName: alias.cast.displayName }] : []));
    if (result.type === "ONE") return { ...row, castId: result.cast.id, castDisplayName: result.cast.displayName, resolutionStatus: index === 0 ? "EXACT_ALIAS" : "NORMALIZED_ALIAS" };
    if (result.type === "MANY") return { ...row, resolutionStatus: "AMBIGUOUS", issues: [...row.issues, { code: "AMBIGUOUS_CAST", level: "ERROR", message: "対象店舗・期間内のタウンAliasに同名候補が複数あります。" }] };
  }
  const castResult = unique(casts.filter((cast) => active(cast, businessDate, storeId, mode) && normalizeCastName(cast.displayName) === name.normalized).map((cast) => ({ id: cast.id, displayName: cast.displayName })));
  if (castResult.type === "ONE") return { ...row, castId: castResult.cast.id, castDisplayName: castResult.cast.displayName, resolutionStatus: "NORMALIZED_CAST" };
  if (castResult.type === "MANY") return { ...row, resolutionStatus: "AMBIGUOUS", issues: [...row.issues, { code: "AMBIGUOUS_CAST", level: "ERROR", message: "対象日の在籍キャストに同じ正規化名の候補が複数あります。" }] };
  return { ...row, resolutionStatus: "UNMATCHED", issues: [...row.issues, { code: "UNMATCHED_CAST", level: "WARNING", message: row.kind === "CAST" ? "内部キャストへ自動紐付けできないため保留します。" : "キャスト名を内部キャストへ紐付けできませんでした。URL実績はキャスト未設定で取込可能です。" }] };
}

export async function resolveTownPreviewRows(rows: TownPreviewRow[], storeId: string, businessDate: Date, mode: MembershipReadMode = "legacy") {
  const [aliases, casts] = await Promise.all([
    prisma.castAlias.findMany({ where: { mediaType: MediaType.TOWN, storeId, castId: { not: null }, cast: { mergedIntoCastId: null } }, include: { cast: true } }),
    prisma.cast.findMany({ where: { mergedIntoCastId: null, ...(mode === "legacy" ? { startedOn: { lte: businessDate }, OR: [{ endedOn: null }, { endedOn: { gte: businessDate } }] } : {}) }, include: mode === "membership" ? { memberships: { select: { storeId: true, status: true, joinedAt: true, leftAt: true } } } : undefined }),
  ]);
  return rows.map((row) => resolveTownPreviewRow(row, storeId, businessDate, aliases, casts, mode));
}

export type TownResolverShadowSummary = ReturnType<typeof summarizeCurrentMembershipShadow> & {
  resolver: "TOWN_CAST";
  storeId: string;
  evaluated: number;
  examples: CurrentMembershipShadowRow[];
};

export function effectiveTownCastMode(requestedMode: MembershipReadMode, semantics: TownDatasetSemantics): { mode: MembershipReadMode; membershipEligible: boolean; fallbackReason?: string } {
  if (requestedMode === "membership" && semantics !== "current") return { mode: "legacy", membershipEligible: false, fallbackReason: "CURRENT_MEMBERSHIP_REQUIRES_CURRENT_DATASET" };
  return { mode: requestedMode, membershipEligible: requestedMode === "membership" };
}

function townShadowReason(membershipResult: boolean, cast: TownResolverCast, storeId: string): CurrentMembershipShadowRow["reason"] {
  if (membershipResult) return undefined;
  if (cast.memberships?.length === 0) return "MEMBERSHIP_MISSING";
  if (cast.primaryStoreId && cast.primaryStoreId !== storeId) return "EXPECTED_STORE_SCOPE";
  return "OTHER";
}

/**
 * Read-only first Resolver shadow target. It deliberately returns the same
 * resolved rows as the legacy resolver; the membership comparison is an
 * additional aggregate payload for CLI/audit callers.
 */
export async function resolveTownPreviewRowsWithShadow(rows: TownPreviewRow[], storeId: string, businessDate: Date, requestedMode = resolveTownCastMembershipReadMode(), exampleLimit = 20, datasetSemantics: TownDatasetSemantics = "historical"): Promise<{ rows: TownPreviewRow[]; shadow: TownResolverShadowSummary | null }> {
  const effective = effectiveTownCastMode(requestedMode, datasetSemantics);
  const resolved = await resolveTownPreviewRows(rows, storeId, businessDate, requestedMode === "membership" ? effective.mode : "legacy");
  const mode = requestedMode;
  if (mode === "legacy") return { rows: resolved, shadow: null };
  if (mode === "membership" && !effective.membershipEligible) return { rows: resolved, shadow: null };
  const [casts] = await Promise.all([
    prisma.cast.findMany({ where: { id: { in: resolved.flatMap((row) => row.castId ? [row.castId] : []) } }, select: { id: true, displayName: true, startedOn: true, endedOn: true, primaryStoreId: true, memberships: { select: { storeId: true, status: true, joinedAt: true, leftAt: true } } } }),
  ]);
  const byId = new Map(casts.map((cast) => [cast.id, cast]));
  const comparisons: CurrentMembershipShadowRow[] = [];
  for (const row of resolved) {
    if (!row.castId) continue;
    const cast = byId.get(row.castId);
    if (!cast) continue;
    const membershipResult = isCastCurrentMember({ memberships: cast.memberships, storeId });
    const comparison = resolveCurrentMembershipRead({ mode, castId: cast.id, storeId, legacyResult: true, memberships: cast.memberships, reason: townShadowReason(membershipResult, cast, storeId) });
    if (comparison.shadow) comparisons.push(comparison.shadow);
  }
  const summary = summarizeCurrentMembershipShadow(comparisons);
  return { rows: resolved, shadow: { resolver: "TOWN_CAST", storeId, evaluated: comparisons.length, examples: comparisons.slice(0, exampleLimit), ...summary } };
}
