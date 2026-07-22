import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { ImportBatchStatus, ImportDataType, ImportErrorLevel, ImportMode, MediaType } from "@/generated/prisma/client";
import { parseDateOnly } from "@/lib/date";
import { validateCsvUpload } from "@/lib/imports/security";
import { readImportFile, readPreview, saveImportFile, writePreview } from "@/lib/imports/storage";
import { HEAVEN_METRIC_VALUE_KIND, parseHeavenCsvText, type HeavenMetricType, type HeavenParseResult, type HeavenParsedCastRow } from "@/lib/imports/heaven/parser";
import { prisma } from "@/lib/prisma";

type HeavenDb = Pick<typeof prisma, "importBatch">;

const HEAVEN_COMPLETED_STATUSES = [ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS] as const;
const HEAVEN_NON_TERMINAL_STATUSES = [ImportBatchStatus.UPLOADED, ImportBatchStatus.VALIDATING, ImportBatchStatus.PREVIEW_READY, ImportBatchStatus.WAITING_FOR_CAST_LINK, ImportBatchStatus.IMPORTING, ImportBatchStatus.FAILED] as const;
const HEAVEN_DATA_TYPES = [ImportDataType.HEAVEN_STORE, ImportDataType.HEAVEN_CAST] as const;
function isHeavenDataType(value: ImportDataType): value is (typeof HEAVEN_DATA_TYPES)[number] { return HEAVEN_DATA_TYPES.includes(value as (typeof HEAVEN_DATA_TYPES)[number]); }

export type HeavenPreviewRow = HeavenParsedCastRow & { castId: string | null; castDisplayName: string | null; resolutionStatus: "EXACT_ALIAS" | "NORMALIZED_ALIAS" | "EXACT_NAME" | "UNMATCHED" | "AMBIGUOUS" };
export type HeavenPreview = {
  version: 1; batchId: string; runId: string; dataType: "HEAVEN_STORE" | "HEAVEN_CAST";
  storeId: string; storeName: string; metricType: HeavenMetricType; valueKind: string;
  sourcePeriodFrom: string | null; sourcePeriodTo: string | null; encoding: string; delimiter: string; headers: string[];
  shopRows: HeavenParseResult["shopRows"]; castRows: HeavenPreviewRow[]; summaryRows: HeavenParseResult["summaryRows"];
  unmatchedCount: number; unmatchedPeople: number; ambiguousCount: number; errorCount: number; warningCount: number; issues: Array<{ code: string; level: "WARNING" | "ERROR"; message: string }>;
  createdAt: string;
};

export type HeavenDuplicateInfo = {
  duplicateOfBatchId: string;
  duplicateOfStatus: ImportBatchStatus;
  duplicateDetectedAt: string | null;
};

export type HeavenBulkAliasCandidate = {
  normalizedAliasName: string;
  aliasName: string;
  castId: string;
  castDisplayName: string;
  primaryStoreId: string | null;
  castStartedOn: string;
  castEndedOn: string | null;
  townAliasId: string;
  townAliasName: string;
  townAliasValidFrom: string | null;
  townAliasValidTo: string | null;
  plannedValidFrom: string;
  plannedValidTo: string | null;
  targetRows: number;
  reason: "TOWN_ALIAS_UNIQUE_IN_PERIOD";
};

export type HeavenBulkAliasApprovalPreview = {
  batchId: string;
  storeId: string;
  storeName: string;
  status: ImportBatchStatus;
  sourcePeriodFrom: string;
  sourcePeriodTo: string;
  candidateCount: number;
  targetRowCount: number;
  collisionCount: number;
  existingHeavenAliasCount: number;
  changedCandidateCount: number;
  executableCount: number;
  candidates: HeavenBulkAliasCandidate[];
  blockedReasons: string[];
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function findCompletedHeavenDuplicate(db: HeavenDb, input: { fileHash: string; dataType: ImportDataType; storeId: string; excludeBatchId?: string }) {
  return db.importBatch.findFirst({
    where: {
      fileHash: input.fileHash,
      dataType: input.dataType,
      id: input.excludeBatchId ? { not: input.excludeBatchId } : undefined,
      status: { in: [...HEAVEN_COMPLETED_STATUSES] },
      importSource: { storeId: input.storeId },
    },
    orderBy: { completedAt: "desc" },
    select: { id: true, status: true, metadata: true },
  });
}

async function findActiveHeavenDuplicate(db: HeavenDb, input: { fileHash: string; dataType: ImportDataType; storeId: string }) {
  return db.importBatch.findFirst({
    where: {
      fileHash: input.fileHash,
      dataType: input.dataType,
      status: { in: [...HEAVEN_NON_TERMINAL_STATUSES] },
      importSource: { storeId: input.storeId },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
}

export async function getHeavenDuplicateInfo(batchId: string): Promise<HeavenDuplicateInfo | null> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { importSource: true } });
  if (!batch || !isHeavenDataType(batch.dataType)) return null;
  const duplicate = await findCompletedHeavenDuplicate(prisma, { fileHash: batch.fileHash, dataType: batch.dataType, storeId: batch.importSource.storeId || "", excludeBatchId: batchId });
  if (!duplicate) return null;
  const targetMetadata = jsonObject(batch.metadata);
  return { duplicateOfBatchId: duplicate.id, duplicateOfStatus: duplicate.status, duplicateDetectedAt: typeof targetMetadata.duplicateDetectedAt === "string" ? targetMetadata.duplicateDetectedAt : null };
}

export async function cancelDuplicateHeavenBatch(batchId: string, executedBy: string) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.importBatch.findUnique({ where: { id: batchId }, include: { importSource: true } });
    if (!target || !isHeavenDataType(target.dataType)) throw new Error("Heavenバッチが見つかりません。");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`heaven-sha:${target.fileHash}`})) IS NULL AS locked`;
    const duplicate = await findCompletedHeavenDuplicate(tx, { fileHash: target.fileHash, dataType: target.dataType, storeId: target.importSource.storeId || "", excludeBatchId: target.id });
    if (!duplicate) throw new Error("同一SHAの確定済みBatchが見つかりません。状態変更を停止しました。");
    if (target.status === ImportBatchStatus.COMPLETED || target.status === ImportBatchStatus.COMPLETED_WITH_WARNINGS) throw new Error("確定済みBatchは変更できません。");
    const now = new Date().toISOString();
    const base = jsonObject(target.metadata);
    const events = Array.isArray(base.importEvents) ? base.importEvents : [];
    const common = { duplicateBatchId: target.id, duplicateOfBatchId: duplicate.id, sha256: target.fileHash, dataType: target.dataType, storeId: target.importSource.storeId, detectedAt: now, executedBy };
    const metadata = { ...base, terminalReason: "DUPLICATE_COMPLETED", duplicateOfBatchId: duplicate.id, duplicateDetectedAt: now, importEvents: [...events, { type: "HEAVEN_DUPLICATE_DETECTED", ...common }, { type: "HEAVEN_DUPLICATE_CANCELLED", ...common }] };
    await tx.importBatch.update({ where: { id: target.id }, data: { status: ImportBatchStatus.CANCELLED, completedAt: new Date(), failureMessage: null, metadata: JSON.parse(JSON.stringify(metadata)) } });
    return { batchId: target.id, duplicateOfBatchId: duplicate.id, status: ImportBatchStatus.CANCELLED };
  });
}

function inRange(day: string, from: Date | null, to: Date | null) {
  const value = parseDateOnly(day).getTime();
  return (!from || value >= from.getTime()) && (!to || value <= to.getTime());
}

export async function resolveHeavenRows(rows: HeavenParsedCastRow[], storeId: string) {
  const [aliases, casts] = await Promise.all([
    prisma.castAlias.findMany({ where: { mediaType: MediaType.HEAVEN, OR: [{ storeId }, { storeId: null }], cast: { mergedIntoCastId: null } }, include: { cast: true }, orderBy: { storeId: "desc" } }),
    prisma.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, normalizedName: true, startedOn: true, endedOn: true } }),
  ]);
  return rows.map((row) => {
    const matches = aliases.filter((alias) => alias.cast && alias.normalizedAlias === row.normalizedSourceCastName && inRange(row.date, alias.validFrom, alias.validTo) && inRange(row.date, alias.cast.startedOn, alias.cast.endedOn));
    const scoped = matches.filter((alias) => alias.storeId === storeId);
    const chosen = (scoped.length ? scoped : matches).map((alias) => alias.cast!).filter((cast, index, all) => all.findIndex((item) => item.id === cast.id) === index);
    if (chosen.length === 1) return { ...row, castId: chosen[0].id, castDisplayName: chosen[0].displayName, resolutionStatus: scoped.length ? "EXACT_ALIAS" as const : "NORMALIZED_ALIAS" as const };
    if (chosen.length > 1) return { ...row, castId: null, castDisplayName: null, resolutionStatus: "AMBIGUOUS" as const };
    const nameMatches = casts.filter((cast) => cast.normalizedName === row.normalizedSourceCastName && inRange(row.date, cast.startedOn, cast.endedOn));
    if (nameMatches.length === 1) return { ...row, castId: nameMatches[0].id, castDisplayName: nameMatches[0].displayName, resolutionStatus: "EXACT_NAME" as const };
    return { ...row, castId: null, castDisplayName: null, resolutionStatus: nameMatches.length > 1 ? "AMBIGUOUS" as const : "UNMATCHED" as const };
  });
}

function dateText(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

/** Read-only, deterministic preview for the safe Town-Alias based Heaven bulk approval. */
export async function getHeavenBulkAliasApprovalPreview(batchId: string): Promise<HeavenBulkAliasApprovalPreview> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { importSource: { include: { store: true } } } });
  if (!batch || batch.dataType !== ImportDataType.HEAVEN_CAST || !batch.importSource.storeId || !batch.importSource.store) throw new Error("Heaven女子バッチが見つかりません。");
  const preview = await readPreview<HeavenPreview>(batchId);
  const unresolved = preview.castRows.filter((row) => !row.castId && row.resolutionStatus === "UNMATCHED");
  const names = [...new Set(unresolved.map((row) => row.normalizedSourceCastName))];
  const [townAliases, heavenAliases] = await Promise.all([
    prisma.castAlias.findMany({ where: { mediaType: MediaType.TOWN, storeId: batch.importSource.storeId, normalizedAlias: { in: names }, cast: { mergedIntoCastId: null } }, include: { cast: true }, orderBy: { validFrom: "asc" } }),
    prisma.castAlias.findMany({ where: { mediaType: MediaType.HEAVEN, storeId: batch.importSource.storeId, normalizedAlias: { in: names } }, select: { normalizedAlias: true, validFrom: true, castId: true } }),
  ]);
  const candidates: HeavenBulkAliasCandidate[] = [];
  let collisionCount = 0;
  let existingHeavenAliasCount = 0;
  let changedCandidateCount = 0;
  for (const name of names) {
    const targetRows = unresolved.filter((row) => row.normalizedSourceCastName === name);
    const firstDate = targetRows.map((row) => row.date).sort()[0];
    // A Town Alias may have been created after the first Heaven observation. The
    // underlying Cast must cover the whole file period, while the Alias only
    // needs to overlap the target period; the planned Heaven Alias is then
    // explicitly anchored to the file's first date.
    const matches = townAliases.filter((alias) => alias.normalizedAlias === name && alias.cast && targetRows.some((row) => inRange(row.date, alias.validFrom, alias.validTo)) && targetRows.every((row) => inRange(row.date, alias.cast!.startedOn, alias.cast!.endedOn)));
    const uniqueCastIds = [...new Set(matches.map((alias) => alias.castId).filter((id): id is string => Boolean(id)))];
    const existing = heavenAliases.filter((alias) => alias.normalizedAlias === name);
    existingHeavenAliasCount += existing.length;
    if (uniqueCastIds.length !== 1) {
      if (uniqueCastIds.length > 1) collisionCount += 1;
      continue;
    }
    const castId = uniqueCastIds[0];
    const match = matches.find((alias) => alias.castId === castId)!;
    if (existing.some((alias) => alias.castId !== castId)) { collisionCount += 1; continue; }
    if (existing.some((alias) => alias.castId === castId)) changedCandidateCount += 1;
    const cast = match.cast!;
    const plannedValidFrom = firstDate;
    const plannedValidTo = dateText(cast.endedOn);
    candidates.push({ normalizedAliasName: name, aliasName: targetRows[0].sourceCastName, castId, castDisplayName: cast.displayName, primaryStoreId: cast.primaryStoreId, castStartedOn: dateText(cast.startedOn)!, castEndedOn: plannedValidTo, townAliasId: match.id, townAliasName: match.aliasName, townAliasValidFrom: dateText(match.validFrom), townAliasValidTo: dateText(match.validTo), plannedValidFrom, plannedValidTo, targetRows: targetRows.length, reason: "TOWN_ALIAS_UNIQUE_IN_PERIOD" });
  }
  const blockedReasons: string[] = [];
  if (batch.status !== ImportBatchStatus.WAITING_FOR_CAST_LINK) blockedReasons.push("対象BatchがWAITING_FOR_CAST_LINKではありません。");
  if (preview.errorCount || preview.ambiguousCount) blockedReasons.push("ERRORまたは候補複数が存在します。");
  if (collisionCount) blockedReasons.push("Alias衝突があります。");
  const targetRowCount = candidates.reduce((sum, candidate) => sum + candidate.targetRows, 0);
  return { batchId, storeId: batch.importSource.storeId, storeName: batch.importSource.store.shortName, status: batch.status, sourcePeriodFrom: preview.sourcePeriodFrom || "", sourcePeriodTo: preview.sourcePeriodTo || "", candidateCount: candidates.length, targetRowCount, collisionCount, existingHeavenAliasCount, changedCandidateCount, executableCount: blockedReasons.length ? 0 : candidates.length, candidates, blockedReasons };
}

export function validateHeavenParse(result: HeavenParseResult, metricHint?: HeavenMetricType) {
  if (result.kind === "HEAVEN_SHOP") {
    if (metricHint) throw new Error("店舗CSVには女子指標を指定できません。");
    if (!result.shopRows.length || !result.sourcePeriodFrom || !result.sourcePeriodTo) throw new Error("店舗CSVの期間または行を検出できません。");
    return;
  }
  if (result.kind !== "UNKNOWN" || !result.castRows.length) throw new Error("Heaven女子CSVの横持ち構造を検出できません。");
  if (!metricHint || metricHint === "UNKNOWN") throw new Error("女子CSVは指標種別の明示選択が必要です。");
  if (!result.sourcePeriodFrom || !result.sourcePeriodTo) throw new Error("CSVの対象月・日付範囲を検出できません。");
}

export async function createHeavenPreview(input: { file: File; storeId: string; metricHint?: HeavenMetricType; uploadedByUserId: string }) {
  const store = await prisma.store.findFirst({ where: { id: input.storeId, isActive: true, hasAcquisitionMetrics: true } });
  if (!store) throw new Error("Heaven対象店舗を選択してください。");
  const buffer = Buffer.from(await input.file.arrayBuffer());
  validateCsvUpload(input.file, buffer);
  const hash = createHash("sha256").update(buffer).digest("hex");
  const parsed = parseHeavenCsvText(buffer.toString("utf8"), { metricHint: input.metricHint });
  validateHeavenParse(parsed, input.metricHint);
  const dataType = parsed.kind === "HEAVEN_SHOP" ? ImportDataType.HEAVEN_STORE : ImportDataType.HEAVEN_CAST;
  const duplicate = await findCompletedHeavenDuplicate(prisma, { fileHash: hash, dataType, storeId: store.id });
  if (duplicate) {
    const duplicatePreview = await readPreview<HeavenPreview>(duplicate.id);
    return { batchId: duplicate.id, status: duplicate.status, preview: duplicatePreview, reused: true, duplicateOfBatchId: duplicate.id };
  }
  const active = await findActiveHeavenDuplicate(prisma, { fileHash: hash, dataType, storeId: store.id });
  if (active) {
    const activePreview = await readPreview<HeavenPreview>(active.id).catch(() => null);
    if (activePreview) return { batchId: active.id, status: active.status, preview: activePreview, reused: true };
  }
  const runId = randomUUID(); const batchId = randomUUID();
  const metricName = parsed.kind === "HEAVEN_SHOP" ? "SHOP" : parsed.metricType;
  const source = await prisma.importSource.upsert({ where: { name: `HEAVEN_${store.code}_${dataType}_${metricName}` }, update: { isActive: true, metricType: metricName, storeId: store.id }, create: { name: `HEAVEN_${store.code}_${dataType}_${metricName}`, mediaType: MediaType.HEAVEN, dataType, metricType: metricName, storeId: store.id } });
  const { storedFilename } = await saveImportFile(batchId, ".csv", buffer);
  await prisma.importBatch.create({ data: { id: batchId, runId, importSourceId: source.id, originalFilename: path.basename(input.file.name).slice(0, 255), storedFilename, storagePath: storedFilename, fileHash: hash, fileSizeBytes: BigInt(buffer.length), dataType, importMode: ImportMode.MONTHLY_FINAL, targetFrom: parseDateOnly(parsed.sourcePeriodFrom!), targetTo: parseDateOnly(parsed.sourcePeriodTo!), status: ImportBatchStatus.VALIDATING, uploadedByUserId: input.uploadedByUserId, metadata: { metricHint: input.metricHint || null, metricType: parsed.metricType, valueKind: parsed.kind === "HEAVEN_SHOP" ? "DAILY_EVENT" : HEAVEN_METRIC_VALUE_KIND[parsed.metricType as Exclude<HeavenMetricType, "UNKNOWN">], duplicateCompletedBatchId: null } } });
  try {
    const castRows = parsed.kind === "HEAVEN_SHOP" ? [] : await resolveHeavenRows(parsed.castRows, store.id);
    const preview: HeavenPreview = { version: 1, batchId, runId, dataType, storeId: store.id, storeName: store.shortName, metricType: parsed.kind === "HEAVEN_SHOP" ? "UNKNOWN" : parsed.metricType, valueKind: parsed.kind === "HEAVEN_SHOP" ? "DAILY_EVENT" : HEAVEN_METRIC_VALUE_KIND[parsed.metricType as Exclude<HeavenMetricType, "UNKNOWN">], sourcePeriodFrom: parsed.sourcePeriodFrom, sourcePeriodTo: parsed.sourcePeriodTo, encoding: parsed.encoding, delimiter: parsed.delimiter, headers: parsed.headers, shopRows: parsed.shopRows, castRows, summaryRows: parsed.summaryRows, unmatchedCount: castRows.filter((row) => row.resolutionStatus === "UNMATCHED").length, unmatchedPeople: new Set(castRows.filter((row) => row.resolutionStatus === "UNMATCHED").map((row) => row.normalizedSourceCastName)).size, ambiguousCount: castRows.filter((row) => row.resolutionStatus === "AMBIGUOUS").length, errorCount: 0, warningCount: castRows.filter((row) => row.resolutionStatus === "UNMATCHED" || row.resolutionStatus === "AMBIGUOUS").length, issues: [], createdAt: new Date().toISOString() };
    await writePreview(batchId, preview);
    const unresolved = castRows.filter((row) => row.resolutionStatus === "UNMATCHED" || row.resolutionStatus === "AMBIGUOUS");
    if (unresolved.length) await prisma.importError.createMany({ data: unresolved.map((row) => ({ runId, importSourceId: source.id, importBatchId: batchId, fileName: path.basename(input.file.name), fileHash: hash, rowNumber: row.sourceRowNumber, errorCode: row.resolutionStatus === "AMBIGUOUS" ? "AMBIGUOUS_CAST" : "UNMATCHED_CAST", level: ImportErrorLevel.WARNING, message: row.resolutionStatus === "AMBIGUOUS" ? `候補が複数あります: ${row.sourceCastName}` : `キャストを特定できません: ${row.sourceCastName}`, rawData: { sourceCastName: row.sourceCastName, normalizedSourceCastName: row.normalizedSourceCastName } })) });
    const status = unresolved.length ? ImportBatchStatus.WAITING_FOR_CAST_LINK : ImportBatchStatus.PREVIEW_READY;
    await prisma.importBatch.update({ where: { id: batchId }, data: { status, pendingCount: unresolved.length, warningCount: preview.warningCount, errorCount: 0, detectedColumns: { headers: parsed.headers, metricType: preview.metricType, valueKind: preview.valueKind }, metadata: { metricHint: input.metricHint || null, metricType: preview.metricType, valueKind: preview.valueKind, sourcePeriodFrom: parsed.sourcePeriodFrom, sourcePeriodTo: parsed.sourcePeriodTo, duplicateCompletedBatchId: null } } });
    return { batchId, status, preview };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Heaven CSV解析に失敗しました。";
    await prisma.importBatch.update({ where: { id: batchId }, data: { status: ImportBatchStatus.FAILED, failureMessage: message, errorCount: 1 } });
    throw new Error(message);
  }
}

function previewSummary(rows: HeavenPreviewRow[]) {
  const unresolved = rows.filter((r) => r.resolutionStatus === "UNMATCHED" || r.resolutionStatus === "AMBIGUOUS");
  return { pending: unresolved.length, unmatched: rows.filter((r) => r.resolutionStatus === "UNMATCHED").length, ambiguous: rows.filter((r) => r.resolutionStatus === "AMBIGUOUS").length, people: new Set(unresolved.map((r) => r.normalizedSourceCastName)).size };
}

async function replaceHeavenErrors(batch: { id: string; runId: string; importSourceId: string; originalFilename: string; fileHash: string }, preview: HeavenPreview) {
  await prisma.importError.deleteMany({ where: { importBatchId: batch.id, status: "OPEN", errorCode: { in: ["UNMATCHED_CAST", "AMBIGUOUS_CAST"] } } });
  const rows = preview.castRows.filter((r) => r.resolutionStatus === "UNMATCHED" || r.resolutionStatus === "AMBIGUOUS");
  if (!rows.length) return;
  await prisma.importError.createMany({ data: rows.map((row) => ({ runId: batch.runId, importSourceId: batch.importSourceId, importBatchId: batch.id, fileName: batch.originalFilename, fileHash: batch.fileHash, rowNumber: row.sourceRowNumber, errorCode: row.resolutionStatus === "AMBIGUOUS" ? "AMBIGUOUS_CAST" : "UNMATCHED_CAST", level: ImportErrorLevel.WARNING, message: row.resolutionStatus === "AMBIGUOUS" ? `候補が複数あります: ${row.sourceCastName}` : `キャストを特定できません: ${row.sourceCastName}`, rawData: { sourceCastName: row.sourceCastName, normalizedSourceCastName: row.normalizedSourceCastName } })) });
}

export async function reparseHeavenBatch(batchId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { importSource: { include: { store: true } } } });
  const reparsable = new Set<ImportBatchStatus>([ImportBatchStatus.FAILED, ImportBatchStatus.PREVIEW_READY, ImportBatchStatus.WAITING_FOR_CAST_LINK, ImportBatchStatus.COMPLETED_WITH_WARNINGS]);
  if (!batch || !reparsable.has(batch.status)) throw new Error("再解析対象外のバッチです。");
  await prisma.$transaction(async (tx) => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`heaven-reparse:${batchId}`})) IS NULL AS locked`; });
  const buffer = await readImportFile(batch.storagePath);
  const metricHint = typeof (batch.metadata as Record<string, unknown> | null)?.metricHint === "string" ? (batch.metadata as Record<string, unknown>).metricHint as HeavenMetricType : undefined;
  const parsed = parseHeavenCsvText(buffer.toString("utf8"), { metricHint });
  validateHeavenParse(parsed, metricHint);
  const rows = parsed.kind === "HEAVEN_SHOP" ? [] : await resolveHeavenRows(parsed.castRows, batch.importSource.storeId!);
  const old = await readPreview<HeavenPreview>(batch.id).catch(() => null);
  const preview: HeavenPreview = { ...(old || {} as HeavenPreview), version: 1, batchId: batch.id, runId: batch.runId, dataType: parsed.kind === "HEAVEN_SHOP" ? "HEAVEN_STORE" : "HEAVEN_CAST", storeId: batch.importSource.storeId!, storeName: batch.importSource.store?.shortName || "", metricType: parsed.kind === "HEAVEN_SHOP" ? "UNKNOWN" : parsed.metricType, valueKind: parsed.kind === "HEAVEN_SHOP" ? "DAILY_EVENT" : HEAVEN_METRIC_VALUE_KIND[parsed.metricType as Exclude<HeavenMetricType, "UNKNOWN">], sourcePeriodFrom: parsed.sourcePeriodFrom, sourcePeriodTo: parsed.sourcePeriodTo, encoding: parsed.encoding, delimiter: parsed.delimiter, headers: parsed.headers, shopRows: parsed.shopRows, castRows: rows, summaryRows: parsed.summaryRows, ...previewSummary(rows), unmatchedCount: previewSummary(rows).unmatched, unmatchedPeople: previewSummary(rows).people, ambiguousCount: previewSummary(rows).ambiguous, errorCount: 0, warningCount: previewSummary(rows).pending, issues: old?.issues || [], createdAt: new Date().toISOString() };
  await writePreview(batch.id, preview);
  await replaceHeavenErrors(batch, preview);
  const status = preview.unmatchedCount || preview.ambiguousCount ? ImportBatchStatus.WAITING_FOR_CAST_LINK : ImportBatchStatus.PREVIEW_READY;
  const metadata = { ...((batch.metadata && typeof batch.metadata === "object" && !Array.isArray(batch.metadata)) ? batch.metadata as Record<string, unknown> : {}), importEvents: [...(((batch.metadata as Record<string, unknown> | null)?.importEvents as unknown[]) || []), { type: "HEAVEN_REPARSE", at: new Date().toISOString() }] };
  await prisma.importBatch.update({ where: { id: batch.id }, data: { status, pendingCount: preview.unmatchedCount + preview.ambiguousCount, warningCount: preview.warningCount, errorCount: 0, metadata: JSON.parse(JSON.stringify(metadata)) } });
  return { batchId, status, preview };
}

export async function createHeavenAliasAndResolve(input: { batchId: string; normalizedName: string; aliasName: string; castId?: string; newCast?: { displayName: string; primaryStoreId?: string; startedOn: string; notes?: string; reason: string }; executedBy: string }) {
  const batch = await prisma.importBatch.findUnique({ where: { id: input.batchId }, include: { importSource: { include: { store: true } } } });
  if (!batch || batch.dataType !== ImportDataType.HEAVEN_CAST) throw new Error("Heaven女子バッチではありません。");
  const heavenStoreId = batch.importSource.storeId;
  if (!heavenStoreId) throw new Error("店舗が紐付いていないHeavenバッチです。");
  const normalizedName = input.normalizedName?.trim();
  const aliasName = input.aliasName?.trim();
  if (!normalizedName || !aliasName) throw new Error("Alias名と正規化名が必要です。");
  const preview = await readPreview<HeavenPreview>(batch.id); const targetRows = preview.castRows.filter((r) => r.normalizedSourceCastName === normalizedName && (r.resolutionStatus === "UNMATCHED" || r.resolutionStatus === "AMBIGUOUS"));
  if (!targetRows.length) throw new Error("対象未紐付け行がありません。");
  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`heaven-alias:${batch.importSource.storeId}:${normalizedName}`})) IS NULL AS locked`;
    let castId = input.castId;
    let createdCastId: string | null = null;
    if (input.newCast) { if (!input.newCast.reason.trim()) throw new Error("作成理由が必要です。"); const duplicate = await tx.cast.findMany({ where: { normalizedName, mergedIntoCastId: null } }); if (duplicate.length) throw new Error("同名Castが存在するため新規作成を停止しました。"); const cast = await tx.cast.create({ data: { displayName: input.newCast.displayName.trim(), normalizedName, primaryStoreId: input.newCast.primaryStoreId || null, startedOn: parseDateOnly(input.newCast.startedOn), notes: `${input.newCast.notes || ""}\n作成理由: ${input.newCast.reason}` } }); castId = cast.id; createdCastId = cast.id; }
    if (!castId) throw new Error("紐付け先Castを選択してください。");
    const cast = await tx.cast.findUnique({ where: { id: castId } }); if (!cast || cast.mergedIntoCastId) throw new Error("統合済みCastは選択できません。");
    const firstDate = targetRows.map((r) => r.date).sort()[0];
    if (!targetRows.every((row) => inRange(row.date, cast.startedOn, cast.endedOn))) throw new Error("対象期間がCastの在籍期間外です。");
    const aliasConflict = await tx.castAlias.findFirst({ where: { mediaType: MediaType.HEAVEN, storeId: heavenStoreId, normalizedAlias: normalizedName, castId: { not: castId }, validFrom: parseDateOnly(firstDate) } });
    if (aliasConflict) throw new Error("同一店舗・同一Aliasが別Castを指しているため停止しました。");
    const alias = await tx.castAlias.upsert({ where: { mediaType_storeId_normalizedAlias_validFrom: { mediaType: MediaType.HEAVEN, storeId: heavenStoreId, normalizedAlias: normalizedName, validFrom: parseDateOnly(firstDate) } }, create: { mediaType: MediaType.HEAVEN, storeId: heavenStoreId, aliasName, normalizedAlias: normalizedName, castId, validFrom: parseDateOnly(firstDate), validTo: null, reviewStatus: "MAPPED" }, update: { aliasName, castId, reviewStatus: "MAPPED" } });
    return { castId, createdCastId, aliasId: alias.id, targetRows: targetRows.length, batchId: input.batchId };
  });
  const reparsed = await reparseHeavenBatch(input.batchId);
  const remainingRows = reparsed.preview.castRows.filter((row) => row.normalizedSourceCastName === normalizedName && (row.resolutionStatus === "UNMATCHED" || row.resolutionStatus === "AMBIGUOUS")).length;
  const current = await prisma.importBatch.findUnique({ where: { id: input.batchId }, select: { metadata: true } });
  const base = jsonObject(current?.metadata);
  const events = Array.isArray(base.importEvents) ? base.importEvents : [];
  const at = new Date().toISOString();
  const common = { executedBy: input.executedBy, at, castId: created.castId, aliasId: created.aliasId, normalizedName, resolvedRows: created.targetRows };
  const newEvents = input.newCast ? [{ type: "HEAVEN_CAST_CREATED", ...common }, { type: "HEAVEN_ALIAS_CREATED", ...common }] : [{ type: "HEAVEN_ALIAS_CREATED", ...common }];
  await prisma.importBatch.update({ where: { id: input.batchId }, data: { metadata: JSON.parse(JSON.stringify({ ...base, importEvents: [...events, ...newEvents] })) } });
  return { ...created, status: reparsed.status, resolvedRows: created.targetRows - remainingRows, remainingRows, remainingPeople: reparsed.preview.unmatchedPeople, remainingUnmatched: reparsed.preview.unmatchedCount, remainingAmbiguous: reparsed.preview.ambiguousCount };
}

export async function approveHeavenBulkAliases(batchId: string, executedBy: string) {
  const planned = await getHeavenBulkAliasApprovalPreview(batchId);
  if (planned.executableCount !== planned.candidateCount || !planned.candidateCount) throw new Error(planned.blockedReasons.join(" ") || "一括承認対象がありません。");
  const createdAliasIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.findUnique({ where: { id: batchId }, include: { importSource: true } });
    if (!batch || batch.status !== ImportBatchStatus.WAITING_FOR_CAST_LINK || batch.dataType !== ImportDataType.HEAVEN_CAST || !batch.importSource.storeId) throw new Error("実行直前のBatch状態が変化しています。");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`heaven-bulk-alias:${batchId}:${batch.fileHash}`})) IS NULL AS locked`;
    const current = await getHeavenBulkAliasApprovalPreview(batchId);
    if (current.candidateCount !== planned.candidateCount || current.targetRowCount !== planned.targetRowCount || current.collisionCount !== 0) throw new Error("候補が変化したため一括承認を停止しました。再度プレビューしてください。");
    for (const candidate of planned.candidates) {
      const town = await tx.castAlias.findFirst({ where: { id: candidate.townAliasId, mediaType: MediaType.TOWN, storeId: batch.importSource.storeId, normalizedAlias: candidate.normalizedAliasName, castId: candidate.castId, cast: { mergedIntoCastId: null } }, include: { cast: true } });
      if (!town?.cast || !candidate.targetRows || !candidate.castId || town.cast.mergedIntoCastId) throw new Error(`候補の状態が変化しています: ${candidate.aliasName}`);
      const conflict = await tx.castAlias.findFirst({ where: { mediaType: MediaType.HEAVEN, storeId: batch.importSource.storeId, normalizedAlias: candidate.normalizedAliasName, validFrom: parseDateOnly(candidate.plannedValidFrom), castId: { not: candidate.castId } } });
      if (conflict) throw new Error(`Heaven Alias衝突: ${candidate.aliasName}`);
      const alias = await tx.castAlias.upsert({ where: { mediaType_storeId_normalizedAlias_validFrom: { mediaType: MediaType.HEAVEN, storeId: batch.importSource.storeId, normalizedAlias: candidate.normalizedAliasName, validFrom: parseDateOnly(candidate.plannedValidFrom) } }, create: { mediaType: MediaType.HEAVEN, storeId: batch.importSource.storeId, aliasName: candidate.aliasName, normalizedAlias: candidate.normalizedAliasName, castId: candidate.castId, validFrom: parseDateOnly(candidate.plannedValidFrom), validTo: candidate.plannedValidTo ? parseDateOnly(candidate.plannedValidTo) : null, reviewStatus: "MAPPED" }, update: { aliasName: candidate.aliasName, castId: candidate.castId, validTo: candidate.plannedValidTo ? parseDateOnly(candidate.plannedValidTo) : null, reviewStatus: "MAPPED" } });
      createdAliasIds.push(alias.id);
    }
  }, { isolationLevel: "Serializable" });
  const reparsed = await reparseHeavenBatch(batchId);
  const current = await prisma.importBatch.findUnique({ where: { id: batchId }, select: { metadata: true } });
  const base = jsonObject(current?.metadata); const events = Array.isArray(base.importEvents) ? base.importEvents : []; const at = new Date().toISOString();
  const event = { type: "HEAVEN_BULK_ALIAS_APPROVED", batchId, candidateCount: planned.candidateCount, targetRowCount: planned.targetRowCount, aliasIds: createdAliasIds, aliases: planned.candidates.map((candidate) => ({ aliasName: candidate.aliasName, normalizedAliasName: candidate.normalizedAliasName, castId: candidate.castId, reason: candidate.reason })), executedBy, at };
  await prisma.importBatch.update({ where: { id: batchId }, data: { metadata: JSON.parse(JSON.stringify({ ...base, importEvents: [...events, event] })) } });
  return { batchId, createdAliasCount: createdAliasIds.length, resolvedPeople: planned.candidateCount, resolvedRows: planned.targetRowCount, remainingPeople: reparsed.preview.unmatchedPeople, remainingRows: reparsed.preview.unmatchedCount, status: reparsed.status };
}

export async function confirmHeavenImport(batchId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { importSource: true } });
  if (!batch) throw new Error("バッチが見つかりません。");
  const preview = await readPreview<HeavenPreview>(batchId);
  return prisma.$transaction(async (tx) => {
    const currentBatch = await tx.importBatch.findUnique({ where: { id: batchId }, include: { importSource: true } });
    if (!currentBatch) throw new Error("バッチが見つかりません。");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`heaven-sha:${currentBatch.fileHash}`})) IS NULL AS locked`;
    const duplicate = await findCompletedHeavenDuplicate(tx, { fileHash: currentBatch.fileHash, dataType: currentBatch.dataType, storeId: currentBatch.importSource.storeId || "", excludeBatchId: batchId });
    if (duplicate) {
      const now = new Date().toISOString();
      const base = jsonObject(currentBatch.metadata);
      const events = Array.isArray(base.importEvents) ? base.importEvents : [];
      const common = { duplicateBatchId: batchId, duplicateOfBatchId: duplicate.id, sha256: currentBatch.fileHash, dataType: currentBatch.dataType, storeId: currentBatch.importSource.storeId, detectedAt: now, executedBy: "confirm-api" };
      const metadata = { ...base, terminalReason: "DUPLICATE_COMPLETED", duplicateOfBatchId: duplicate.id, duplicateDetectedAt: now, importEvents: [...events, { type: "HEAVEN_DUPLICATE_DETECTED", ...common }, { type: "HEAVEN_DUPLICATE_CANCELLED", ...common }] };
      await tx.importBatch.update({ where: { id: batchId }, data: { status: ImportBatchStatus.CANCELLED, completedAt: new Date(), failureMessage: null, metadata: JSON.parse(JSON.stringify(metadata)) } });
      return { batchId, duplicateOfBatchId: duplicate.id, status: ImportBatchStatus.CANCELLED, cancelled: true, inserted: 0, updated: 0, pending: currentBatch.pendingCount };
    }
    if (currentBatch.status !== ImportBatchStatus.PREVIEW_READY && currentBatch.status !== ImportBatchStatus.WAITING_FOR_CAST_LINK) throw new Error("このバッチは確定できる状態ではありません。");
    let inserted = 0; let updated = 0;
    if (preview.dataType === "HEAVEN_STORE") for (const row of preview.shopRows) { if (row.rawValueStatus !== "VALUE") continue; const date = parseDateOnly(row.date); const where = { businessDate_storeId_metricKey: { businessDate: date, storeId: preview.storeId, metricKey: row.metricKey } }; const existing = await tx.heavenShopDaily.findUnique({ where }); const previous = row.valueKind === "SNAPSHOT" ? await tx.heavenShopDaily.findFirst({ where: { storeId: preview.storeId, metricKey: row.metricKey, businessDate: { lt: date }, rawValueStatus: "VALUE" }, orderBy: { businessDate: "desc" } }) : null; const deltaValue = previous?.rawValue == null ? null : row.rawValue! - Number(previous.rawValue); await tx.heavenShopDaily.upsert({ where, create: { businessDate: date, storeId: preview.storeId, importBatchId: batchId, metricKey: row.metricKey, rawValue: row.rawValue!, valueKind: row.valueKind === "SNAPSHOT" ? "SNAPSHOT" : "DAILY_EVENT", rawValueStatus: row.rawValueStatus, deltaValue, sourceColumn: row.sourceColumn, sourceRowNumber: row.sourceRowNumber }, update: { rawValue: row.rawValue!, valueKind: row.valueKind === "SNAPSHOT" ? "SNAPSHOT" : "DAILY_EVENT", rawValueStatus: row.rawValueStatus, deltaValue, importBatchId: batchId } }); if (existing) updated += 1; else inserted += 1; }
    else for (const row of preview.castRows) { if (!row.castId || row.rawValueStatus !== "VALUE") continue; const date = parseDateOnly(row.date); const resolutionKey = `cast:${row.castId.toLowerCase()}`; const where = { businessDate_storeId_metricKey_resolutionKey: { businessDate: date, storeId: preview.storeId, metricKey: row.metricKey, resolutionKey } }; const existing = await tx.heavenCastDaily.findUnique({ where }); const previous = row.valueKind === "SNAPSHOT" ? await tx.heavenCastDaily.findFirst({ where: { storeId: preview.storeId, metricKey: row.metricKey, resolutionKey, businessDate: { lt: date }, rawValueStatus: "VALUE" }, orderBy: { businessDate: "desc" } }) : null; const deltaValue = previous?.rawValue == null ? null : row.rawValue! - Number(previous.rawValue); await tx.heavenCastDaily.upsert({ where, create: { businessDate: date, storeId: preview.storeId, castId: row.castId, sourceCastName: row.sourceCastName, normalizedSourceCastName: row.normalizedSourceCastName, resolutionKey, importBatchId: batchId, metricKey: row.metricKey, rawValue: row.rawValue!, valueKind: row.valueKind === "SNAPSHOT" ? "SNAPSHOT" : "DAILY_EVENT", rawValueStatus: row.rawValueStatus, deltaValue, sourceColumn: row.sourceColumn, sourceRowNumber: row.sourceRowNumber }, update: { rawValue: row.rawValue!, rawValueStatus: row.rawValueStatus, deltaValue, importBatchId: batchId } }); if (existing) updated += 1; else inserted += 1; }
    const pending = preview.unmatchedCount + preview.ambiguousCount; const current = await tx.importBatch.findUnique({ where: { id: batchId }, select: { metadata: true } }); const base = current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata) ? current.metadata as Record<string, unknown> : {}; await tx.importBatch.update({ where: { id: batchId }, data: { status: pending ? ImportBatchStatus.COMPLETED_WITH_WARNINGS : ImportBatchStatus.COMPLETED, insertedCount: inserted, updatedCount: updated, pendingCount: pending, warningCount: preview.warningCount, metadata: JSON.parse(JSON.stringify({ ...base, importEvents: [...((base.importEvents as unknown[]) || []), { type: "HEAVEN_INITIAL_CONFIRM", at: new Date().toISOString(), inserted, updated, pending } ] })) } }); return { batchId, inserted, updated, pending };
  });
}
