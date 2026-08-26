import { prisma } from "@/lib/prisma";
import { applyTownStoreGapMemberships, loadTownStoreGapApplyPreview } from "@/lib/casts/store-gap-apply";

async function main() {
  const preview = await loadTownStoreGapApplyPreview();
  const rows = preview.rows;
  const casts = await prisma.cast.findMany({ where: { id: { in: rows.map((row) => row.castId) } }, select: { id: true, memberships: { select: { storeId: true, status: true } } } });
  const membershipsByCast = new Map(casts.map((cast) => [cast.id, cast.memberships]));
  const exclusionCounts = preview.exclusions.reduce<Record<string, number>>((counts, row) => { counts[row.reason] = (counts[row.reason] ?? 0) + 1; return counts; }, {});
  console.log(JSON.stringify({ mode: "READ_ONLY_PREVIEW", store: preview.store.shortName, createActive: rows.length, evaluatedTownCurrent: preview.evaluatedTownCurrent, targetActiveExists: preview.targetActiveExists, targetOnLeaveExists: preview.targetOnLeaveExists, targetLeftExists: preview.targetLeftExists, exclusionCounts, predicateRows: preview.predicateRows, exclusions: preview.exclusions, candidates: rows.map((row) => ({ castId: row.castId, displayName: row.displayName, store: row.storeName, townDatasetDate: row.townLatestDatasetDate, townBatchId: row.townImportBatchId, targetStoreMembership: (membershipsByCast.get(row.castId) ?? []).filter((membership) => membership.storeId === row.storeId), otherStoreMemberships: (membershipsByCast.get(row.castId) ?? []).filter((membership) => membership.storeId !== row.storeId), classification: row.classification, plannedAction: "CREATE_ACTIVE" })) }, null, 2));
  const confirmed = process.argv.includes("--confirm=CONFIRM");
  const enabled = process.env.MEMBERSHIP_STORE_GAP_APPLY_ENABLED === "true";
  if (!confirmed || !enabled) {
    console.log("READ-ONLY preview. Apply requires --confirm=CONFIRM and MEMBERSHIP_STORE_GAP_APPLY_ENABLED=true.");
    return;
  }
  const result = await applyTownStoreGapMemberships(rows.map((row) => ({ castId: row.castId, storeId: row.storeId })), "CONFIRM");
  console.log(JSON.stringify({ mode: "APPLIED", created: result.created.length, skipped: result.skipped.length }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
