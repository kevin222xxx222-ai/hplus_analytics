import { loadShadowReadData, summarizeHistoricalShadow, summarizeShadowSnapshot } from "@/lib/casts/shadow-read-audit";
import { prisma } from "@/lib/prisma";

async function main() {
  const { casts, stores } = await loadShadowReadData();
  const currentDate = new Date();
  const summary = summarizeShadowSnapshot(casts, stores, currentDate);
  const from = new Date(process.env.SHADOW_AUDIT_FROM || "2026-04-01T00:00:00.000Z");
  const historical = summarizeHistoricalShadow(casts, stores, from, currentDate);
  console.log("Cast Membership Shadow Audit: READ-ONLY");
  console.log(`snapshot: ${currentDate.toISOString().slice(0, 10)}`);
  console.log(`casts: ${summary.castTotal}`);
  console.log(`casts with memberships: ${summary.membershipCastTotal}`);
  console.log(`casts without memberships: ${summary.noMembershipCastTotal}`);
  console.log(`ACTIVE memberships: ${summary.activeMembershipTotal}`);
  console.log(`ON_LEAVE memberships: ${summary.onLeaveMembershipTotal}`);
  console.log(`LEFT memberships: ${summary.leftMembershipTotal}`);
  console.log(`multi-store ACTIVE casts: ${summary.multiStoreActiveCastTotal}`);
  console.log(`Legacy ACTIVE: ${summary.legacyActiveTotal}`);
  console.log(`Legacy INACTIVE: ${summary.legacyInactiveTotal}`);
  console.log(`difference cells: ${summary.differences.length}`);
  console.log(`difference counts: ${JSON.stringify(summary.differenceCounts)}`);
  console.log(`historical range: ${from.toISOString().slice(0, 10)}..${currentDate.toISOString().slice(0, 10)}`);
  console.log(`historical cells: ${historical.cells}`);
  console.log(`historical difference counts: ${JSON.stringify(historical.differenceCounts)}`);
  for (const item of summary.differences.slice(0, 50)) console.log(`${item.classification}\t${item.cast.displayName}\t${item.store.shortName}`);
  if (summary.differences.length > 50) console.log(`... ${summary.differences.length - 50} more differences`);
  console.log("No Cast, Membership, Alias, Listing, Fact, or Import rows were changed.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
