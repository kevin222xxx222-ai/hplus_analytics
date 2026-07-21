import { createHash } from "node:crypto";
import { AliasReviewStatus, CastStatus, ImportBatchStatus, MediaType, StoreCode, type Prisma } from "@/generated/prisma/client";
import { formatDateOnly, parseDateOnly } from "@/lib/date";
import { readPreview, writePreview } from "@/lib/imports/storage";
import { persistTownRow, townRowKey } from "@/lib/imports/town/persistence";
import { openUnmatchedRowNumbers, TOWN_RESOLUTION_DATA_TYPES, TOWN_RESOLUTION_STATUSES } from "@/lib/imports/town/resolution-policy";
import type { TownPreview, TownPreviewRow } from "@/lib/imports/town/types";
import type { TownBulkLinkCandidate, TownBulkLinkCastOption, TownBulkLinkCategory, TownBulkLinkCategorySummary, TownBulkLinkCandidateExecuteInput, TownBulkLinkExecuteInput, TownBulkLinkImpactPreview, TownBulkLinkPreview } from "@/lib/imports/town/bulk-link-types";
import { normalizeCastName } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";

type AnalysisDb = Pick<Prisma.TransactionClient, "importBatch" | "cast" | "castAlias" | "castNameHistory" | "ctiCastDaily" | "mediaListing" | "store" | "townCastDaily" | "townUrlDaily" | "townLandingDaily">;
type RowReference = { batchId: string; rowNumber: number; rowKey: string; date: string; kind: TownPreviewRow["kind"]; normalizedUrl: string | null };
type CandidateInternal = TownBulkLinkCandidate & { rows: RowReference[] };
type AnalysisInternal = TownBulkLinkPreview & { internalCandidates: CandidateInternal[] };

const ID_NAME = /^ID[:：]?\d+$/i;

export function classifyTownBulkLinkEvidence(input: {
  idFormat: boolean;
  correction: boolean;
  ambiguous: boolean;
  exactCandidateCount: number;
  knownDifferenceCandidateCount: number;
  townAliasConflict: boolean;
  outsideEnrollmentCandidateCount: number;
  sourceNameKnown: boolean;
}) {
  const totalCandidates = new Set(Array.from({ length: input.exactCandidateCount + input.knownDifferenceCandidateCount }, (_, index) => index)).size;
  if (input.idFormat) return { category: "C" as const, reasonCode: "ID_FORMAT" };
  if (input.correction) return { category: "C" as const, reasonCode: "CORRECTION_CANDIDATE" };
  if (input.ambiguous || totalCandidates > 1) return { category: "C" as const, reasonCode: "MULTIPLE_CANDIDATES" };
  if (input.townAliasConflict) return { category: "C" as const, reasonCode: "TOWN_ALIAS_CONFLICT" };
  if (input.exactCandidateCount === 1) return { category: "A" as const, reasonCode: "EXACT_CTI_EVIDENCE" };
  if (input.knownDifferenceCandidateCount === 1) return { category: "B" as const, reasonCode: "KNOWN_NAME_DIFFERENCE" };
  if (input.outsideEnrollmentCandidateCount > 0) return { category: "C" as const, reasonCode: "OUTSIDE_ENROLLMENT" };
  if (!input.sourceNameKnown) return { category: "C" as const, reasonCode: "UNKNOWN_SOURCE_NAME" };
  return { category: "C" as const, reasonCode: "NO_CANDIDATE" };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function rowName(row: TownPreviewRow) {
  if (row.kind === "CAST") return { raw: row.originalCastName, normalized: row.normalizedCastName };
  if ((row.kind === "URL" || row.kind === "LANDING") && row.sourceCastName && row.normalizedCastName) return { raw: row.sourceCastName, normalized: row.normalizedCastName };
  return null;
}

function inRange(date: Date, from: Date | null, to: Date | null) {
  return (!from || from <= date) && (!to || to >= date);
}

function activeOn(cast: { status: CastStatus; startedOn: Date; endedOn: Date | null }, date: Date) {
  return cast.status === CastStatus.ACTIVE && cast.startedOn <= date && (!cast.endedOn || cast.endedOn >= date);
}

function withoutKukiPrefix(value: string) {
  const normalized = normalizeCastName(value);
  return normalized.startsWith("久") && normalized.length > 1 ? normalized.slice(1) : normalized;
}

function summary(candidates: CandidateInternal[], predicate: (candidate: CandidateInternal) => boolean): TownBulkLinkCategorySummary {
  const values = candidates.filter(predicate);
  return {
    peopleCount: values.length,
    rowCount: values.reduce((sum, value) => sum + value.rowCount, 0),
    batchCount: new Set(values.flatMap((value) => value.batchIds)).size,
  };
}

function fingerprint(candidates: CandidateInternal[]) {
  const source = candidates.map((candidate) => ({
    key: candidate.key,
    category: candidate.category,
    targetCastId: candidate.targetCastId,
    reasonCodes: candidate.reasonCodes,
    rows: candidate.rows.map((row) => `${row.batchId}:${row.rowNumber}:${row.rowKey}`).sort(),
  })).sort((left, right) => left.key.localeCompare(right.key));
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

function correctionIds(metadata: unknown) {
  const townBulk = objectValue(objectValue(metadata).townBulk);
  return stringArray(townBulk.correctionBatchIds);
}

function safeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch { return null; }
}

async function analyzeInternal(db: AnalysisDb): Promise<AnalysisInternal> {
  const batches = await db.importBatch.findMany({
    where: {
      dataType: { in: [...TOWN_RESOLUTION_DATA_TYPES] },
      status: { in: [...TOWN_RESOLUTION_STATUSES] },
      errors: { some: { errorCode: "UNMATCHED_CAST", status: "OPEN" } },
    },
    include: {
      importSource: { include: { store: true } },
      errors: { where: { status: "OPEN" }, select: { rowNumber: true, errorCode: true, level: true, status: true } },
    },
    orderBy: [{ targetFrom: "asc" }, { createdAt: "asc" }],
  });
  const [casts, aliases, histories, ctiStores, ctiPeriods, listings, stores] = await Promise.all([
    db.cast.findMany({
      where: { mergedIntoCastId: null },
      select: { id: true, displayName: true, normalizedName: true, status: true, startedOn: true, endedOn: true, primaryStoreId: true, primaryStore: { select: { shortName: true } } },
    }),
    db.castAlias.findMany({
      where: { mediaType: { in: [MediaType.CTI, MediaType.TOWN] }, castId: { not: null }, cast: { mergedIntoCastId: null } },
      select: { id: true, mediaType: true, aliasName: true, normalizedAlias: true, castId: true, storeId: true, validFrom: true, validTo: true },
    }),
    db.castNameHistory.findMany({ select: { castId: true, oldName: true, newName: true } }),
    db.ctiCastDaily.groupBy({ by: ["castId", "storeId"] }),
    db.ctiCastDaily.groupBy({ by: ["castId"], _min: { businessDate: true }, _max: { businessDate: true } }),
    db.mediaListing.findMany({ where: { mediaType: MediaType.TOWN, cast: { mergedIntoCastId: null } }, select: { castId: true, store: { select: { shortName: true } } } }),
    db.store.findMany({ where: { code: { in: [StoreCode.KASUKABE, StoreCode.KOSHIGAYA, StoreCode.NODA, StoreCode.KUKI] } }, select: { id: true, shortName: true }, orderBy: { displayOrder: "asc" } }),
  ]);

  const aliasesByCast = new Map<string, typeof aliases>();
  for (const alias of aliases) if (alias.castId) aliasesByCast.set(alias.castId, [...(aliasesByCast.get(alias.castId) || []), alias]);
  const historiesByCast = new Map<string, string[]>();
  for (const history of histories) historiesByCast.set(history.castId, [...(historiesByCast.get(history.castId) || []), history.oldName, history.newName]);
  const ctiStoresByCast = new Map<string, Set<string>>();
  for (const record of ctiStores) ctiStoresByCast.set(record.castId, new Set([...(ctiStoresByCast.get(record.castId) || []), record.storeId]));

  const ctiPeriodByCast = new Map(ctiPeriods.map((period) => [period.castId, period]));
  const listingsByCast = new Map<string, Set<string>>();
  for (const listing of listings) listingsByCast.set(listing.castId, new Set([...(listingsByCast.get(listing.castId) || []), listing.store.shortName]));
  const castOptions: TownBulkLinkCastOption[] = casts.map((cast) => {
    const castAliases = aliasesByCast.get(cast.id) || [];
    const period = ctiPeriodByCast.get(cast.id);
    return {
      id: cast.id, displayName: cast.displayName, normalizedName: cast.normalizedName,
      primaryStoreId: cast.primaryStoreId, primaryStoreName: cast.primaryStore?.shortName || null,
      startedOn: formatDateOnly(cast.startedOn), endedOn: cast.endedOn ? formatDateOnly(cast.endedOn) : null,
      ctiAliases: [...new Set(castAliases.filter((alias) => alias.mediaType === MediaType.CTI).map((alias) => alias.aliasName))].sort(),
      townAliases: [...new Set(castAliases.filter((alias) => alias.mediaType === MediaType.TOWN).map((alias) => alias.aliasName))].sort(),
      ctiFrom: period?._min.businessDate ? formatDateOnly(period._min.businessDate) : null,
      ctiTo: period?._max.businessDate ? formatDateOnly(period._max.businessDate) : null,
      townListingStores: [...(listingsByCast.get(cast.id) || [])].sort(),
    };
  }).sort((left, right) => left.displayName.localeCompare(right.displayName, "ja"));

  type Group = {
    key: string; storeId: string; storeName: string; normalizedName: string; rawNames: Set<string>;
    dates: Set<string>; rows: RowReference[]; batchIds: Set<string>; sourceUrls: Set<string>; correction: boolean; ambiguous: boolean;
  };
  const groups = new Map<string, Group>();
  const waitingBatchIds = new Set<string>();
  const unconfirmedBatchIds = new Set<string>();
  const batchOpenErrors = new Map<string, Array<{ rowNumber: number | null; errorCode: string; level: string }>>();
  const batchCorrections = new Map<string, boolean>();

  for (const batch of batches) {
    if (batch.status === ImportBatchStatus.WAITING_FOR_CAST_LINK) waitingBatchIds.add(batch.id);
    if (batch.status === ImportBatchStatus.WAITING_FOR_CAST_LINK || batch.status === ImportBatchStatus.PREVIEW_READY) unconfirmedBatchIds.add(batch.id);
    batchOpenErrors.set(batch.id, batch.errors);
    const isCorrection = correctionIds(batch.metadata).length > 0;
    batchCorrections.set(batch.id, isCorrection);
    let preview: TownPreview;
    try { preview = await readPreview<TownPreview>(batch.id); } catch {
      throw new Error(`Townバッチ ${batch.id} のpreviewを読み込めません。候補解析を停止しました。`);
    }
    const openRows = openUnmatchedRowNumbers(batch.errors);
    for (const row of preview.rows) {
      if (row.kind === "STORE" || row.castId !== null || row.resolutionStatus === "SKIPPED" || !openRows.has(row.sourceRowNumber)) continue;
      const name = rowName(row);
      const normalized = name?.normalized || `__UNKNOWN__:${batch.id}:${row.sourceRowNumber}`;
      const key = `${preview.storeId}:${normalized}`;
      const current = groups.get(key) || {
        key, storeId: preview.storeId, storeName: preview.storeName, normalizedName: normalized,
        rawNames: new Set<string>(), dates: new Set<string>(), rows: [], batchIds: new Set<string>(), sourceUrls: new Set<string>(),
        correction: false, ambiguous: false,
      };
      if (name?.raw) current.rawNames.add(name.raw);
      current.dates.add(row.date);
      const normalizedUrl = row.kind === "URL" || row.kind === "LANDING" ? row.normalizedUrl : null;
      current.rows.push({ batchId: batch.id, rowNumber: row.sourceRowNumber, rowKey: row.rowKey, date: row.date, kind: row.kind, normalizedUrl });
      if (row.kind === "URL") { const url = safeSourceUrl(row.url); if (url) current.sourceUrls.add(url); }
      if (row.kind === "LANDING") { const url = safeSourceUrl(row.landingUrl); if (url) current.sourceUrls.add(url); }
      current.batchIds.add(batch.id);
      current.correction ||= isCorrection || preview.globalIssues.some((issue) => issue.code === "BULK_CORRECTION_CANDIDATE");
      current.ambiguous ||= row.resolutionStatus === "AMBIGUOUS";
      groups.set(key, current);
    }
  }

  const candidates: CandidateInternal[] = [];
  for (const group of groups.values()) {
    const dates = [...group.dates].sort();
    const dateValues = dates.map(parseDateOnly);
    const townNames = [...group.rawNames].sort();
    const displayTownName = townNames[0] || "人物名不明";
    const normalizedNames = new Set([group.normalizedName, ...townNames.map(normalizeCastName)]);
    const strippedNames = new Set([...normalizedNames].map(withoutKukiPrefix));
    const exactMatches = new Map<string, { cast: typeof casts[number]; reasons: string[] }>();
    const knownDifferenceMatches = new Map<string, { cast: typeof casts[number]; reasons: string[] }>();
    const outOfRangeMatches = new Set<string>();

    for (const cast of casts) {
      const castAliases = aliasesByCast.get(cast.id) || [];
      const ctiAliases = castAliases.filter((alias) => alias.mediaType === MediaType.CTI && alias.storeId === group.storeId);
      const sameStoreEvidence = ctiAliases.length > 0 || ctiStoresByCast.get(cast.id)?.has(group.storeId);
      if (!sameStoreEvidence) continue;
      const displayNormalized = normalizeCastName(cast.displayName);
      const aliasExactForAllDates = ctiAliases.some((alias) => normalizedNames.has(alias.normalizedAlias)
        && dateValues.every((date) => inRange(date, alias.validFrom, alias.validTo)));
      const displayExact = normalizedNames.has(displayNormalized);
      const historicalExact = (historiesByCast.get(cast.id) || []).some((name) => normalizedNames.has(normalizeCastName(name)));
      const prefixMatch = [...strippedNames].some((name) => name === withoutKukiPrefix(displayNormalized)
        || ctiAliases.some((alias) => name === withoutKukiPrefix(alias.normalizedAlias)));
      if (!aliasExactForAllDates && !displayExact && !historicalExact && !prefixMatch) continue;
      if (!dateValues.every((date) => activeOn(cast, date))) {
        outOfRangeMatches.add(cast.id);
        continue;
      }
      if (aliasExactForAllDates || displayExact) {
        const reasons = [aliasExactForAllDates ? "同一店舗のCTI Aliasと完全一致" : "内部Cast表示名と完全一致"];
        exactMatches.set(cast.id, { cast, reasons });
      } else {
        const reasons = [historicalExact ? "CastNameHistoryの過去名と一致" : "接頭辞「久」の有無だけが異なる"];
        knownDifferenceMatches.set(cast.id, { cast, reasons });
      }
    }

    const allMatches = new Map([...exactMatches, ...knownDifferenceMatches]);
    const selected = allMatches.size === 1 ? [...allMatches.values()][0] : null;
    const townAliasConflict = selected ? aliases.some((alias) => alias.mediaType === MediaType.TOWN
      && alias.storeId === group.storeId && alias.normalizedAlias === group.normalizedName
      && alias.castId && alias.castId !== selected.cast.id
      && dateValues.some((date) => inRange(date, alias.validFrom, alias.validTo))) : false;
    const idFormat = townNames.some((name) => ID_NAME.test(normalizeCastName(name)));
    const classification = classifyTownBulkLinkEvidence({
      idFormat, correction: group.correction, ambiguous: group.ambiguous,
      exactCandidateCount: exactMatches.size, knownDifferenceCandidateCount: knownDifferenceMatches.size,
      townAliasConflict, outsideEnrollmentCandidateCount: outOfRangeMatches.size,
      sourceNameKnown: townNames.length > 0,
    });
    const reasonCodes: string[] = [classification.reasonCode];
    const category: TownBulkLinkCategory = classification.category;
    let reason = "候補となる内部キャストがありません";
    if (classification.reasonCode === "ID_FORMAT") reason = "ID:数字形式のため人物を安全に特定できません";
    else if (classification.reasonCode === "CORRECTION_CANDIDATE") reason = "同日・店舗・種別の修正版候補です";
    else if (classification.reasonCode === "MULTIPLE_CANDIDATES") reason = `候補が${Math.max(allMatches.size, 2)}名あります`;
    else if (classification.reasonCode === "TOWN_ALIAS_CONFLICT") reason = "別Castを指す同名Town Aliasがあります";
    else if (classification.reasonCode === "EXACT_CTI_EVIDENCE" && selected) reason = selected.reasons.join("・");
    else if (classification.reasonCode === "KNOWN_NAME_DIFFERENCE" && selected) reason = selected.reasons.join("・");
    else if (classification.reasonCode === "OUTSIDE_ENROLLMENT") reason = "一致候補はありますが対象日が在籍期間外です";
    else if (classification.reasonCode === "UNKNOWN_SOURCE_NAME") reason = "URL/LP行から人物名を特定できません";

    const batchIds = [...group.batchIds].sort();
    candidates.push({
      key: group.key, category, townName: displayTownName, normalizedName: group.normalizedName,
      storeId: group.storeId, storeName: group.storeName, firstDate: dates[0], lastDate: dates[dates.length - 1],
      rowCount: group.rows.length, batchCount: batchIds.length, batchIds,
      targetCastId: category === "C" ? null : selected?.cast.id || null,
      targetCastName: category === "C" ? null : selected?.cast.displayName || null,
      reason, reasonCodes, conflict: townAliasConflict || group.ambiguous || allMatches.size > 1,
      kindCounts: {
        cast: group.rows.filter((row) => row.kind === "CAST").length,
        url: group.rows.filter((row) => row.kind === "URL").length,
        landing: group.rows.filter((row) => row.kind === "LANDING").length,
      },
      sourceUrls: [...group.sourceUrls].sort(),
      rows: group.rows,
    });
  }
  candidates.sort((left, right) => left.category.localeCompare(right.category) || right.rowCount - left.rowCount || left.townName.localeCompare(right.townName, "ja"));

  const aRows = new Set(candidates.filter((candidate) => candidate.category === "A").flatMap((candidate) => candidate.rows.map((row) => `${row.batchId}:${row.rowNumber}`)));
  const approvedBRows = new Set(candidates.filter((candidate) => candidate.category === "A" || candidate.category === "B").flatMap((candidate) => candidate.rows.map((row) => `${row.batchId}:${row.rowNumber}`)));
  const estimatedWaiting = (resolvedRows: Set<string>) => [...waitingBatchIds].filter((batchId) => {
    const unmatched = (batchOpenErrors.get(batchId) || []).filter((error) => error.errorCode === "UNMATCHED_CAST" && error.rowNumber !== null);
    return unmatched.some((error) => !resolvedRows.has(`${batchId}:${error.rowNumber}`));
  }).length;
  const estimatedAutoConfirmable = (resolvedRows: Set<string>) => [...unconfirmedBatchIds].filter((batchId) => {
    if (batchCorrections.get(batchId)) return false;
    const errors = batchOpenErrors.get(batchId) || [];
    if (errors.some((error) => error.level === "ERROR")) return false;
    return errors.filter((error) => error.errorCode === "UNMATCHED_CAST" && error.rowNumber !== null)
      .every((error) => resolvedRows.has(`${batchId}:${error.rowNumber}`));
  }).length;
  const estimatedWaitingBatchCountAfterA = estimatedWaiting(aRows);
  const estimatedAutoConfirmableFileCountAfterA = estimatedAutoConfirmable(aRows);
  const estimatedWaitingBatchCountAfterApprovedB = estimatedWaiting(approvedBRows);
  const estimatedAutoConfirmableFileCountAfterApprovedB = estimatedAutoConfirmable(approvedBRows);

  const previewFingerprint = fingerprint(candidates);
  return {
    generatedAt: new Date().toISOString(), fingerprint: previewFingerprint,
    categories: {
      A: summary(candidates, (candidate) => candidate.category === "A"),
      B: summary(candidates, (candidate) => candidate.category === "B"),
      C: summary(candidates, (candidate) => candidate.category === "C"),
    },
    idFormat: summary(candidates, (candidate) => candidate.reasonCodes.includes("ID_FORMAT")),
    multipleCandidates: summary(candidates, (candidate) => candidate.reasonCodes.includes("MULTIPLE_CANDIDATES")),
    outsideEnrollment: summary(candidates, (candidate) => candidate.reasonCodes.includes("OUTSIDE_ENROLLMENT")),
    correctionCandidates: summary(candidates, (candidate) => candidate.reasonCodes.includes("CORRECTION_CANDIDATE")),
    estimatedWaitingBatchCountAfterA,
    estimatedAutoConfirmableFileCountAfterA,
    estimatedWaitingBatchCountAfterApprovedB,
    estimatedAutoConfirmableFileCountAfterApprovedB,
    candidates: candidates.map((candidate) => ({
      key: candidate.key, category: candidate.category, townName: candidate.townName,
      normalizedName: candidate.normalizedName, storeId: candidate.storeId, storeName: candidate.storeName,
      firstDate: candidate.firstDate, lastDate: candidate.lastDate, rowCount: candidate.rowCount,
      batchCount: candidate.batchCount, batchIds: candidate.batchIds, targetCastId: candidate.targetCastId,
      targetCastName: candidate.targetCastName, reason: candidate.reason, reasonCodes: candidate.reasonCodes,
      conflict: candidate.conflict, kindCounts: candidate.kindCounts, sourceUrls: candidate.sourceUrls,
    })),
    castOptions,
    storeOptions: stores.map((store) => ({ id: store.id, name: store.shortName })),
    internalCandidates: candidates,
  };
}

export async function analyzeTownBulkLinkCandidates(): Promise<TownBulkLinkPreview> {
  const result = await analyzeInternal(prisma);
  return {
    generatedAt: result.generatedAt, fingerprint: result.fingerprint, categories: result.categories,
    idFormat: result.idFormat, multipleCandidates: result.multipleCandidates,
    outsideEnrollment: result.outsideEnrollment, correctionCandidates: result.correctionCandidates,
    estimatedWaitingBatchCountAfterA: result.estimatedWaitingBatchCountAfterA,
    estimatedAutoConfirmableFileCountAfterA: result.estimatedAutoConfirmableFileCountAfterA,
    estimatedWaitingBatchCountAfterApprovedB: result.estimatedWaitingBatchCountAfterApprovedB,
    estimatedAutoConfirmableFileCountAfterApprovedB: result.estimatedAutoConfirmableFileCountAfterApprovedB,
    candidates: result.candidates, castOptions: result.castOptions, storeOptions: result.storeOptions,
  };
}

export async function inspectTownBulkLinkImpact(input: {
  candidateKey: string;
  fingerprint: string;
  operation: TownBulkLinkImpactPreview["operation"];
  targetCastId?: string;
  newCastName?: string;
  newStartedOn?: string;
}) : Promise<TownBulkLinkImpactPreview> {
  const current = await analyzeInternal(prisma);
  if (current.fingerprint !== input.fingerprint) throw new Error("候補情報が更新されています。再度候補解析を実行してください。");
  const candidate = current.internalCandidates.find((value) => value.key === input.candidateKey && value.category === "C");
  if (!candidate) throw new Error("C候補が見つかりません。");
  const target = input.targetCastId ? current.castOptions.find((cast) => cast.id === input.targetCastId) : null;
  const stopReasons: string[] = [];
  if (candidate.reasonCodes.includes("CORRECTION_CANDIDATE") && input.operation !== "PENDING" && input.operation !== "CORRECTION_REVIEW") stopReasons.push("修正版候補は通常のAlias処理へ流せません。");
  if (candidate.reasonCodes.includes("ID_FORMAT") && input.operation === "NEW") stopReasons.push("ID形式から新規Castは作成できません。");
  if (input.operation === "EXISTING" && !target) stopReasons.push("既存Castを選択してください。");
  if (target && (target.startedOn > candidate.firstDate || (target.endedOn && target.endedOn < candidate.lastDate))) stopReasons.push("対象期間がCast在籍期間外です。Phase 2で開始日前倒しまたは個別確認が必要です。");
  const sameNameCasts = current.castOptions.filter((cast) => cast.normalizedName === normalizeCastName(input.newCastName || candidate.townName));
  if (input.operation === "NEW" && !input.newCastName?.trim()) stopReasons.push("新規Cast名を入力してください。");
  if (input.operation === "NEW" && candidate.reasonCodes.includes("ID_FORMAT")) stopReasons.push("ID形式を表示名とする新規作成は禁止です。");
  if (input.operation === "NEW" && sameNameCasts.length === 1) stopReasons.push(`同名Cast「${sameNameCasts[0].displayName}」があります。既存紐付けを推奨します。`);
  if (input.operation === "NEW" && sameNameCasts.length > 1) stopReasons.push("同名Castが複数あるため新規作成を停止します。");

  const aliases = target ? await prisma.castAlias.findMany({ where: { mediaType: MediaType.TOWN, storeId: candidate.storeId, normalizedAlias: candidate.normalizedName }, select: { castId: true, validFrom: true } }) : [];
  const conflictingAliases = target ? aliases.filter((alias) => alias.castId && alias.castId !== target.id) : [];
  if (conflictingAliases.length) stopReasons.push("別Castを指す同名Town Aliasがあります。");
  const sameCastAlias = target ? aliases.find((alias) => alias.castId === target.id) : null;
  const batchStatuses = await prisma.importBatch.findMany({ where: { id: { in: candidate.batchIds } }, select: { id: true, status: true } });
  const completedIds = new Set(batchStatuses.filter((batch) => batch.status === ImportBatchStatus.COMPLETED || batch.status === ImportBatchStatus.COMPLETED_WITH_WARNINGS).map((batch) => batch.id));
  let existingFactCount = 0; let additionalFactCount = 0;
  if (input.operation === "EXISTING" || input.operation === "NEW") {
    const from = parseDateOnly(candidate.firstDate); const to = parseDateOnly(candidate.lastDate);
    const [castFacts, urlFacts, landingFacts] = await Promise.all([
      target ? prisma.townCastDaily.findMany({ where: { storeId: candidate.storeId, castId: target.id, date: { gte: from, lte: to } }, select: { date: true } }) : Promise.resolve([]),
      prisma.townUrlDaily.findMany({ where: { storeId: candidate.storeId, date: { gte: from, lte: to } }, select: { date: true, normalizedUrl: true } }),
      prisma.townLandingDaily.findMany({ where: { storeId: candidate.storeId, date: { gte: from, lte: to } }, select: { date: true, normalizedUrl: true } }),
    ]);
    const castKeys = new Set(castFacts.map((fact) => formatDateOnly(fact.date)));
    const urlKeys = new Set(urlFacts.map((fact) => `${formatDateOnly(fact.date)}:${fact.normalizedUrl}`));
    const landingKeys = new Set(landingFacts.map((fact) => `${formatDateOnly(fact.date)}:${fact.normalizedUrl}`));
    for (const row of candidate.rows.filter((value) => completedIds.has(value.batchId))) {
      const exists = row.kind === "CAST" ? castKeys.has(row.date)
        : row.kind === "URL" ? urlKeys.has(`${row.date}:${row.normalizedUrl}`)
          : row.kind === "LANDING" ? landingKeys.has(`${row.date}:${row.normalizedUrl}`) : true;
      if (exists) existingFactCount += 1; else additionalFactCount += 1;
    }
  }
  const startedOnAfter = target && target.startedOn > candidate.firstDate ? candidate.firstDate : target?.startedOn || input.newStartedOn || candidate.firstDate;
  const executable = stopReasons.length === 0 && !candidate.reasonCodes.includes("CORRECTION_CANDIDATE");
  return {
    candidateKey: candidate.key, operation: input.operation, storeName: candidate.storeName, townName: candidate.townName,
    targetCastId: target?.id || null, targetCastName: target?.displayName || (input.operation === "NEW" ? input.newCastName?.trim() || null : null),
    rowCount: candidate.rowCount, batchCount: candidate.batchCount, kindCounts: candidate.kindCounts,
    firstDate: candidate.firstDate, lastDate: candidate.lastDate,
    aliasAction: input.operation === "EXISTING" || input.operation === "NEW" ? sameCastAlias ? "既存Town AliasのvalidFrom確認・必要時前倒し" : "Town Aliasを新規作成" : "変更なし",
    startedOnBefore: target?.startedOn || null, startedOnAfter: input.operation === "EXISTING" || input.operation === "NEW" ? startedOnAfter : null,
    validFromBefore: sameCastAlias?.validFrom ? formatDateOnly(sameCastAlias.validFrom) : null,
    validFromAfter: input.operation === "EXISTING" || input.operation === "NEW" ? candidate.firstDate : null,
    additionalFactCount, existingFactCount, conflictCount: conflictingAliases.length,
    canProceedInPhase2: executable, executable, stopReasons,
    notes: input.operation === "SKIP"
      ? ["除外すると対象行のPV・UU・TELは実績へ入りません。Phase 2の実行対象外です。"]
      : input.operation === "PENDING" ? ["保留はデータを変更しません。画面上の計画状態だけを保持します。"]
        : ["既存実績は加算・上書きしません。存在しない確定済み実績だけがPhase 2の追加対象です。"],
  };
}

async function factExists(tx: Prisma.TransactionClient, preview: TownPreview, row: TownPreviewRow) {
  const date = parseDateOnly(row.date);
  if (row.kind === "CAST" && row.castId) return Boolean(await tx.townCastDaily.findUnique({ where: { date_storeId_castId: { date, storeId: preview.storeId, castId: row.castId } }, select: { id: true } }));
  if (row.kind === "URL") return Boolean(await tx.townUrlDaily.findUnique({ where: { date_storeId_normalizedUrl: { date, storeId: preview.storeId, normalizedUrl: row.normalizedUrl } }, select: { id: true } }));
  if (row.kind === "LANDING") return Boolean(await tx.townLandingDaily.findUnique({ where: { date_storeId_normalizedUrl: { date, storeId: preview.storeId, normalizedUrl: row.normalizedUrl } }, select: { id: true } }));
  return true;
}

export async function executeTownBulkLinks(input: TownBulkLinkExecuteInput) {
  const originals = new Map<string, TownPreview>();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('town-bulk-cti-link')) IS NULL AS locked`;
      const current = await analyzeInternal(tx);
      if (current.fingerprint !== input.fingerprint) throw new Error("候補情報が更新されています。再度プレビューを作成してください。");
      const requested = new Set(input.candidateKeys);
      const selected = current.internalCandidates.filter((candidate) => candidate.category === input.category && requested.has(candidate.key));
      if (!selected.length || selected.length !== requested.size) throw new Error("実行対象候補が現在の安全条件と一致しません。再度プレビューしてください。");
      if (input.category === "A" && selected.length !== current.categories.A.peopleCount) throw new Error("A候補は全件を再検証して一括実行します。再度プレビューしてください。");

      const affectedBatchIds = [...new Set(selected.flatMap((candidate) => candidate.batchIds))];
      const batches = await tx.importBatch.findMany({
        where: { id: { in: affectedBatchIds } },
        include: { errors: { select: { rowNumber: true, errorCode: true, status: true } } },
      });
      const batchMap = new Map(batches.map((batch) => [batch.id, batch]));
      const previews = new Map<string, TownPreview>();
      const insertedKeysByBatch = new Map<string, Set<string>>();
      for (const batchId of affectedBatchIds) {
        const preview = await readPreview<TownPreview>(batchId);
        originals.set(batchId, JSON.parse(JSON.stringify(preview)) as TownPreview);
        previews.set(batchId, preview);
      }

      let resolvedRows = 0;
      let insertedFacts = 0;
      for (const candidate of selected) {
        if (!candidate.targetCastId) throw new Error("紐付け先Castがありません。");
        const cast = await tx.cast.findFirst({ where: { id: candidate.targetCastId, mergedIntoCastId: null, status: CastStatus.ACTIVE } });
        if (!cast) throw new Error(`${candidate.townName}の紐付け先Castが無効です。`);
        const minDate = parseDateOnly(candidate.firstDate);
        const conflictingAlias = await tx.castAlias.findFirst({ where: {
          mediaType: MediaType.TOWN, storeId: candidate.storeId, normalizedAlias: candidate.normalizedName,
          castId: { not: null, notIn: [cast.id] },
        } });
        if (conflictingAlias) throw new Error(`${candidate.townName}には別Castを指すTown Aliasがあります。`);
        const existingSameCastAlias = await tx.castAlias.findFirst({
          where: { mediaType: MediaType.TOWN, storeId: candidate.storeId, normalizedAlias: candidate.normalizedName, castId: cast.id },
          orderBy: { validFrom: "asc" },
        });
        if (existingSameCastAlias) await tx.castAlias.update({
          where: { id: existingSameCastAlias.id },
          data: { aliasName: candidate.townName, reviewStatus: AliasReviewStatus.MAPPED, validFrom: !existingSameCastAlias.validFrom || existingSameCastAlias.validFrom <= minDate ? existingSameCastAlias.validFrom : minDate },
        });
        else await tx.castAlias.create({ data: {
          mediaType: MediaType.TOWN, aliasName: candidate.townName, normalizedAlias: candidate.normalizedName,
          reviewStatus: AliasReviewStatus.MAPPED, castId: cast.id, storeId: candidate.storeId, validFrom: minDate,
        } });
        for (const reference of candidate.rows) {
          const preview = previews.get(reference.batchId);
          const batch = batchMap.get(reference.batchId);
          if (!preview || !batch) throw new Error("対象Townバッチを再読込できません。");
          const row = preview.rows.find((value) => value.rowKey === reference.rowKey && value.sourceRowNumber === reference.rowNumber);
          if (!row || row.kind === "STORE" || row.castId || row.resolutionStatus !== "UNMATCHED") throw new Error("対象行の状態が更新されています。再度プレビューしてください。");
          row.castId = cast.id;
          row.castDisplayName = cast.displayName;
          row.resolutionStatus = "EXACT_ALIAS";
          row.issues = row.issues.filter((issue) => issue.code !== "UNMATCHED_CAST");
          await tx.importError.updateMany({
            where: { importBatchId: batch.id, rowNumber: row.sourceRowNumber, errorCode: "UNMATCHED_CAST", status: "OPEN" },
            data: { status: "RESOLVED", resolvedAt: new Date() },
          });
          const completed = batch.status === ImportBatchStatus.COMPLETED || batch.status === ImportBatchStatus.COMPLETED_WITH_WARNINGS;
          if (completed && !(await factExists(tx, preview, row))) {
            await persistTownRow(tx, batch.id, preview, row);
            insertedKeysByBatch.set(batch.id, new Set([...(insertedKeysByBatch.get(batch.id) || []), townRowKey(row)]));
            insertedFacts += 1;
          }
          resolvedRows += 1;
        }
      }

      for (const [batchId, preview] of previews) {
        const batch = batchMap.get(batchId);
        if (!batch) continue;
        const openErrors = await tx.importError.findMany({ where: { importBatchId: batchId, status: "OPEN" }, select: { level: true, errorCode: true, rowNumber: true } });
        const openUnmatched = new Set(openErrors.flatMap((error) => error.errorCode === "UNMATCHED_CAST" && error.rowNumber !== null ? [error.rowNumber] : []));
        const pendingCount = preview.rows.filter((row) => row.kind !== "STORE" && row.castId === null && row.resolutionStatus !== "SKIPPED" && openUnmatched.has(row.sourceRowNumber)).length;
        if (pendingCount === 0) await tx.importError.updateMany({ where: { importBatchId: batchId, errorCode: "PARTIAL_IMPORT", status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date() } });
        const remaining = await tx.importError.findMany({ where: { importBatchId: batchId, status: "OPEN" }, select: { level: true } });
        const warningCount = remaining.filter((error) => error.level === "WARNING").length;
        const errorCount = remaining.filter((error) => error.level === "ERROR").length;
        const completed = batch.status === ImportBatchStatus.COMPLETED || batch.status === ImportBatchStatus.COMPLETED_WITH_WARNINGS;
        const status = completed
          ? pendingCount || warningCount || errorCount ? ImportBatchStatus.COMPLETED_WITH_WARNINGS : ImportBatchStatus.COMPLETED
          : pendingCount ? ImportBatchStatus.WAITING_FOR_CAST_LINK : ImportBatchStatus.PREVIEW_READY;
        const metadata = objectValue(batch.metadata);
        const events = Array.isArray(metadata.importEvents) ? metadata.importEvents : [];
        const existingInsertedKeys = new Set(stringArray(metadata.insertedKeys));
        const newInsertedKeys = [...(insertedKeysByBatch.get(batchId) || [])].filter((key) => !existingInsertedKeys.has(key));
        newInsertedKeys.forEach((key) => existingInsertedKeys.add(key));
        const insertedCount = Array.isArray(metadata.insertedKeys) ? existingInsertedKeys.size : batch.insertedCount + newInsertedKeys.length;
        const skippedCount = preview.rows.filter((row) => row.resolutionStatus === "SKIPPED").length;
        const batchResolved = selected.flatMap((candidate) => candidate.rows).filter((row) => row.batchId === batchId).length;
        await tx.importBatch.update({ where: { id: batchId }, data: {
          status, insertedCount, pendingCount, skippedCount, warningCount, errorCount,
          metadata: { ...metadata, insertedKeys: [...existingInsertedKeys], importEvents: [...events, {
            type: "BULK_CTI_TOWN_LINK", category: input.category, resolvedRows: batchResolved,
            inserted: newInsertedKeys.length, performedByUserId: input.userId, at: new Date().toISOString(),
          }] },
        } });
        await writePreview(batchId, preview);
      }
      return { category: input.category, candidateCount: selected.length, resolvedRows, affectedBatchCount: affectedBatchIds.length, insertedFacts };
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 });
  } catch (error) {
    for (const [batchId, preview] of originals) {
      try { await writePreview(batchId, preview); } catch { /* DBロールバック後のbest-effort復元 */ }
    }
    throw error;
  }
}

/** Phase 2: execute one C/NO_CANDIDATE candidate after a fresh, fingerprinted preview. */
export async function executeTownBulkLinkCandidate(input: TownBulkLinkCandidateExecuteInput) {
  const originals = new Map<string, TownPreview>();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('town-bulk-candidate:' || ${input.candidateKey})) IS NULL AS locked`;
      const current = await analyzeInternal(tx);
      if (current.fingerprint !== input.fingerprint) throw new Error("候補情報が更新されています。再度影響範囲を確認してください。");
      const candidate = current.internalCandidates.find((value) => value.key === input.candidateKey);
      if (!candidate || candidate.category !== "C" || !candidate.reasonCodes.includes("NO_CANDIDATE")) throw new Error("この候補はPhase 2の実行対象ではありません。候補を再解析してください。");
      if (candidate.reasonCodes.some((code) => ["ID_FORMAT", "CORRECTION_CANDIDATE", "MULTIPLE_CANDIDATES", "OUTSIDE_ENROLLMENT"].includes(code))) throw new Error("安全条件外の候補は実行できません。");

      const targetDate = parseDateOnly(candidate.firstDate);
      let castId = input.targetCastId;
      let createdCastId: string | null = null;
      if (input.operation === "EXISTING") {
        if (!castId) throw new Error("紐付け先Castを選択してください。");
        const cast = await tx.cast.findFirst({ where: { id: castId, mergedIntoCastId: null, status: CastStatus.ACTIVE } });
        if (!cast) throw new Error("統合済みまたは無効なCastは選択できません。");
        if (cast.startedOn > targetDate || (cast.endedOn && cast.endedOn < parseDateOnly(candidate.lastDate))) throw new Error("対象期間がCast在籍期間外です。Phase 2では開始日を前倒ししません。");
      } else {
        const name = input.newCastName?.trim();
        const reason = input.creationReason?.trim();
        if (!name || !reason) throw new Error("新規Cast名と作成理由は必須です。");
        if (ID_NAME.test(normalizeCastName(name))) throw new Error("ID:数字形式を表示名として新規作成できません。");
        const sameName = await tx.cast.findMany({ where: { normalizedName: normalizeCastName(name), mergedIntoCastId: null }, select: { id: true, displayName: true } });
        if (sameName.length > 1) throw new Error("同名Castが複数あるため新規作成を停止しました。");
        if (sameName.length === 1 && input.confirmationText !== "同名Castとは別人として新規作成します") throw new Error(`同名Cast「${sameName[0].displayName}」があります。既存Castへ紐付けるか、確認文言を入力してください。`);
        const startedOn = input.newStartedOn ? parseDateOnly(input.newStartedOn) : targetDate;
        if (startedOn > targetDate) throw new Error("在籍開始日は初回出現日以前にしてください。");
        if (input.primaryStoreId && !await tx.store.findUnique({ where: { id: input.primaryStoreId }, select: { id: true } })) throw new Error("主所属店舗が見つかりません。");
        const created = await tx.cast.create({ data: { displayName: name, normalizedName: normalizeCastName(name), startedOn, primaryStoreId: input.primaryStoreId || null, notes: input.note?.trim() || null } });
        castId = created.id; createdCastId = created.id;
      }
      if (!castId) throw new Error("Castを確定できません。");
      const conflictingAlias = await tx.castAlias.findFirst({ where: { mediaType: MediaType.TOWN, storeId: candidate.storeId, normalizedAlias: candidate.normalizedName, castId: { not: null, notIn: [castId] } }, select: { id: true } });
      if (conflictingAlias) throw new Error("別Castを指す同名Town Aliasがあります。");
      const existingAlias = await tx.castAlias.findFirst({ where: { mediaType: MediaType.TOWN, storeId: candidate.storeId, normalizedAlias: candidate.normalizedName, castId }, orderBy: { validFrom: "asc" } });
      const alias = existingAlias
        ? await tx.castAlias.update({ where: { id: existingAlias.id }, data: { aliasName: candidate.townName, reviewStatus: AliasReviewStatus.MAPPED, validFrom: !existingAlias.validFrom || existingAlias.validFrom <= targetDate ? existingAlias.validFrom : targetDate } })
        : await tx.castAlias.create({ data: { mediaType: MediaType.TOWN, aliasName: candidate.townName, normalizedAlias: candidate.normalizedName, reviewStatus: AliasReviewStatus.MAPPED, castId, storeId: candidate.storeId, validFrom: targetDate } });
      if (input.operation === "NEW") await tx.mediaListing.upsert({ where: { castId_storeId_mediaType: { castId, storeId: candidate.storeId, mediaType: MediaType.TOWN } }, create: { castId, storeId: candidate.storeId, mediaType: MediaType.TOWN, isListed: true, listedFrom: targetDate }, update: { isListed: true, listedTo: null } });

      const batchIds = [...new Set(candidate.rows.map((row) => row.batchId))];
      const batches = await tx.importBatch.findMany({ where: { id: { in: batchIds } }, include: { errors: { select: { rowNumber: true, errorCode: true, status: true } } } });
      const batchMap = new Map(batches.map((batch) => [batch.id, batch]));
      const previews = new Map<string, TownPreview>();
      for (const batchId of batchIds) { const preview = await readPreview<TownPreview>(batchId); originals.set(batchId, JSON.parse(JSON.stringify(preview)) as TownPreview); previews.set(batchId, preview); }
      const insertedKeysByBatch = new Map<string, Set<string>>(); let resolvedRows = 0; let insertedFacts = 0;
      for (const reference of candidate.rows) {
        const preview = previews.get(reference.batchId); const batch = batchMap.get(reference.batchId);
        if (!preview || !batch) throw new Error("対象Townバッチを再読込できません。");
        const row = preview.rows.find((value) => value.rowKey === reference.rowKey && value.sourceRowNumber === reference.rowNumber);
        if (!row || row.kind === "STORE" || row.castId !== null || row.resolutionStatus !== "UNMATCHED") throw new Error("対象行の状態が変化しています。再度候補解析してください。");
        const openError = batch.errors.some((error) => error.rowNumber === row.sourceRowNumber && error.errorCode === "UNMATCHED_CAST" && error.status === "OPEN");
        if (!openError) throw new Error("対象行のUNMATCHED_CASTがOPENではありません。再度候補解析してください。");
        row.castId = castId; row.castDisplayName = (await tx.cast.findUniqueOrThrow({ where: { id: castId }, select: { displayName: true } })).displayName; row.resolutionStatus = "EXACT_ALIAS"; row.issues = row.issues.filter((issue) => issue.code !== "UNMATCHED_CAST");
        await tx.importError.updateMany({ where: { importBatchId: batch.id, rowNumber: row.sourceRowNumber, errorCode: "UNMATCHED_CAST", status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date() } });
        const completed = batch.status === ImportBatchStatus.COMPLETED || batch.status === ImportBatchStatus.COMPLETED_WITH_WARNINGS;
        if (completed && !(await factExists(tx, preview, row))) { await persistTownRow(tx, batch.id, preview, row); insertedKeysByBatch.set(batch.id, new Set([...(insertedKeysByBatch.get(batch.id) || []), townRowKey(row)])); insertedFacts += 1; }
        resolvedRows += 1;
      }
      for (const [batchId, preview] of previews) {
        const batch = batchMap.get(batchId); if (!batch) continue;
        const openErrors = await tx.importError.findMany({ where: { importBatchId: batchId, status: "OPEN" }, select: { level: true, errorCode: true, rowNumber: true } });
        const openUnmatched = new Set(openErrors.flatMap((error) => error.errorCode === "UNMATCHED_CAST" && error.rowNumber !== null ? [error.rowNumber] : []));
        const pendingCount = preview.rows.filter((row) => row.kind !== "STORE" && row.castId === null && row.resolutionStatus !== "SKIPPED" && openUnmatched.has(row.sourceRowNumber)).length;
        const remaining = await tx.importError.findMany({ where: { importBatchId: batchId, status: "OPEN" }, select: { level: true } });
        const warningCount = remaining.filter((error) => error.level === "WARNING").length; const errorCount = remaining.filter((error) => error.level === "ERROR").length;
        const completed = batch.status === ImportBatchStatus.COMPLETED || batch.status === ImportBatchStatus.COMPLETED_WITH_WARNINGS;
        const status = completed ? (pendingCount || warningCount || errorCount ? ImportBatchStatus.COMPLETED_WITH_WARNINGS : ImportBatchStatus.COMPLETED) : (pendingCount ? ImportBatchStatus.WAITING_FOR_CAST_LINK : ImportBatchStatus.PREVIEW_READY);
        const metadata = objectValue(batch.metadata); const events = Array.isArray(metadata.importEvents) ? metadata.importEvents : []; const existingKeys = new Set(stringArray(metadata.insertedKeys)); const newKeys = [...(insertedKeysByBatch.get(batchId) || [])].filter((key) => !existingKeys.has(key)); newKeys.forEach((key) => existingKeys.add(key));
        await tx.importBatch.update({ where: { id: batchId }, data: { status, insertedCount: Array.isArray(metadata.insertedKeys) ? existingKeys.size : batch.insertedCount + newKeys.length, pendingCount, skippedCount: preview.rows.filter((row) => row.resolutionStatus === "SKIPPED").length, warningCount, errorCount, metadata: { ...metadata, insertedKeys: [...existingKeys], importEvents: [...events, { type: "CANDIDATE_LINK", operation: input.operation, townName: candidate.townName, storeId: candidate.storeId, targetCastId: castId, createdCastId, resolvedRows: candidate.rows.filter((row) => row.batchId === batchId).length, inserted: newKeys.length, aliasId: alias.id, performedByUserId: input.userId, at: new Date().toISOString() }] } } });
        await writePreview(batchId, preview);
      }
      return { candidateKey: candidate.key, resolvedRows, affectedBatchCount: batchIds.length, createdCastId, aliasId: alias.id, insertedFacts, remainingCCandidates: Math.max(0, current.categories.C.peopleCount - 1) };
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 });
  } catch (error) {
    for (const [batchId, preview] of originals) { try { await writePreview(batchId, preview); } catch { /* best-effort restore */ } }
    throw error;
  }
}
