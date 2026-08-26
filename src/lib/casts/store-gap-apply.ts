import { CastMembershipStatus, CastMembershipSourceConfidence, CastStatus, StoreCode, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { loadGapApplyPreview, type GapApplyCandidate } from "@/lib/casts/membership-gap-audit";

export type StoreGapApplyCandidate = GapApplyCandidate & { classification: "CURRENT_STORE_MEMBERSHIP_MISSING" };
export type StoreGapApplyExclusion = { castId: string; displayName: string; storeId: string; reason: "TARGET_ACTIVE" | "TARGET_ON_LEAVE" | "TARGET_LEFT_REENTRY" | "LEGACY_INACTIVE" | "RETIRED_MARKER" | "LEGACY_CONFLICT" | "NO_TOWN_CURRENT" | "OTHER" };
export type StoreGapPredicateRow = { castId: string; displayName: string; storeId: string; townCurrent: boolean; targetActive: boolean; targetOnLeave: boolean; targetLeft: boolean; legacyActive: boolean; retiredMarker: boolean; legacyConflict: boolean; sourceEvidence: boolean; existingMembershipCount: number; otherStoreMembershipCount: number; decision: string; classification: string; plannedAction: "CREATE_ACTIVE" | "NOOP" | "REENTRY_REVIEW" | "REVIEW_REQUIRED"; failedPredicates: string[]; rawDecisionInputs: Record<string, boolean | number | string | null> };

export function selectTownStoreGapCandidates(rows: GapApplyCandidate[], targetStoreId: string, targetMembershipStatuses = new Map<string, CastMembershipStatus[]>): StoreGapApplyCandidate[] {
  return rows.filter((row) => {
    const statuses = targetMembershipStatuses.get(row.castId) ?? [];
    return row.storeId === targetStoreId && row.townCurrent && !statuses.includes(CastMembershipStatus.ACTIVE) && !statuses.includes(CastMembershipStatus.ON_LEAVE) && !statuses.includes(CastMembershipStatus.LEFT) && row.legacyStatus === CastStatus.ACTIVE && !row.displayNameRetiredMarker && !row.legacyConflict;
  })
    .map((row) => ({ ...row, classification: "CURRENT_STORE_MEMBERSHIP_MISSING" as const }));
}

async function lock(db: Prisma.TransactionClient, castId: string) {
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cast-membership-gap:${castId}`})) IS NULL AS locked`;
}

export async function loadTownStoreGapApplyPreview(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const store = await db.store.findFirst({ where: { code: StoreCode.KOSHIGAYA, isActive: true }, select: { id: true, shortName: true, code: true } });
  if (!store) throw new Error("越谷Storeが見つかりません。");
  const allRows = await loadGapApplyPreview(db);
  const relevant = allRows.filter((row) => row.storeId === store.id);
  const memberships = await db.castStoreMembership.findMany({ where: { castId: { in: relevant.map((row) => row.castId) }, storeId: store.id }, select: { castId: true, status: true } });
  const targetStatuses = new Map<string, CastMembershipStatus[]>();
  for (const membership of memberships) targetStatuses.set(membership.castId, [...(targetStatuses.get(membership.castId) ?? []), membership.status]);
  const rows = selectTownStoreGapCandidates(relevant, store.id, targetStatuses);
  const predicateRows: StoreGapPredicateRow[] = relevant.map((row) => {
    const statuses = targetStatuses.get(row.castId) ?? [];
    const targetActive = statuses.includes(CastMembershipStatus.ACTIVE);
    const targetOnLeave = statuses.includes(CastMembershipStatus.ON_LEAVE);
    const targetLeft = statuses.includes(CastMembershipStatus.LEFT);
    const legacyActive = row.legacyStatus === CastStatus.ACTIVE;
    const failedPredicates = [!row.townCurrent ? "townCurrent" : null, targetActive ? "targetActive" : null, targetOnLeave ? "targetOnLeave" : null, targetLeft ? "targetLeft" : null, !legacyActive ? "legacyActive" : null, row.displayNameRetiredMarker ? "retiredMarker" : null, row.legacyConflict ? "legacyConflict" : null].filter((value): value is string => Boolean(value));
    const plannedAction: StoreGapPredicateRow["plannedAction"] = failedPredicates.length === 0 ? "CREATE_ACTIVE" : targetLeft ? "REENTRY_REVIEW" : targetActive || targetOnLeave ? "NOOP" : "REVIEW_REQUIRED";
    return { castId: row.castId, displayName: row.displayName, storeId: row.storeId, townCurrent: row.townCurrent, targetActive, targetOnLeave, targetLeft, legacyActive, retiredMarker: row.displayNameRetiredMarker, legacyConflict: row.legacyConflict, sourceEvidence: row.townCurrent || row.ctiCurrent, existingMembershipCount: row.existingMembershipCount, otherStoreMembershipCount: Math.max(0, row.existingMembershipCount - statuses.length), decision: row.decision, classification: row.action, plannedAction, failedPredicates, rawDecisionInputs: { townCurrent: row.townCurrent, targetActive, targetOnLeave, targetLeft, legacyActive, retiredMarker: row.displayNameRetiredMarker, legacyConflict: row.legacyConflict, sourceEvidence: row.townCurrent || row.ctiCurrent, existingMembershipCount: row.existingMembershipCount, otherStoreMembershipCount: Math.max(0, row.existingMembershipCount - statuses.length) } };
  });
  const exclusions: StoreGapApplyExclusion[] = predicateRows.filter((row) => row.plannedAction !== "CREATE_ACTIVE").map((row) => ({ castId: row.castId, displayName: row.displayName, storeId: row.storeId, reason: row.targetActive ? "TARGET_ACTIVE" : row.targetOnLeave ? "TARGET_ON_LEAVE" : row.targetLeft ? "TARGET_LEFT_REENTRY" : !row.townCurrent ? "NO_TOWN_CURRENT" : !row.legacyActive ? "LEGACY_INACTIVE" : row.retiredMarker ? "RETIRED_MARKER" : row.legacyConflict ? "LEGACY_CONFLICT" : "OTHER" }));
  return { store, rows, predicateRows, evaluatedTownCurrent: relevant.filter((row) => row.townCurrent).length, targetActiveExists: relevant.filter((row) => (targetStatuses.get(row.castId) ?? []).includes(CastMembershipStatus.ACTIVE)).length, targetOnLeaveExists: relevant.filter((row) => (targetStatuses.get(row.castId) ?? []).includes(CastMembershipStatus.ON_LEAVE)).length, targetLeftExists: relevant.filter((row) => (targetStatuses.get(row.castId) ?? []).includes(CastMembershipStatus.LEFT)).length, exclusions };
}

export async function applyTownStoreGapMemberships(keys: Array<{ castId: string; storeId: string }>, confirmation: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  if (confirmation !== "CONFIRM") throw new Error("Store Gap ApplyにはCONFIRMの明示確認が必要です。");
  if (!keys.length) return { created: [], skipped: [] as string[] };
  return db.$transaction(async (tx) => {
    const latest = await loadTownStoreGapApplyPreview(tx);
    const selectedKeys = new Set(keys.map((key) => `${key.castId}:${key.storeId}`));
    const selected = latest.rows.filter((row) => selectedKeys.has(`${row.castId}:${row.storeId}`));
    if (selected.length !== selectedKeys.size) throw new Error("Apply対象のEvidenceが変化しました。再Previewしてください。");
    for (const row of selected) await lock(tx, row.castId);
    const created: string[] = [];
    const skipped: string[] = [];
    for (const row of selected) {
      const existing = await tx.castStoreMembership.findMany({ where: { castId: row.castId, storeId: row.storeId }, select: { status: true } });
      if (existing.some((membership) => membership.status === CastMembershipStatus.LEFT)) throw new Error("LEFT Membershipは自動再入店せずReviewへ送ります。");
      if (existing.some((membership) => membership.status === CastMembershipStatus.ACTIVE || membership.status === CastMembershipStatus.ON_LEAVE)) { skipped.push(row.castId); continue; }
      const membership = await tx.castStoreMembership.create({ data: { castId: row.castId, storeId: row.storeId, status: CastMembershipStatus.ACTIVE, joinedAt: null, leftAt: null, source: "MEDIA_EVIDENCE_GAP_RESOLUTION", sourceConfidence: CastMembershipSourceConfidence.CONFIRMED } });
      created.push(membership.id);
    }
    return { created, skipped };
  });
}
