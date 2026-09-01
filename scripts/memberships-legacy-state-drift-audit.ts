import { prisma } from "@/lib/prisma";
import { classifyLegacyStateDrift } from "@/lib/casts/legacy-state-drift";
async function main() {
  const casts = await prisma.cast.findMany({ select: { id: true, displayName: true, status: true, endedOn: true, primaryStoreId: true, mergedIntoCastId: true, memberships: { select: { storeId: true, status: true } } } });
  const rows = casts.map(classifyLegacyStateDrift); const drift = rows.filter((row) => row.drift);
  const counts = drift.flatMap((row) => row.reasons).reduce<Record<string, number>>((out, reason) => { out[reason] = (out[reason] ?? 0) + 1; return out; }, {});
  console.log(JSON.stringify({ readOnly: true, audit: "LEGACY_STATE_DRIFT", totalCasts: casts.length, driftCasts: drift.length, counts, examples: drift.slice(0, 100) }, null, 2));
  if (drift.length) process.exitCode = 2;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
