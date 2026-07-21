import { createHash } from "node:crypto";
import { MediaType, type Prisma } from "@/generated/prisma/client";
import { formatDateOnly, parseDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export type AliasMediaScope = MediaType | "ALL";

export type StartDateBulkInput = {
  castIds: string[];
  targetDate: string;
  mediaScope: AliasMediaScope;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

type Conflict = {
  code: "MERGED_CAST" | "CAST_NOT_FOUND" | "AFTER_ENDED_ON" | "UNIQUE_KEY_COLLISION" | "DIFFERENT_CAST_PERIOD_OVERLAP";
  message: string;
  castId?: string;
  aliasId?: string;
  conflictingAliasId?: string;
};

function aliasKey(alias: { mediaType: MediaType; storeId: string | null; normalizedAlias: string }, validFrom: Date) {
  return `${alias.mediaType}:${alias.storeId || "NULL"}:${alias.normalizedAlias}:${formatDateOnly(validFrom)}`;
}

function sameStore(left: string | null, right: string | null) {
  return left === right;
}

function overlaps(from: Date, to: Date, otherFrom: Date | null, otherTo: Date | null) {
  return (!otherFrom || otherFrom <= to) && (!otherTo || otherTo >= from);
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)].sort();
}

export async function buildCastStartDateBulkPreview(input: StartDateBulkInput, db: DbClient = prisma) {
  const castIds = uniqueIds(input.castIds);
  if (castIds.length === 0) throw new Error("対象キャストを1名以上選択してください。");
  if (!["ALL", ...Object.values(MediaType)].includes(input.mediaScope)) throw new Error("対象Aliasの指定が不正です。");
  const targetDate = parseDateOnly(input.targetDate);
  const mediaTypes = input.mediaScope === "ALL" ? Object.values(MediaType) : [input.mediaScope];

  const [casts, allAliases] = await Promise.all([
    db.cast.findMany({
      where: { id: { in: castIds } },
      include: {
        primaryStore: { select: { shortName: true } },
        aliases: {
          where: { mediaType: { in: mediaTypes } },
          include: { store: { select: { shortName: true } } },
          orderBy: [{ mediaType: "asc" }, { storeId: "asc" }, { normalizedAlias: "asc" }, { validFrom: "asc" }],
        },
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
    }),
    db.castAlias.findMany({
      where: { mediaType: { in: mediaTypes } },
      select: { id: true, mediaType: true, storeId: true, normalizedAlias: true, aliasName: true, castId: true, validFrom: true, validTo: true },
    }),
  ]);

  const conflicts: Conflict[] = [];
  const found = new Set(casts.map((cast) => cast.id));
  for (const castId of castIds) if (!found.has(castId)) conflicts.push({ code: "CAST_NOT_FOUND", castId, message: `キャスト ${castId} が見つかりません。` });

  const castChanges = casts.flatMap((cast) => {
    if (cast.mergedIntoCastId) {
      conflicts.push({ code: "MERGED_CAST", castId: cast.id, message: `${cast.displayName}は統合済みsourceCastのため対象外です。` });
      return [];
    }
    if (cast.endedOn && targetDate > cast.endedOn) {
      conflicts.push({ code: "AFTER_ENDED_ON", castId: cast.id, message: `${cast.displayName}の一括開始日が退店日より後です。` });
    }
    if (targetDate >= cast.startedOn) return [];
    return [{
      castId: cast.id,
      displayName: cast.displayName,
      primaryStoreName: cast.primaryStore?.shortName || null,
      beforeStartedOn: formatDateOnly(cast.startedOn),
      afterStartedOn: input.targetDate,
      endedOn: cast.endedOn ? formatDateOnly(cast.endedOn) : null,
      caution: "実際の入店日が一括開始日より後でないことを確認してください。",
    }];
  });

  const selectedAliases = casts.flatMap((cast) => cast.mergedIntoCastId ? [] : cast.aliases.map((alias) => ({ cast, alias })));
  const aliasChanges = selectedAliases.flatMap(({ cast, alias }) => {
    if (!alias.validFrom || targetDate >= alias.validFrom) return [];
    return [{
      aliasId: alias.id,
      castId: cast.id,
      castName: cast.displayName,
      mediaType: alias.mediaType,
      storeName: alias.store?.shortName || null,
      storeId: alias.storeId,
      aliasName: alias.aliasName,
      normalizedAlias: alias.normalizedAlias,
      beforeValidFrom: formatDateOnly(alias.validFrom),
      afterValidFrom: input.targetDate,
      validTo: alias.validTo ? formatDateOnly(alias.validTo) : null,
    }];
  });

  const changingAliasIds = new Set(aliasChanges.map((change) => change.aliasId));
  const proposedKeys = new Map<string, string[]>();
  for (const change of aliasChanges) {
    const key = aliasKey(change, targetDate);
    proposedKeys.set(key, [...(proposedKeys.get(key) || []), change.aliasId]);
  }
  for (const [key, ids] of proposedKeys) {
    if (ids.length > 1) conflicts.push({ code: "UNIQUE_KEY_COLLISION", aliasId: ids[0], conflictingAliasId: ids[1], message: `変更対象Alias同士で一意キーが衝突します（${key}）。` });
  }

  for (const change of aliasChanges) {
    const current = allAliases.find((alias) => alias.id === change.aliasId);
    if (!current?.validFrom) continue;
    const extensionEnd = new Date(current.validFrom.getTime() - 86_400_000);
    for (const other of allAliases) {
      if (other.id === current.id || changingAliasIds.has(other.id)) continue;
      if (other.mediaType !== current.mediaType || !sameStore(other.storeId, current.storeId) || other.normalizedAlias !== current.normalizedAlias) continue;
      if (other.validFrom && other.validFrom.getTime() === targetDate.getTime()) {
        conflicts.push({ code: "UNIQUE_KEY_COLLISION", aliasId: current.id, conflictingAliasId: other.id, message: `${change.castName}「${change.aliasName}」は変更後の開始日で既存Aliasと一意キーが衝突します。` });
      }
      if (other.castId !== current.castId && overlaps(targetDate, extensionEnd, other.validFrom, other.validTo)) {
        conflicts.push({ code: "DIFFERENT_CAST_PERIOD_OVERLAP", aliasId: current.id, conflictingAliasId: other.id, message: `${change.castName}「${change.aliasName}」の前倒し区間に、別キャストを指す同名Aliasがあります。` });
      }
    }
  }

  const stable = {
    castIds,
    targetDate: input.targetDate,
    mediaScope: input.mediaScope,
    castChanges: castChanges.map((change) => ({
      castId: change.castId,
      displayName: change.displayName,
      primaryStoreName: change.primaryStoreName,
      beforeStartedOn: change.beforeStartedOn,
      afterStartedOn: change.afterStartedOn,
      endedOn: change.endedOn,
    })),
    aliasChanges,
    conflicts: conflicts.map((conflict) => ({ code: conflict.code, castId: conflict.castId, aliasId: conflict.aliasId, conflictingAliasId: conflict.conflictingAliasId })),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(stable)).digest("hex");

  return {
    ...stable,
    fingerprint,
    canExecute: conflicts.length === 0 && (castChanges.length > 0 || aliasChanges.length > 0),
    conflicts,
    casts: casts.map((cast) => ({
      castId: cast.id,
      displayName: cast.displayName,
      primaryStoreName: cast.primaryStore?.shortName || null,
      currentStartedOn: formatDateOnly(cast.startedOn),
      changedStartedOn: targetDate < cast.startedOn ? input.targetDate : formatDateOnly(cast.startedOn),
      endedOn: cast.endedOn ? formatDateOnly(cast.endedOn) : null,
      aliases: cast.aliases.map((alias) => ({
        id: alias.id,
        mediaType: alias.mediaType,
        storeName: alias.store?.shortName || null,
        aliasName: alias.aliasName,
        currentValidFrom: alias.validFrom ? formatDateOnly(alias.validFrom) : null,
        changedValidFrom: alias.validFrom && targetDate < alias.validFrom ? input.targetDate : alias.validFrom ? formatDateOnly(alias.validFrom) : null,
        validTo: alias.validTo ? formatDateOnly(alias.validTo) : null,
      })),
    })),
  };
}

export async function executeCastStartDateBulkChange(input: StartDateBulkInput & {
  expectedFingerprint: string;
  changedByUserId: string;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("実行理由を入力してください。");

  return prisma.$transaction(async (tx) => {
    const preview = await buildCastStartDateBulkPreview(input, tx);
    if (preview.fingerprint !== input.expectedFingerprint) throw new Error("プレビュー後に対象データが変更されました。再度プレビューしてください。");
    if (!preview.canExecute) throw new Error(preview.conflicts[0]?.message || "変更対象がありません。");
    const targetDate = parseDateOnly(input.targetDate);

    for (const change of preview.castChanges) {
      await tx.cast.update({ where: { id: change.castId }, data: { startedOn: targetDate } });
    }
    for (const change of preview.aliasChanges) {
      await tx.castAlias.update({ where: { id: change.aliasId }, data: { validFrom: targetDate } });
    }
    const history = await tx.castStartDateBulkChangeHistory.create({ data: {
      targetDate,
      mediaScope: input.mediaScope,
      castChanges: preview.castChanges,
      aliasChanges: preview.aliasChanges,
      castCount: preview.castChanges.length,
      aliasCount: preview.aliasChanges.length,
      changedByUserId: input.changedByUserId,
      reason,
    } });
    return { historyId: history.id, castCount: preview.castChanges.length, aliasCount: preview.aliasChanges.length };
  }, { isolationLevel: "Serializable" });
}
