import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadStoreScopeAudit } from "@/lib/casts/store-scope-audit";
import { prisma } from "@/lib/prisma";

async function main() {
  const audit = await loadStoreScopeAudit();
  const report = { mode: "READ_ONLY", generatedAt: audit.generatedAt.toISOString(), summary: { legacyActiveMembershipInactive: audit.validation.legacyTotal, legacyClassification: audit.legacyCounts, primaryStoreDifferenceCells: audit.validation.primaryTotal, primaryStoreCastClassification: audit.primaryCounts, strongMembershipFree: audit.validation.strongMembershipFree, createActive: audit.validation.createActive, validation: audit.validation }, legacyRows: audit.legacyRows, primaryRows: audit.primaryRows };
  const dir = path.join(process.cwd(), "artifacts", "audits");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `store-scope-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}.json`);
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("Store Scope Audit: READ-ONLY");
  console.log(`LEGACY_ACTIVE_MEMBERSHIP_INACTIVE: ${audit.validation.legacyTotal}`);
  console.log(`Legacy classification: ${JSON.stringify(audit.legacyCounts)}`);
  console.log(`PRIMARY_STORE_DIFFERENCE cells: ${audit.validation.primaryTotal}`);
  console.log(`Primary Store Cast classification: ${JSON.stringify(audit.primaryCounts)}`);
  console.log(`Membership-free Strong Dataset: ${audit.validation.strongMembershipFree}`);
  console.log(`CREATE_ACTIVE: ${audit.validation.createActive}`);
  console.log(`Validation: ${audit.validation.legacyExclusive && audit.validation.otherLegacy === 0 ? "PASS" : "REVIEW_REQUIRED"}`);
  console.log(`artifact: ${file}`);
  console.log("No Production rows were changed.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
