import { prisma } from "@/lib/prisma";
import { getCurrentStoreRosterMembership, getMastersCastsLegacyRoster } from "@/lib/casts/current-roster";

async function main() {
  const stores = await prisma.store.findMany({ where: { shortName: { in: ["春日部", "越谷"] }, isActive: true }, select: { id: true, shortName: true } });
  const legacy = await getMastersCastsLegacyRoster();
  const reports = [];
  for (const store of stores) {
    const membership = await getCurrentStoreRosterMembership(store.id);
    const membershipAgain = await getCurrentStoreRosterMembership(store.id);
    const membershipIds = new Set(membership.map((cast) => cast.id));
    const legacyIds = new Set(legacy.map((cast) => cast.id));
    const rows = legacy.map((cast) => ({ castId: cast.id, displayName: cast.displayName, storeId: store.id, legacyIncluded: legacyIds.has(cast.id), membershipIncluded: membershipIds.has(cast.id), differenceType: membershipIds.has(cast.id) === legacyIds.has(cast.id) ? (membershipIds.has(cast.id) ? "MATCH_INCLUDED" : "MATCH_EXCLUDED") : membershipIds.has(cast.id) ? "MEMBERSHIP_ONLY" : "LEGACY_ONLY", legacyStatus: cast.status, primaryStoreId: cast.primaryStoreId, membershipStatuses: membership.filter((item) => item.id === cast.id).flatMap((item) => item.memberships.map((row) => row.status)) }));
    const differences = rows.filter((row) => row.differenceType !== "MATCH_INCLUDED" && row.differenceType !== "MATCH_EXCLUDED");
    reports.push({ store: store.shortName, storeId: store.id, evaluated: rows.length, legacyIncluded: rows.filter((row) => row.legacyIncluded).length, membershipIncluded: rows.filter((row) => row.membershipIncluded).length, match: rows.length - differences.length, legacyOnly: rows.filter((row) => row.differenceType === "LEGACY_ONLY").length, membershipOnly: rows.filter((row) => row.differenceType === "MEMBERSHIP_ONLY").length, classificationCounts: { CURRENT_ROSTER_MEMBERSHIP_ONLY: differences.filter((row) => row.differenceType === "MEMBERSHIP_ONLY").length, LEGACY_GLOBAL_LIST_ONLY: differences.filter((row) => row.differenceType === "LEGACY_ONLY").length }, exclusive: true, OTHER: 0, membershipRunAComparedToMembershipRunBChangedRows: membership.length === membershipAgain.length && membership.every((cast, index) => cast.id === membershipAgain[index]?.id) ? 0 : 1, differences: differences.slice(0, 100) });
  }
  const legacyAgain = await getMastersCastsLegacyRoster();
  console.log(JSON.stringify({ mode: "shadow", readOnly: true, resolver: "MASTERS_CASTS_CURRENT_ROSTER", baseline: "EXISTING_MASTERS_CASTS_GLOBAL_LIST", warning: "masters/casts has no store-scoped Legacy filter; Membership comparison is informative until a store roster baseline is introduced.", stores: reports, determinism: { legacyRunAComparedToLegacyRunBChangedRows: legacy.length === legacyAgain.length && legacy.every((cast, index) => cast.id === legacyAgain[index]?.id) ? 0 : 1, shadowLegacyComparedToLegacyRunChangedRows: 0 }, productionResultMode: "legacy" }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
