import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { classifyCastForMembershipBackfill, summarizeBackfillAudit, type BackfillAuditCast } from "@/lib/casts/membership-backfill-audit";

type EvidenceMap = Map<string, { storeIds: Set<string>; sourceKinds: Set<string>; dateRanges: Array<{ sourceKind: string; storeId: string | null; from: Date | null; to: Date | null }> }>;

function addEvidence(map: EvidenceMap, castId: string | null, storeId: string | null, sourceKind: string, from: Date | null = null, to: Date | null = null) {
  if (!castId) return;
  const current = map.get(castId) ?? { storeIds: new Set<string>(), sourceKinds: new Set<string>(), dateRanges: [] };
  if (storeId) current.storeIds.add(storeId);
  current.sourceKinds.add(sourceKind);
  current.dateRanges.push({ sourceKind, storeId, from, to });
  map.set(castId, current);
}

function timestamp() {
  const now = new Date();
  return now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

async function main() {
  const trustedLegacyDates = process.env.MEMBERSHIP_BACKFILL_TRUST_LEGACY_DATES === "true";
  const [casts, aliases, listings, ctiFacts, townFacts, heavenFacts] = await Promise.all([
    prisma.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, status: true, startedOn: true, endedOn: true, primaryStoreId: true, memberships: { select: { id: true } } } }),
    prisma.castAlias.findMany({ where: { castId: { not: null } }, select: { castId: true, storeId: true, validFrom: true, validTo: true } }),
    prisma.mediaListing.findMany({ select: { castId: true, storeId: true, listedFrom: true, listedTo: true } }),
    prisma.ctiCastDaily.findMany({ select: { castId: true, storeId: true, businessDate: true } }),
    prisma.townCastDaily.findMany({ select: { castId: true, storeId: true, date: true } }),
    prisma.heavenCastDaily.findMany({ where: { castId: { not: null } }, select: { castId: true, storeId: true, businessDate: true } }),
  ]);

  const evidence: EvidenceMap = new Map();
  for (const cast of casts) addEvidence(evidence, cast.id, cast.primaryStoreId, "PRIMARY_STORE");
  for (const row of aliases) addEvidence(evidence, row.castId, row.storeId, "ALIAS", row.validFrom, row.validTo);
  for (const row of listings) addEvidence(evidence, row.castId, row.storeId, "MEDIA_LISTING", row.listedFrom, row.listedTo);
  for (const row of ctiFacts) addEvidence(evidence, row.castId, row.storeId, "CTI_FACT", row.businessDate, row.businessDate);
  for (const row of townFacts) addEvidence(evidence, row.castId, row.storeId, "TOWN_FACT", row.date, row.date);
  for (const row of heavenFacts) addEvidence(evidence, row.castId, row.storeId, "HEAVEN_FACT", row.businessDate, row.businessDate);

  const inputs: BackfillAuditCast[] = casts.map((cast) => {
    const item = evidence.get(cast.id) ?? { storeIds: new Set<string>(), sourceKinds: new Set<string>(), dateRanges: [] };
    return { id: cast.id, displayName: cast.displayName, status: cast.status, startedOn: cast.startedOn, endedOn: cast.endedOn, primaryStoreId: cast.primaryStoreId, membershipCount: cast.memberships.length, evidence: { storeIds: [...item.storeIds].sort(), sourceKinds: [...item.sourceKinds].sort(), dateRanges: item.dateRanges } };
  });
  const results = inputs.map((input) => classifyCastForMembershipBackfill(input, trustedLegacyDates));
  const summary = summarizeBackfillAudit(results);
  const report = { generatedAt: new Date().toISOString(), mode: "DRY_RUN", trustedLegacyDates, summary, results };
  const reportDir = path.join(process.cwd(), "artifacts", "audits");
  const reportPath = path.join(reportDir, `cast-membership-backfill-${timestamp()}.json`);
  await mkdir(reportDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Cast membership backfill audit: DRY-RUN");
  console.log(`total casts: ${summary.totalCasts}`);
  console.log(`safeAuto: ${summary.safeAuto}`);
  console.log(`safeLeft: ${summary.safeLeft}`);
  console.log(`multiStore: ${summary.multiStore}`);
  console.log(`dateUncertain: ${summary.dateUncertain}`);
  console.log(`storeUncertain: ${summary.storeUncertain}`);
  console.log(`alreadyMigrated: ${summary.alreadyMigrated}`);
  console.log(`report: ${reportPath}`);
  console.log("No Membership rows were created or updated.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
