import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadMembershipGapAudit } from "@/lib/casts/membership-gap-audit";
import { prisma } from "@/lib/prisma";

async function main() {
  const audit = await loadMembershipGapAudit();
  const report = { generatedAt: new Date().toISOString(), mode: "READ_ONLY", summary: { noMembership: audit.noMembership.length, noMembershipCounts: audit.noMembershipCounts, legacyActiveMembershipInactiveCells: audit.legacyActiveMembershipInactive.length, legacyActiveMembershipInactiveCasts: audit.legacyActiveMembershipInactiveCastCount, primaryStoreStale: audit.primaryStoreStale.length, differenceCounts: audit.shadowSummary.differenceCounts }, noMembership: audit.noMembership, legacyActiveMembershipInactive: audit.legacyActiveMembershipInactive.map((item) => ({ castId: item.cast.id, displayName: item.cast.displayName, storeId: item.store.id, storeName: item.store.shortName, classification: item.classification, memberships: item.cast.memberships })), primaryStoreStale: audit.primaryStoreStale.map((item) => ({ castId: item.cast.id, displayName: item.cast.displayName, storeId: item.store.id, storeName: item.store.shortName })) };
  const reportDir = path.join(process.cwd(), "artifacts", "audits");
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `membership-gap-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("Membership Gap Audit: READ-ONLY");
  console.log(`Membershipなし: ${audit.noMembership.length}`);
  console.log(`内訳: ${JSON.stringify(audit.noMembershipCounts)}`);
  console.log(`LEGACY_ACTIVE_MEMBERSHIP_INACTIVE cells: ${audit.legacyActiveMembershipInactive.length}`);
  console.log(`LEGACY_ACTIVE_MEMBERSHIP_INACTIVE casts: ${audit.legacyActiveMembershipInactiveCastCount}`);
  console.log(`PRIMARY_STORE_STALE: ${audit.primaryStoreStale.length}`);
  console.log(`report: ${reportPath}`);
  console.log("No Membership, Cast, Alias, Listing, Fact, or Import rows were changed.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
