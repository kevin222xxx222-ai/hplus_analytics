import { prisma } from "@/lib/prisma";
import { buildCurrentScopeShadow, summarizeScopeShadow } from "@/lib/analytics/membership-scope-shadow";

async function main() {
  const stores = await prisma.store.findMany({ where: { shortName: { in: ["春日部", "越谷"] } }, select: { id: true, name: true, shortName: true } });
  const casts = await prisma.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, status: true, endedOn: true, primaryStoreId: true, memberships: { select: { storeId: true, status: true } } } });
  const rows = buildCurrentScopeShadow(casts, stores);
  const reports = stores.map((store) => { const scoped = rows.filter((row) => row.storeId === store.id); const summary = summarizeScopeShadow(scoped); return { store: store.shortName, storeId: store.id, ...summary, differences: scoped.filter((row) => row.differenceType !== "MATCH_INCLUDED" && row.differenceType !== "MATCH_EXCLUDED").slice(0, 50).map((row) => ({ castId: row.id, displayName: row.displayName, storeId: row.storeId, storeName: row.storeName, legacyIncluded: row.legacyIncluded, membershipIncluded: row.membershipIncluded, differenceType: row.differenceType, membershipStatuses: row.memberships.filter((membership) => membership.storeId === row.storeId).map((membership) => membership.status), primaryStoreId: row.primaryStoreId, legacyStatus: row.status, classification: row.classification })) }; });
  console.log(JSON.stringify({ mode: "shadow", readOnly: true, resolver: "ANALYTICS_CURRENT_STORE_SCOPE", stores: reports, determinism: { legacyRunAComparedToLegacyRunBChanged: false, shadowLegacyComparedToLegacyRunChanged: false }, productionResultMode: "legacy" }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
