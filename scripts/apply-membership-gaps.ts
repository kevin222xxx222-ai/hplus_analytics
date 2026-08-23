import { applyGapMemberships, loadGapApplyPreview } from "@/lib/casts/membership-gap-audit";
import { prisma } from "@/lib/prisma";

async function main() {
  const confirmed = process.argv.includes("--confirm=CONFIRM");
  const enabled = process.env.MEMBERSHIP_GAP_APPLY_ENABLED === "true";
  const preview = await loadGapApplyPreview();
  const candidates = preview.filter((row) => row.action === "CREATE_ACTIVE");
  console.log(`Gap Apply candidates: ${candidates.length} Cast×Store (${new Set(candidates.map((row) => row.castId)).size} Cast)`);
  if (!confirmed || !enabled) {
    console.log("READ-ONLY preview. Apply requires --confirm=CONFIRM and MEMBERSHIP_GAP_APPLY_ENABLED=true.");
    return;
  }
  const result = await applyGapMemberships(candidates.map(({ castId, storeId }) => ({ castId, storeId })), "CONFIRM");
  console.log(`Gap Apply: created ${result.created.length} Membership rows.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
