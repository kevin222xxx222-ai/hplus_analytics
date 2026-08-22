import { CastMembershipStatus, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;
export type CurrentEvidence = { mediaListingEvidence: boolean; aliasEvidence: boolean; latestFactEvidence: boolean; latestFactDate: Date | null; latestSuccessfulImportDate: Date | null; reasons: string[] };
export type CurrentMembershipCandidate = { castId: string; storeId: string; displayName: string; storeName: string; evidence: CurrentEvidence; decision: "CREATE_ACTIVE" | "NOOP" | "ON_LEAVE_REVIEW" | "REENTRY_REVIEW" | "NO_EVIDENCE" };

export async function loadCurrentMembershipCandidates(db: DbClient = prisma): Promise<CurrentMembershipCandidate[]> {
  const [casts, stores, aliases, listings, cti, town, heaven] = await Promise.all([
    db.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, memberships: { select: { storeId: true, status: true } } } }),
    db.store.findMany({ where: { isActive: true }, select: { id: true, shortName: true } }),
    db.castAlias.findMany({ where: { castId: { not: null }, validTo: null }, select: { castId: true, storeId: true } }),
    db.mediaListing.findMany({ where: { isListed: true }, select: { castId: true, storeId: true } }),
    db.ctiCastDaily.groupBy({ by: ["castId", "storeId"], _max: { businessDate: true } }),
    db.townCastDaily.groupBy({ by: ["castId", "storeId"], _max: { date: true } }),
    db.heavenCastDaily.groupBy({ by: ["castId", "storeId"], where: { castId: { not: null } }, _max: { businessDate: true } }),
  ]);
  const latestByStore = new Map<string, number>();
  const factRows = [...cti.map((r) => ({ castId: r.castId, storeId: r.storeId, date: r._max.businessDate })), ...town.map((r) => ({ castId: r.castId, storeId: r.storeId, date: r._max.date })), ...heaven.map((r) => ({ castId: r.castId, storeId: r.storeId, date: r._max.businessDate }))];
  for (const row of factRows) if (row.date) latestByStore.set(row.storeId, Math.max(latestByStore.get(row.storeId) ?? 0, row.date.getTime()));
  const map = new Map<string, CurrentEvidence>();
  const ensure = (castId: string, storeId: string) => { const key = `${castId}:${storeId}`; const existing = map.get(key) ?? { mediaListingEvidence: false, aliasEvidence: false, latestFactEvidence: false, latestFactDate: null, latestSuccessfulImportDate: null, reasons: [] }; map.set(key, existing); return existing; };
  for (const row of listings) if (row.castId && row.storeId) { const e = ensure(row.castId, row.storeId); e.mediaListingEvidence = true; e.reasons.push("MediaListing.isListed=true"); }
  for (const row of aliases) if (row.castId && row.storeId) { const e = ensure(row.castId, row.storeId); e.aliasEvidence = true; e.reasons.push("Alias.validTo=NULL"); }
  for (const row of factRows) if (row.castId && row.storeId && row.date) { const e = ensure(row.castId, row.storeId); e.latestFactDate = !e.latestFactDate || row.date > e.latestFactDate ? row.date : e.latestFactDate; if (latestByStore.get(row.storeId) === row.date.getTime()) { e.latestFactEvidence = true; e.reasons.push("最新媒体実績"); } }
  const results: CurrentMembershipCandidate[] = [];
  for (const cast of casts) for (const store of stores) { const evidence = map.get(`${cast.id}:${store.id}`) ?? { mediaListingEvidence: false, aliasEvidence: false, latestFactEvidence: false, latestFactDate: null, latestSuccessfulImportDate: null, reasons: [] }; const current = cast.memberships.find((m) => m.storeId === store.id); const hasEvidence = evidence.mediaListingEvidence || evidence.aliasEvidence || evidence.latestFactEvidence; const decision = current?.status === CastMembershipStatus.ACTIVE ? "NOOP" : current?.status === CastMembershipStatus.ON_LEAVE ? "ON_LEAVE_REVIEW" : current?.status === CastMembershipStatus.LEFT && hasEvidence ? "REENTRY_REVIEW" : hasEvidence ? "CREATE_ACTIVE" : "NO_EVIDENCE"; results.push({ castId: cast.id, storeId: store.id, displayName: cast.displayName, storeName: store.shortName, evidence, decision }); }
  return results;
}
