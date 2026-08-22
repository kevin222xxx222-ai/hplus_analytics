import { CastMembershipStatus, ImportBatchStatus, ImportDataType, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;
const successful = [ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS];
export type CurrentEvidence = { ctiCurrent: boolean; townCurrent: boolean; mediaListingEvidence: boolean; aliasEvidence: boolean; latestFactEvidence: boolean; latestFactDate: Date | null; latestSuccessfulImportDate: Date | null; latestSuccessfulImportBatchId: string | null; reasons: string[] };
export type CurrentMembershipCandidate = { castId: string; storeId: string; displayName: string; storeName: string; evidence: CurrentEvidence; decision: "CREATE_ACTIVE" | "NOOP" | "ON_LEAVE_REVIEW" | "REENTRY_REVIEW" | "LEGACY_STATUS_CONFLICT" | "HEAVEN_CURRENT_REVIEW" | "NO_EVIDENCE" };

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

export async function loadCurrentMembershipCandidates(db: DbClient = prisma): Promise<CurrentMembershipCandidate[]> {
  const [casts, stores, aliases, listings, cti, town, heaven] = await Promise.all([
    db.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, status: true, memberships: { select: { storeId: true, status: true } } } }),
    db.store.findMany({ where: { isActive: true }, select: { id: true, shortName: true } }),
    db.castAlias.findMany({ where: { castId: { not: null }, validTo: null }, select: { castId: true, storeId: true } }),
    db.mediaListing.findMany({ where: { isListed: true }, select: { castId: true, storeId: true } }),
    db.ctiCastDaily.findMany({ where: { importBatch: { dataType: ImportDataType.CTI_CAST_REPORT, status: { in: successful } } }, select: { castId: true, storeId: true, businessDate: true, importBatch: { select: { id: true, targetTo: true } } } }),
    db.townCastDaily.findMany({ where: { importBatch: { dataType: ImportDataType.TOWN_CAST, status: { in: successful } } }, select: { castId: true, storeId: true, date: true, importBatch: { select: { id: true, targetTo: true } } } }),
    db.heavenCastDaily.findMany({ where: { castId: { not: null }, importBatch: { dataType: ImportDataType.HEAVEN_CAST, status: { in: successful } } }, select: { castId: true, storeId: true, businessDate: true, importBatch: { select: { targetTo: true } } } }),
  ]);
  const currentRows = [...cti.map((r) => ({ source: "CTI" as const, castId: r.castId, storeId: r.storeId, date: r.businessDate, batchId: r.importBatch.id, datasetDate: r.importBatch.targetTo })), ...town.map((r) => ({ source: "TOWN" as const, castId: r.castId, storeId: r.storeId, date: r.date, batchId: r.importBatch.id, datasetDate: r.importBatch.targetTo }))];
  const latestDataset = new Map<string, number>();
  for (const row of currentRows) { const key = `${row.source}:${row.storeId}`; latestDataset.set(key, Math.max(latestDataset.get(key) ?? 0, row.datasetDate.getTime())); }
  const map = new Map<string, CurrentEvidence>();
  const ensure = (castId: string, storeId: string) => { const key = `${castId}:${storeId}`; const existing = map.get(key) ?? { ctiCurrent: false, townCurrent: false, mediaListingEvidence: false, aliasEvidence: false, latestFactEvidence: false, latestFactDate: null, latestSuccessfulImportDate: null, latestSuccessfulImportBatchId: null, reasons: [] }; map.set(key, existing); return existing; };
  for (const row of listings) { const e = ensure(row.castId, row.storeId); e.mediaListingEvidence = true; e.reasons.push("MediaListing.isListed=true（補足）"); }
  for (const row of aliases) if (row.castId && row.storeId) { const e = ensure(row.castId, row.storeId); e.aliasEvidence = true; e.reasons.push("Alias.validTo=NULL（補足）"); }
  for (const row of currentRows) { const e = ensure(row.castId, row.storeId); const key = `${row.source}:${row.storeId}`; if (latestDataset.get(key) === row.datasetDate.getTime()) { e.latestFactEvidence = true; e.latestSuccessfulImportDate = row.datasetDate; e.latestSuccessfulImportBatchId = row.batchId; e.latestFactDate = !e.latestFactDate || row.date > e.latestFactDate ? row.date : e.latestFactDate; const label = `${row.source === "CTI" ? "CTI" : "Town CAST"}最新Dataset ${row.datasetDate.toISOString().slice(0, 10)}`; e.reasons.push(label); if (row.source === "CTI") e.ctiCurrent = true; else e.townCurrent = true; } }
  for (const row of heaven) if (row.castId) { const e = ensure(row.castId, row.storeId); e.reasons.push("Heaven累計Fact（補足・自動初期化対象外）"); }
  const results: CurrentMembershipCandidate[] = [];
  for (const cast of casts) for (const store of stores) { const evidence = map.get(`${cast.id}:${store.id}`) ?? { ctiCurrent: false, townCurrent: false, mediaListingEvidence: false, aliasEvidence: false, latestFactEvidence: false, latestFactDate: null, latestSuccessfulImportDate: null, latestSuccessfulImportBatchId: null, reasons: [] }; const current = cast.memberships.find((m) => m.storeId === store.id); const decision = classifyCurrentMembershipDecision({ castStatus: cast.status, displayName: cast.displayName, membershipStatus: current?.status, evidence }); results.push({ castId: cast.id, storeId: store.id, displayName: cast.displayName, storeName: store.shortName, evidence, decision }); }
  return results;
}
