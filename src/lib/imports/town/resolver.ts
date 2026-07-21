import { MediaType, type Cast } from "@/generated/prisma/client";
import type { TownPreviewRow } from "@/lib/imports/town/types";
import { normalizeCastName } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";

export type TownResolverCast = Pick<Cast, "id" | "displayName" | "startedOn" | "endedOn">;
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

function active(cast: TownResolverCast, date: Date) {
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

export function resolveTownPreviewRow(row: TownPreviewRow, storeId: string, businessDate: Date, aliases: TownResolverAlias[], casts: TownResolverCast[]): TownPreviewRow {
  if (row.kind === "STORE") return row;
  const name = sourceName(row);
  if (!name) return row;
  const validAliases = aliases.filter((alias) => alias.storeId === storeId && alias.cast && active(alias.cast, businessDate) && inRange(businessDate, alias.validFrom, alias.validTo));
  const levels = [
    validAliases.filter((alias) => alias.aliasName.trim() === name.raw.trim()),
    validAliases.filter((alias) => alias.normalizedAlias === name.normalized),
  ];
  for (let index = 0; index < levels.length; index += 1) {
    const result = unique(levels[index].flatMap((alias) => alias.cast ? [{ id: alias.cast.id, displayName: alias.cast.displayName }] : []));
    if (result.type === "ONE") return { ...row, castId: result.cast.id, castDisplayName: result.cast.displayName, resolutionStatus: index === 0 ? "EXACT_ALIAS" : "NORMALIZED_ALIAS" };
    if (result.type === "MANY") return { ...row, resolutionStatus: "AMBIGUOUS", issues: [...row.issues, { code: "AMBIGUOUS_CAST", level: "ERROR", message: "対象店舗・期間内のタウンAliasに同名候補が複数あります。" }] };
  }
  const castResult = unique(casts.filter((cast) => active(cast, businessDate) && normalizeCastName(cast.displayName) === name.normalized).map((cast) => ({ id: cast.id, displayName: cast.displayName })));
  if (castResult.type === "ONE") return { ...row, castId: castResult.cast.id, castDisplayName: castResult.cast.displayName, resolutionStatus: "NORMALIZED_CAST" };
  if (castResult.type === "MANY") return { ...row, resolutionStatus: "AMBIGUOUS", issues: [...row.issues, { code: "AMBIGUOUS_CAST", level: "ERROR", message: "対象日の在籍キャストに同じ正規化名の候補が複数あります。" }] };
  return { ...row, resolutionStatus: "UNMATCHED", issues: [...row.issues, { code: "UNMATCHED_CAST", level: "WARNING", message: row.kind === "CAST" ? "内部キャストへ自動紐付けできないため保留します。" : "キャスト名を内部キャストへ紐付けできませんでした。URL実績はキャスト未設定で取込可能です。" }] };
}

export async function resolveTownPreviewRows(rows: TownPreviewRow[], storeId: string, businessDate: Date) {
  const [aliases, casts] = await Promise.all([
    prisma.castAlias.findMany({ where: { mediaType: MediaType.TOWN, storeId, castId: { not: null }, cast: { mergedIntoCastId: null } }, include: { cast: true } }),
    prisma.cast.findMany({ where: { mergedIntoCastId: null, startedOn: { lte: businessDate }, OR: [{ endedOn: null }, { endedOn: { gte: businessDate } }] } }),
  ]);
  return rows.map((row) => resolveTownPreviewRow(row, storeId, businessDate, aliases, casts));
}
