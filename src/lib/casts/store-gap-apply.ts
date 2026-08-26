import { CastMembershipStatus, CastMembershipSourceConfidence, CastStatus, StoreCode, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { loadGapApplyPreview, type GapApplyCandidate } from "@/lib/casts/membership-gap-audit";

export type StoreGapApplyCandidate = GapApplyCandidate & { classification: "CURRENT_STORE_MEMBERSHIP_MISSING" };

export function selectTownStoreGapCandidates(rows: GapApplyCandidate[], targetStoreId: string): StoreGapApplyCandidate[] {
  return rows.filter((row) => row.storeId === targetStoreId && row.action === "CREATE_ACTIVE" && row.decision === "CREATE_ACTIVE" && row.townCurrent && row.existingMembershipCount === 0 && row.legacyStatus === CastStatus.ACTIVE && !row.displayNameRetiredMarker && !row.legacyConflict)
    .map((row) => ({ ...row, classification: "CURRENT_STORE_MEMBERSHIP_MISSING" as const }));
}

async function lock(db: Prisma.TransactionClient, castId: string) {
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cast-membership-gap:${castId}`})) IS NULL AS locked`;
}

export async function loadTownStoreGapApplyPreview(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const store = await db.store.findFirst({ where: { code: StoreCode.KOSHIGAYA, isActive: true }, select: { id: true, shortName: true, code: true } });
  if (!store) throw new Error("越谷Storeが見つかりません。");
  const rows = selectTownStoreGapCandidates(await loadGapApplyPreview(db), store.id);
  return { store, rows };
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
