import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadGapApplyPreview, loadMembershipGapAudit, validateGapApplyPreview } from "@/lib/casts/membership-gap-audit";
import { prisma } from "@/lib/prisma";

async function main() {
  const audit = await loadMembershipGapAudit();
  const applyPreview = await loadGapApplyPreview();
  const currentEvidenceCastIds = new Set(audit.noMembership.filter((item) => item.category === "CURRENT_MEDIA_EVIDENCE").map((item) => item.castId));
  const validation = validateGapApplyPreview(applyPreview, currentEvidenceCastIds);
  const create = applyPreview.filter((row) => row.action === "CREATE_ACTIVE");
  const uniqueCreateCasts = new Set(create.map((row) => row.castId));
  const sourceCounts = { townOnly: create.filter((row) => row.sources.length === 1 && row.sources[0] === "TOWN_CAST").length, ctiOnly: create.filter((row) => row.sources.length === 1 && row.sources[0] === "CTI").length, both: create.filter((row) => row.sources.length === 2).length };
  const storeCounts = create.reduce<Record<string, number>>((counts, row) => ({ ...counts, [row.storeName]: (counts[row.storeName] ?? 0) + 1 }), {});
  const reviewReasons = applyPreview.filter((row) => row.action === "REVIEW_REQUIRED").flatMap((row) => row.reviewReasons).reduce<Record<string, number>>((counts, reason) => ({ ...counts, [reason]: (counts[reason] ?? 0) + 1 }), {});
  const reviewReasonCasts = applyPreview.filter((row) => row.action === "REVIEW_REQUIRED").reduce<Record<string, Set<string>>>((counts, row) => { for (const reason of row.reviewReasons) (counts[reason] ??= new Set()).add(row.castId); return counts; }, {});
  const reviewReasonCastCounts = Object.fromEntries(Object.entries(reviewReasonCasts).map(([reason, casts]) => [reason, casts.size]));
  const report = { generatedAt: new Date().toISOString(), mode: "READ_ONLY", summary: { noMembership: audit.noMembership.length, noMembershipCounts: audit.noMembershipCounts, legacyActiveMembershipInactiveCells: audit.legacyActiveMembershipInactive.length, legacyActiveMembershipInactiveCasts: audit.legacyActiveMembershipInactiveCastCount, primaryStoreStale: audit.primaryStoreStale.length, differenceCounts: audit.shadowSummary.differenceCounts, gapApply: { castCount: uniqueCreateCasts.size, candidateCount: create.length, sourceCounts, storeCounts, reentryReview: applyPreview.filter((row) => row.action === "REENTRY_REVIEW").length, reviewRequired: applyPreview.filter((row) => row.action === "REVIEW_REQUIRED").length, reviewReasons, reviewReasonCastCounts, validation, currentEvidence: validation.currentEvidence60, strongDatasetExcluded: validation.strongDatasetExcluded } }, noMembership: audit.noMembership, gapApply: applyPreview, legacyActiveMembershipInactive: audit.legacyActiveMembershipInactive.map((item) => ({ castId: item.cast.id, displayName: item.cast.displayName, storeId: item.store.id, storeName: item.store.shortName, classification: item.classification, memberships: item.cast.memberships })), primaryStoreStale: audit.primaryStoreStale.map((item) => ({ castId: item.cast.id, displayName: item.cast.displayName, storeId: item.store.id, storeName: item.store.shortName })) };
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
  console.log("Gap Apply Preview: READ-ONLY");
  console.log(`CREATE_ACTIVE Cast: ${uniqueCreateCasts.size}, Cast×Store: ${create.length}`);
  console.log(`Evidence: Town only ${sourceCounts.townOnly}, CTI only ${sourceCounts.ctiOnly}, Town + CTI ${sourceCounts.both}`);
  console.log(`Stores: ${JSON.stringify(storeCounts)}`);
  console.log(`Excluded: REENTRY_REVIEW ${report.summary.gapApply.reentryReview}, REVIEW_REQUIRED ${report.summary.gapApply.reviewRequired}`);
  console.log(`REVIEW_REQUIRED reasons: ${JSON.stringify(reviewReasons)}`);
  console.log(`REVIEW_REQUIRED Cast counts: ${JSON.stringify(reviewReasonCastCounts)}`);
  console.log(`Current Evidence ${validation.currentEvidenceCastCount}: ${JSON.stringify(validation.currentEvidence60)}`);
  console.log(`Strong Dataset Casts: ${validation.strongDatasetCastCount}, excluded from CREATE_ACTIVE: ${JSON.stringify(validation.strongDatasetExcluded)}`);
  console.log(`Validation: ${validation.valid ? "PASS" : `FAIL (${validation.errors.join("; ")})`}`);
  console.log(`report: ${reportPath}`);
  console.log("No Membership, Cast, Alias, Listing, Fact, or Import rows were changed.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
