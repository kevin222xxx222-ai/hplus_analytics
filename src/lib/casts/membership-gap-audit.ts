import { CastMembershipStatus, CastStatus, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { loadCurrentMembershipCandidates, type CurrentMembershipCandidate } from "@/lib/casts/current-membership-evidence";
import { summarizeShadowSnapshot, type ShadowCast, type ShadowStore } from "@/lib/casts/shadow-read-audit";

export type GapCategory = "CURRENT_MEDIA_EVIDENCE" | "LEGACY_ACTIVE_NO_CURRENT_MEDIA" | "LEGACY_INACTIVE" | "DISPLAY_NAME_RETIRED_MARKER" | "STORE_EVIDENCE_UNKNOWN" | "HISTORICAL_ONLY" | "MERGE_OR_DUPLICATE_CANDIDATE";

export type GapApplyCandidate = {
  castId: string;
  storeId: string;
  displayName: string;
  storeName: string;
  legacyStatus: CastStatus;
  sources: string[];
  datasets: Array<{ source: string; date: Date | null; batchId: string | null; fileName: string | null }>;
  action: "CREATE_ACTIVE" | "NOOP" | "REENTRY_REVIEW" | "REVIEW_REQUIRED";
};

export function classifyGapApplyAction(input: {
  membershipCount: number;
  currentMembershipStatus?: CastMembershipStatus;
  decision: CurrentMembershipCandidate["decision"];
  positiveEvidence: boolean;
}): GapApplyCandidate["action"] {
  if (input.membershipCount > 0) {
    return input.currentMembershipStatus === CastMembershipStatus.LEFT ? "REENTRY_REVIEW" : "NOOP";
  }
  return input.decision === "CREATE_ACTIVE" && input.positiveEvidence ? "CREATE_ACTIVE" : "REVIEW_REQUIRED";
}

export async function loadGapApplyPreview(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const candidates = await loadCurrentMembershipCandidates(db);
  const casts = await db.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, status: true, memberships: { select: { storeId: true, status: true } } } });
  const castMap = new Map(casts.map((cast) => [cast.id, cast]));
  const rows: GapApplyCandidate[] = candidates.map((candidate) => {
    const cast = castMap.get(candidate.castId)!;
    const current = cast.memberships.find((membership) => membership.storeId === candidate.storeId);
    const positive = candidate.evidence.ctiCurrent || candidate.evidence.townCurrent;
    const action = classifyGapApplyAction({ membershipCount: cast.memberships.length, currentMembershipStatus: current?.status, decision: candidate.decision, positiveEvidence: positive });
    return {
      castId: candidate.castId, storeId: candidate.storeId, displayName: candidate.displayName, storeName: candidate.storeName,
      legacyStatus: cast.status, sources: [candidate.evidence.townCurrent ? "TOWN_CAST" : null, candidate.evidence.ctiCurrent ? "CTI" : null].filter((value): value is string => Boolean(value)),
      datasets: [candidate.evidence.townDataset ? { source: "TOWN_CAST", date: candidate.evidence.townDataset.date, batchId: candidate.evidence.townDataset.batchId, fileName: candidate.evidence.townDataset.fileName } : null, candidate.evidence.ctiDataset ? { source: "CTI", date: candidate.evidence.ctiDataset.date, batchId: candidate.evidence.ctiDataset.batchId, fileName: candidate.evidence.ctiDataset.fileName } : null].filter((value): value is NonNullable<typeof value> => Boolean(value)),
      action,
    };
  });
  return rows;
}

export async function applyGapMemberships(candidateKeys: Array<{ castId: string; storeId: string }>, confirmation: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  if (confirmation !== "CONFIRM") throw new Error("Gap ApplyにはCONFIRMの明示確認が必要です。");
  return db.$transaction(async (tx) => {
    const latest = await loadGapApplyPreview(tx);
    const selectedKeys = new Set(candidateKeys.map((candidate) => `${candidate.castId}:${candidate.storeId}`));
    const selected = latest.filter((candidate) => selectedKeys.has(`${candidate.castId}:${candidate.storeId}`));
    if (selected.some((candidate) => candidate.action !== "CREATE_ACTIVE")) throw new Error("Preview後に候補状態が変化しました。再PreviewしてREVIEW/NOOPを確認してください。");
    const castIds = [...new Set(selected.map((candidate) => candidate.castId))].sort();
    for (const castId of castIds) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cast-membership-gap:${castId}`})) IS NULL AS locked`;
    const existingByCast = await tx.castStoreMembership.findMany({ where: { castId: { in: castIds } }, select: { castId: true } });
    if (existingByCast.length) throw new Error("Apply対象Castに既存Membershipがあります。自動再入店は行わずReviewへ送ります。");
    const created: string[] = [];
    for (const candidate of selected) {
      const row = await tx.castStoreMembership.create({ data: { castId: candidate.castId, storeId: candidate.storeId, status: CastMembershipStatus.ACTIVE, joinedAt: null, leftAt: null, source: "MEDIA_EVIDENCE_GAP_RESOLUTION", sourceConfidence: "CONFIRMED" } });
      created.push(row.id);
    }
    return { created };
  });
}

export async function loadMembershipGapAudit(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const [candidates, casts, stores, facts] = await Promise.all([
    loadCurrentMembershipCandidates(db),
    db.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, status: true, startedOn: true, endedOn: true, primaryStoreId: true, memberships: { select: { storeId: true, status: true, joinedAt: true, leftAt: true } }, aliases: { where: { validTo: null, reviewStatus: { not: "IGNORED" } }, select: { storeId: true, aliasName: true } }, mediaListings: { where: { isListed: true }, select: { storeId: true, mediaType: true } } } }),
    db.store.findMany({ where: { isActive: true }, select: { id: true, shortName: true } }),
    db.townCastDaily.findMany({ select: { castId: true, date: true } }),
  ]);
  const byCast = new Map<string, typeof candidates>();
  for (const candidate of candidates) byCast.set(candidate.castId, [...(byCast.get(candidate.castId) ?? []), candidate]);
  const factMax = new Map<string, Date>();
  for (const fact of facts) if (fact.castId && (!factMax.get(fact.castId) || fact.date > factMax.get(fact.castId)!)) factMax.set(fact.castId, fact.date);
  const noMembership = casts.filter((cast) => cast.memberships.length === 0).map((cast) => {
    const rows = byCast.get(cast.id) ?? [];
    const positive = rows.some((row) => row.evidence.ctiCurrent || row.evidence.townCurrent || row.evidence.mediaListingEvidence || row.evidence.aliasEvidence);
    const marker = /(?:退店|休業)/u.test(cast.displayName);
    const category: GapCategory = marker ? "DISPLAY_NAME_RETIRED_MARKER" : positive ? "CURRENT_MEDIA_EVIDENCE" : factMax.has(cast.id) ? "HISTORICAL_ONLY" : cast.status === CastStatus.INACTIVE ? "LEGACY_INACTIVE" : "LEGACY_ACTIVE_NO_CURRENT_MEDIA";
    return { castId: cast.id, displayName: cast.displayName, legacyStatus: cast.status, endedOn: cast.endedOn, primaryStoreId: cast.primaryStoreId, currentAliases: cast.aliases, currentListings: cast.mediaListings, evidence: rows.map((row) => ({ storeId: row.storeId, storeName: row.storeName, ctiCurrent: row.evidence.ctiCurrent, townCurrent: row.evidence.townCurrent, reasons: row.evidence.reasons })), factLatestDate: factMax.get(cast.id) ?? null, membershipCount: 0, category };
  });
  const shadowCasts = casts.map((cast) => ({ ...cast, memberships: cast.memberships.map((membership) => ({ ...membership })) })) as ShadowCast[];
  const shadowStores = stores as ShadowStore[];
  const shadow = summarizeShadowSnapshot(shadowCasts, shadowStores, new Date());
  const legacyActiveMembershipInactive = shadow.differences.filter((difference) => difference.classification === "LEGACY_ACTIVE_MEMBERSHIP_INACTIVE");
  const primaryStoreStale = shadow.differences.filter((difference) => difference.classification === "PRIMARY_STORE_DIFFERENCE" && difference.cast.primaryStoreId && !difference.cast.memberships.some((membership) => membership.storeId === difference.cast.primaryStoreId && membership.status !== CastMembershipStatus.LEFT));
  return { noMembership, noMembershipCounts: noMembership.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.category]: (counts[item.category] ?? 0) + 1 }), {}), legacyActiveMembershipInactive, legacyActiveMembershipInactiveCastCount: new Set(legacyActiveMembershipInactive.map((item) => item.cast.id)).size, primaryStoreStale, shadowSummary: shadow };
}
