import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { formatDateOnly } from "@/lib/date";
import { normalizeCastName } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;
type PlainRecord = Record<string, unknown>;

const FAR_FUTURE = new Date(8640000000000000);

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
}

function comparable(record: PlainRecord) {
  const omitted = new Set(["id", "castId", "createdAt", "updatedAt"]);
  return Object.fromEntries(Object.entries(plain(record)).filter(([key]) => !omitted.has(key)));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as PlainRecord).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function differences(source: PlainRecord, target: PlainRecord) {
  const left = comparable(source); const right = comparable(target);
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.flatMap((field) => stableStringify(left[field]) === stableStringify(right[field]) ? [] : [{ field, source: left[field] ?? null, target: right[field] ?? null }]);
}

function dateKey(value: Date | null) { return value ? value.toISOString().slice(0, 10) : "NULL"; }

type CollisionDetail = {
  model: string;
  key: string;
  sourceId: string;
  targetId: string;
  identical: boolean;
  differences: Array<{ field: string; source: unknown; target: unknown }>;
};

function findCollisions<T extends { id: string }>(model: string, sourceRows: T[], targetRows: T[], keyOf: (row: T) => string) {
  const targetByKey = new Map(targetRows.map((row) => [keyOf(row), row]));
  const details: CollisionDetail[] = [];
  for (const source of sourceRows) {
    const key = keyOf(source); const target = targetByKey.get(key);
    if (!target) continue;
    const diff = differences(source as PlainRecord, target as PlainRecord);
    details.push({ model, key, sourceId: source.id, targetId: target.id, identical: diff.length === 0, differences: diff });
  }
  return details;
}

function periodOverlaps(left: { startedOn: Date; endedOn: Date | null }, right: { startedOn: Date; endedOn: Date | null }) {
  return left.startedOn <= (right.endedOn || FAR_FUTURE) && right.startedOn <= (left.endedOn || FAR_FUTURE);
}

async function loadState(tx: Tx, sourceCastId: string, targetCastId: string) {
  if (sourceCastId === targetCastId) throw new Error("統合元と統合先に同じキャストは選択できません。");
  const source = await tx.cast.findUnique({ where: { id: sourceCastId }, include: { primaryStore: true, aliases: { include: { store: true }, orderBy: { createdAt: "asc" } }, mediaListings: { include: { store: true }, orderBy: { createdAt: "asc" } }, mergedSources: { select: { id: true } } } });
  const target = await tx.cast.findUnique({ where: { id: targetCastId }, include: { primaryStore: true, aliases: { include: { store: true }, orderBy: { createdAt: "asc" } }, mediaListings: { include: { store: true }, orderBy: { createdAt: "asc" } }, mergedSources: { select: { id: true } } } });
  if (!source || !target) throw new Error("統合対象のキャストが見つかりません。");
  if (source.mergedIntoCastId) throw new Error("統合済みのsourceCastは再統合できません。");
  if (target.mergedIntoCastId) throw new Error("既に別キャストへ統合済みのCastは統合先にできません。");

  const sourceCti = await tx.ctiCastDaily.findMany({ where: { castId: source.id }, orderBy: [{ businessDate: "asc" }, { storeId: "asc" }] });
  const targetCti = await tx.ctiCastDaily.findMany({ where: { castId: target.id }, orderBy: [{ businessDate: "asc" }, { storeId: "asc" }] });
  const sourceTown = await tx.townCastDaily.findMany({ where: { castId: source.id }, orderBy: [{ date: "asc" }, { storeId: "asc" }] });
  const targetTown = await tx.townCastDaily.findMany({ where: { castId: target.id }, orderBy: [{ date: "asc" }, { storeId: "asc" }] });
  const sourceUrl = await tx.townUrlDaily.findMany({ where: { castId: source.id }, orderBy: [{ date: "asc" }, { storeId: "asc" }] });
  const targetUrl = await tx.townUrlDaily.findMany({ where: { castId: target.id }, orderBy: [{ date: "asc" }, { storeId: "asc" }] });
  const sourceLanding = await tx.townLandingDaily.findMany({ where: { castId: source.id }, orderBy: [{ date: "asc" }, { storeId: "asc" }] });
  const targetLanding = await tx.townLandingDaily.findMany({ where: { castId: target.id }, orderBy: [{ date: "asc" }, { storeId: "asc" }] });
  const sourceNameHistories = await tx.castNameHistory.findMany({ where: { castId: source.id }, orderBy: { changedAt: "asc" } });
  const targetNameHistories = await tx.castNameHistory.findMany({ where: { castId: target.id }, orderBy: { changedAt: "asc" } });
  const sourceImprovements = await tx.improvementLog.findMany({ where: { castId: source.id }, orderBy: { createdAt: "asc" } });
  const targetImprovements = await tx.improvementLog.findMany({ where: { castId: target.id }, orderBy: { createdAt: "asc" } });

  return { source, target, sourceCti, targetCti, sourceTown, targetTown, sourceUrl, targetUrl, sourceLanding, targetLanding, sourceNameHistories, targetNameHistories, sourceImprovements, targetImprovements };
}

function naturalName(sourceName: string, targetName: string) {
  const sourceWithoutKuki = sourceName.startsWith("久") ? sourceName.slice(1) : sourceName;
  const targetWithoutKuki = targetName.startsWith("久") ? targetName.slice(1) : targetName;
  if (sourceWithoutKuki === targetWithoutKuki) return sourceWithoutKuki;
  return targetName;
}

async function inspectWithTx(tx: Tx, sourceCastId: string, targetCastId: string) {
  const state = await loadState(tx, sourceCastId, targetCastId);
  const { source, target } = state;
  const ctiCollisions = findCollisions("CtiCastDaily", state.sourceCti, state.targetCti, (row) => `${dateKey(row.businessDate)}:${row.storeId}`);
  const townCollisions = findCollisions("TownCastDaily", state.sourceTown, state.targetTown, (row) => `${dateKey(row.date)}:${row.storeId}`);
  const aliasCollisions = findCollisions("CastAlias", source.aliases, target.aliases, (row) => `${row.mediaType}:${row.storeId || "NULL"}:${row.normalizedAlias}:${dateKey(row.validFrom)}`);
  const listingCollisions = findCollisions("MediaListing", source.mediaListings, target.mediaListings, (row) => `${row.storeId}:${row.mediaType}`);
  const collisions = [...ctiCollisions, ...townCollisions, ...aliasCollisions, ...listingCollisions];
  const blockingConflicts = collisions.filter((item) => !item.identical);
  const exactDuplicates = collisions.filter((item) => item.identical);
  const earliestStartedOn = source.startedOn < target.startedOn ? source.startedOn : target.startedOn;
  const endedOn = !source.endedOn || !target.endedOn ? null : source.endedOn > target.endedOn ? source.endedOn : target.endedOn;
  const recommended = {
    displayName: naturalName(source.displayName, target.displayName),
    primaryStoreId: target.primaryStoreId || source.primaryStoreId,
    primaryStoreName: target.primaryStore?.shortName || source.primaryStore?.shortName || null,
    startedOn: formatDateOnly(earliestStartedOn),
    endedOn: endedOn ? formatDateOnly(endedOn) : null,
    notes: target.notes || source.notes || "",
  };
  const counts = {
    aliases: source.aliases.length,
    mediaListings: source.mediaListings.length,
    cti: state.sourceCti.length,
    townCast: state.sourceTown.length,
    townUrl: state.sourceUrl.length,
    townLanding: state.sourceLanding.length,
    nameHistories: state.sourceNameHistories.length,
    improvementLogs: state.sourceImprovements.length,
    previouslyMergedSources: source.mergedSources.length,
  };
  const fingerprintPayload = plain({
    source: { id: source.id, updatedAt: source.updatedAt, mergedIntoCastId: source.mergedIntoCastId },
    target: { id: target.id, updatedAt: target.updatedAt, mergedIntoCastId: target.mergedIntoCastId },
    rows: [source.aliases, target.aliases, source.mediaListings, target.mediaListings, state.sourceCti, state.targetCti, state.sourceTown, state.targetTown, state.sourceUrl, state.targetUrl, state.sourceLanding, state.targetLanding, state.sourceNameHistories, state.targetNameHistories, state.sourceImprovements, state.targetImprovements],
  });
  const fingerprint = createHash("sha256").update(stableStringify(fingerprintPayload)).digest("hex");
  const summarize = (cast: typeof source, related: { cti: number; town: number; url: number; landing: number; histories: number; improvements: number }) => plain({
    id: cast.id, displayName: cast.displayName, normalizedName: cast.normalizedName, status: cast.status,
    startedOn: formatDateOnly(cast.startedOn), endedOn: cast.endedOn ? formatDateOnly(cast.endedOn) : null,
    primaryStoreId: cast.primaryStoreId, primaryStoreName: cast.primaryStore?.shortName || null, notes: cast.notes,
    createdAt: cast.createdAt, updatedAt: cast.updatedAt,
    aliases: cast.aliases.map((alias) => ({ id: alias.id, mediaType: alias.mediaType, storeId: alias.storeId, storeName: alias.store?.shortName || null, aliasName: alias.aliasName, normalizedAlias: alias.normalizedAlias, validFrom: alias.validFrom ? formatDateOnly(alias.validFrom) : null, validTo: alias.validTo ? formatDateOnly(alias.validTo) : null, reviewStatus: alias.reviewStatus })),
    mediaListings: cast.mediaListings.map((listing) => ({ id: listing.id, mediaType: listing.mediaType, storeId: listing.storeId, storeName: listing.store.shortName, isListed: listing.isListed, listedFrom: listing.listedFrom ? formatDateOnly(listing.listedFrom) : null, listedTo: listing.listedTo ? formatDateOnly(listing.listedTo) : null })),
    counts: related,
  });
  const sourceSummary = summarize(source, { cti: state.sourceCti.length, town: state.sourceTown.length, url: state.sourceUrl.length, landing: state.sourceLanding.length, histories: state.sourceNameHistories.length, improvements: state.sourceImprovements.length });
  const targetSummary = summarize(target, { cti: state.targetCti.length, town: state.targetTown.length, url: state.targetUrl.length, landing: state.targetLanding.length, histories: state.targetNameHistories.length, improvements: state.targetImprovements.length });
  return { state, preview: plain({ source: sourceSummary, target: targetSummary, recommended, counts, collisions, exactDuplicates, blockingConflicts, fingerprint, canMerge: blockingConflicts.length === 0, periodsOverlap: periodOverlaps(source, target) }) };
}

export async function previewCastMerge(sourceCastId: string, targetCastId: string) {
  return prisma.$transaction(async (tx) => (await inspectWithTx(tx, sourceCastId, targetCastId)).preview, { isolationLevel: "RepeatableRead" });
}

export type CastMergeFinalValues = {
  displayName: string;
  primaryStoreId: string | null;
  startedOn: Date;
  endedOn: Date | null;
  notes: string | null;
};

export async function executeCastMerge(input: {
  sourceCastId: string;
  targetCastId: string;
  expectedFingerprint: string;
  finalValues: CastMergeFinalValues;
  mergedByUserId: string;
  reason: string | null;
}) {
  if (input.sourceCastId === input.targetCastId) throw new Error("統合元と統合先に同じキャストは選択できません。");
  const displayName = input.finalValues.displayName.trim();
  const normalizedName = normalizeCastName(displayName);
  if (!normalizedName) throw new Error("統合後の表示名を入力してください。");
  if (input.finalValues.endedOn && input.finalValues.endedOn < input.finalValues.startedOn) throw new Error("在籍終了日は在籍開始日以降にしてください。");

  return prisma.$transaction(async (tx) => {
    const lockIds = [input.sourceCastId, input.targetCastId].sort();
    for (const id of lockIds) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cast-merge:${id}`})) IS NULL AS locked`;
    const { state, preview } = await inspectWithTx(tx, input.sourceCastId, input.targetCastId);
    if (preview.fingerprint !== input.expectedFingerprint) throw new Error("プレビュー後に対象データが変更されました。再プレビューしてください。");
    if (!preview.canMerge) throw new Error("値が異なる一意制約衝突が残っているため統合できません。");
    if (input.finalValues.primaryStoreId) {
      const store = await tx.store.findFirst({ where: { id: input.finalValues.primaryStoreId, isActive: true }, select: { id: true } });
      if (!store) throw new Error("統合後の主所属店舗が無効です。");
    }

    const exactByModel = new Map<string, string[]>();
    for (const item of preview.exactDuplicates) exactByModel.set(item.model, [...(exactByModel.get(item.model) || []), item.sourceId]);
    await tx.ctiCastDaily.deleteMany({ where: { id: { in: exactByModel.get("CtiCastDaily") || [] } } });
    await tx.townCastDaily.deleteMany({ where: { id: { in: exactByModel.get("TownCastDaily") || [] } } });
    await tx.castAlias.deleteMany({ where: { id: { in: exactByModel.get("CastAlias") || [] } } });
    await tx.mediaListing.deleteMany({ where: { id: { in: exactByModel.get("MediaListing") || [] } } });

    await tx.castAlias.updateMany({ where: { castId: state.source.id }, data: { castId: state.target.id } });
    await tx.mediaListing.updateMany({ where: { castId: state.source.id }, data: { castId: state.target.id } });
    await tx.ctiCastDaily.updateMany({ where: { castId: state.source.id }, data: { castId: state.target.id } });
    await tx.townCastDaily.updateMany({ where: { castId: state.source.id }, data: { castId: state.target.id } });
    await tx.townUrlDaily.updateMany({ where: { castId: state.source.id }, data: { castId: state.target.id } });
    await tx.townLandingDaily.updateMany({ where: { castId: state.source.id }, data: { castId: state.target.id } });
    await tx.castNameHistory.updateMany({ where: { castId: state.source.id }, data: { castId: state.target.id } });
    await tx.improvementLog.updateMany({ where: { castId: state.source.id }, data: { castId: state.target.id } });

    if (state.target.displayName !== displayName || state.target.normalizedName !== normalizedName) {
      await tx.castNameHistory.create({ data: { castId: state.target.id, oldName: state.target.displayName, newName: displayName, changedByUserId: input.mergedByUserId, reason: input.reason ? `キャスト統合: ${input.reason}` : "キャスト統合" } });
    }
    await tx.cast.update({ where: { id: state.target.id }, data: { displayName, normalizedName, primaryStoreId: input.finalValues.primaryStoreId, startedOn: input.finalValues.startedOn, endedOn: input.finalValues.endedOn, notes: input.finalValues.notes } });
    const mergedAt = new Date();
    await tx.cast.updateMany({ where: { mergedIntoCastId: state.source.id }, data: { mergedIntoCastId: state.target.id } });
    await tx.cast.update({ where: { id: state.source.id }, data: { mergedIntoCastId: state.target.id, mergedAt } });

    const targetAfter = await tx.cast.findUniqueOrThrow({ where: { id: state.target.id }, include: { primaryStore: true, aliases: { include: { store: true } }, mediaListings: { include: { store: true } }, _count: { select: { ctiCastDailies: true, townCastDailies: true, townUrlDailies: true, townLandingDailies: true, nameHistories: true, improvementLogs: true } } } });
    const conflictSummary = plain({ exactDuplicates: preview.exactDuplicates, blockingConflicts: [], movedCounts: preview.counts, repointedMergedSources: state.source.mergedSources.length }) as Prisma.InputJsonValue;
    const history = await tx.castMergeHistory.create({ data: {
      sourceCastId: state.source.id,
      targetCastId: state.target.id,
      sourceSnapshot: preview.source as Prisma.InputJsonValue,
      targetSnapshotBefore: preview.target as Prisma.InputJsonValue,
      targetSnapshotAfter: plain(targetAfter) as Prisma.InputJsonValue,
      conflictSummary,
      mergedByUserId: input.mergedByUserId,
      mergedAt,
      reason: input.reason,
    } });
    return { historyId: history.id, sourceCastId: state.source.id, targetCastId: state.target.id, mergedAt, conflictSummary };
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
}
