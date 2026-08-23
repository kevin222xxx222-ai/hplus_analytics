import { AliasReviewStatus, CastMembershipStatus, ImportBatchStatus, ImportDataType, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;
const successful: ImportBatchStatus[] = [ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS];

export type DatasetTrace = {
  date: Date;
  batchId: string;
  status: ImportBatchStatus;
  fileName: string;
};

export type CurrentEvidence = {
  ctiCurrent: boolean;
  townCurrent: boolean;
  mediaListingEvidence: boolean;
  aliasEvidence: boolean;
  latestFactEvidence: boolean;
  latestFactDate: Date | null;
  latestSuccessfulImportDate: Date | null;
  latestSuccessfulImportBatchId: string | null;
  ctiDataset: DatasetTrace | null;
  townDataset: DatasetTrace | null;
  reasons: string[];
};

export type CurrentMembershipCandidate = {
  castId: string;
  storeId: string;
  displayName: string;
  storeName: string;
  evidence: CurrentEvidence;
  decision: "CREATE_ACTIVE" | "NOOP" | "ON_LEAVE_REVIEW" | "REENTRY_REVIEW" | "LEGACY_STATUS_CONFLICT" | "HEAVEN_CURRENT_REVIEW" | "NO_EVIDENCE";
};

export type CurrentMembershipAuditSummary = {
  createActiveTotal: number;
  townOnly: number;
  ctiOnly: number;
  both: number;
  storeCounts: Record<string, number>;
  duplicateCastStoreCount: number;
  invalidBatchStatusCount: number;
  datasets: Array<{ source: "Town CAST" | "CTI"; storeName: string; storeId: string; trace: DatasetTrace }>;
};

export function classifyCurrentMembershipDecision(input: { castStatus: string; displayName: string; membershipStatus?: string; evidence: Pick<CurrentEvidence, "ctiCurrent" | "townCurrent" | "reasons"> }) {
  const positive = input.evidence.ctiCurrent || input.evidence.townCurrent;
  const marker = /(?:【?退店】?|退店|【?休業】?|休業)/u.test(input.displayName);
  const hasHeavenOnly = !positive && input.evidence.reasons.some((reason) => reason.startsWith("Heaven累計Fact"));
  if (marker && positive) return "LEGACY_STATUS_CONFLICT" as const;
  if (input.castStatus !== "ACTIVE" && positive) return "LEGACY_STATUS_CONFLICT" as const;
  if (input.membershipStatus === CastMembershipStatus.ACTIVE) return "NOOP" as const;
  if (input.membershipStatus === CastMembershipStatus.ON_LEAVE) return "ON_LEAVE_REVIEW" as const;
  if (input.membershipStatus === CastMembershipStatus.LEFT && positive) return "REENTRY_REVIEW" as const;
  if (hasHeavenOnly) return "HEAVEN_CURRENT_REVIEW" as const;
  return positive ? "CREATE_ACTIVE" as const : "NO_EVIDENCE" as const;
}

const emptyEvidence = (): CurrentEvidence => ({ ctiCurrent: false, townCurrent: false, mediaListingEvidence: false, aliasEvidence: false, latestFactEvidence: false, latestFactDate: null, latestSuccessfulImportDate: null, latestSuccessfulImportBatchId: null, ctiDataset: null, townDataset: null, reasons: [] });

export function summarizeCurrentMembershipCandidates(candidates: CurrentMembershipCandidate[]): CurrentMembershipAuditSummary {
  const create = candidates.filter((candidate) => candidate.decision === "CREATE_ACTIVE");
  const storeCounts: Record<string, number> = {};
  let townOnly = 0;
  let ctiOnly = 0;
  let both = 0;
  const pairs = new Set<string>();
  let duplicateCastStoreCount = 0;
  const datasets = new Map<string, { source: "Town CAST" | "CTI"; storeName: string; storeId: string; trace: DatasetTrace }>();
  for (const candidate of create) {
    storeCounts[candidate.storeName] = (storeCounts[candidate.storeName] ?? 0) + 1;
    const hasTown = candidate.evidence.townCurrent;
    const hasCti = candidate.evidence.ctiCurrent;
    if (hasTown && hasCti) both += 1;
    else if (hasTown) townOnly += 1;
    else if (hasCti) ctiOnly += 1;
    const pair = `${candidate.castId}:${candidate.storeId}`;
    if (pairs.has(pair)) duplicateCastStoreCount += 1;
    pairs.add(pair);
    if (candidate.evidence.townDataset) datasets.set(`Town CAST:${candidate.storeId}`, { source: "Town CAST", storeName: candidate.storeName, storeId: candidate.storeId, trace: candidate.evidence.townDataset });
    if (candidate.evidence.ctiDataset) datasets.set(`CTI:${candidate.storeId}`, { source: "CTI", storeName: candidate.storeName, storeId: candidate.storeId, trace: candidate.evidence.ctiDataset });
  }
  const invalidBatchStatusCount = create.reduce((count, candidate) => {
    const traces = [candidate.evidence.townDataset, candidate.evidence.ctiDataset].filter((trace): trace is DatasetTrace => Boolean(trace));
    return count + traces.filter((trace) => !successful.includes(trace.status)).length;
  }, 0);
  return { createActiveTotal: create.length, townOnly, ctiOnly, both, storeCounts, duplicateCastStoreCount, invalidBatchStatusCount, datasets: [...datasets.values()] };
}

export async function loadCurrentMembershipCandidates(db: DbClient = prisma): Promise<CurrentMembershipCandidate[]> {
  const [casts, stores, aliases, listings, cti, town, heaven] = await Promise.all([
    db.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, status: true, memberships: { select: { storeId: true, status: true } } } }),
    db.store.findMany({ where: { isActive: true }, select: { id: true, shortName: true } }),
    db.castAlias.findMany({ where: { castId: { not: null }, validTo: null, reviewStatus: { not: AliasReviewStatus.IGNORED } }, select: { castId: true, storeId: true } }),
    db.mediaListing.findMany({ where: { isListed: true }, select: { castId: true, storeId: true } }),
    db.ctiCastDaily.findMany({ where: { importBatch: { dataType: ImportDataType.CTI_CAST_REPORT, status: { in: successful } } }, select: { castId: true, storeId: true, businessDate: true, importBatch: { select: { id: true, targetTo: true, status: true, originalFilename: true } } } }),
    db.townCastDaily.findMany({ where: { importBatch: { dataType: ImportDataType.TOWN_CAST, status: { in: successful } } }, select: { castId: true, storeId: true, date: true, importBatch: { select: { id: true, targetTo: true, status: true, originalFilename: true } } } }),
    db.heavenCastDaily.findMany({ where: { castId: { not: null }, importBatch: { dataType: ImportDataType.HEAVEN_CAST, status: { in: successful } } }, select: { castId: true, storeId: true, businessDate: true, importBatch: { select: { targetTo: true } } } }),
  ]);
  const currentRows = [
    ...cti.map((row) => ({ source: "CTI" as const, castId: row.castId, storeId: row.storeId, date: row.businessDate, batchId: row.importBatch.id, datasetDate: row.importBatch.targetTo, status: row.importBatch.status, fileName: row.importBatch.originalFilename })),
    ...town.map((row) => ({ source: "TOWN" as const, castId: row.castId, storeId: row.storeId, date: row.date, batchId: row.importBatch.id, datasetDate: row.importBatch.targetTo, status: row.importBatch.status, fileName: row.importBatch.originalFilename })),
  ];
  const latestDataset = new Map<string, number>();
  for (const row of currentRows) {
    const key = `${row.source}:${row.storeId}`;
    latestDataset.set(key, Math.max(latestDataset.get(key) ?? 0, row.datasetDate.getTime()));
  }
  const map = new Map<string, CurrentEvidence>();
  const ensure = (castId: string, storeId: string) => {
    const key = `${castId}:${storeId}`;
    const existing = map.get(key) ?? emptyEvidence();
    map.set(key, existing);
    return existing;
  };
  for (const row of listings) {
    const evidence = ensure(row.castId, row.storeId);
    evidence.mediaListingEvidence = true;
    evidence.reasons.push("MediaListing.isListed=true（補足）");
  }
  for (const row of aliases) if (row.castId && row.storeId) {
    const evidence = ensure(row.castId, row.storeId);
    evidence.aliasEvidence = true;
    evidence.reasons.push("Alias.validTo=NULL（補足）");
  }
  for (const row of currentRows) {
    const evidence = ensure(row.castId, row.storeId);
    const key = `${row.source}:${row.storeId}`;
    if (latestDataset.get(key) !== row.datasetDate.getTime()) continue;
    evidence.latestFactEvidence = true;
    evidence.latestSuccessfulImportDate = row.datasetDate;
    evidence.latestSuccessfulImportBatchId = row.batchId;
    evidence.latestFactDate = !evidence.latestFactDate || row.date > evidence.latestFactDate ? row.date : evidence.latestFactDate;
    const trace: DatasetTrace = { date: row.datasetDate, batchId: row.batchId, status: row.status, fileName: row.fileName };
    if (row.source === "CTI") {
      evidence.ctiCurrent = true;
      evidence.ctiDataset = trace;
    } else {
      evidence.townCurrent = true;
      evidence.townDataset = trace;
    }
    evidence.reasons.push(`${row.source === "CTI" ? "CTI" : "Town CAST"}最新Dataset ${row.datasetDate.toISOString().slice(0, 10)}`);
  }
  for (const row of heaven) if (row.castId) {
    const evidence = ensure(row.castId, row.storeId);
    evidence.reasons.push("Heaven累計Fact（補足・自動初期化対象外）");
  }
  const results: CurrentMembershipCandidate[] = [];
  for (const cast of casts) for (const store of stores) {
    const evidence = map.get(`${cast.id}:${store.id}`) ?? emptyEvidence();
    const current = cast.memberships.find((membership) => membership.storeId === store.id);
    const decision = classifyCurrentMembershipDecision({ castStatus: cast.status, displayName: cast.displayName, membershipStatus: current?.status, evidence });
    results.push({ castId: cast.id, storeId: store.id, displayName: cast.displayName, storeName: store.shortName, evidence, decision });
  }
  return results;
}
