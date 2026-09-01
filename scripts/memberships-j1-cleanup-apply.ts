import { prisma } from "@/lib/prisma";
import { classifyJ1 } from "@/lib/casts/j1-cleanup";

function option(name: string) { return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1); }

async function main() {
  if (option("--confirm") !== "CONFIRM" || process.env.MEMBERSHIP_J1_CLEANUP_ENABLED !== "true") { console.log("Preview only. Apply requires --confirm=CONFIRM and MEMBERSHIP_J1_CLEANUP_ENABLED=true."); return; }
  const castId = option("--cast-id");
  if (!castId) throw new Error("--cast-id=<UUID> is required; bulk J1 cleanup is disabled.");
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`j1-cleanup:${castId}`})) IS NULL AS locked`;
    const cast = await tx.cast.findUnique({ where: { id: castId }, select: { id: true, status: true, endedOn: true, mergedIntoCastId: true, displayName: true, memberships: { where: { status: { in: ["ACTIVE", "ON_LEAVE"] } }, select: { id: true } }, aliases: { where: { validTo: null, reviewStatus: { not: "IGNORED" } }, select: { id: true } }, mediaListings: { where: { isListed: true }, select: { id: true } } } });
    if (!cast) throw new Error("指定Castが存在しません。");
    if (cast.status === "INACTIVE" && !cast.mergedIntoCastId) return { applied: false, castId, classification: "SAFE_GLOBAL_INACTIVE_CANDIDATE", action: "ALREADY_APPLIED", previousStatus: "INACTIVE", newStatus: "INACTIVE", endedOnChanged: false };
    const latestTown = await tx.townCastDaily.findFirst({ where: { importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, orderBy: { date: "desc" }, select: { date: true } });
    const currentTown = Boolean(latestTown && await tx.townCastDaily.findFirst({ where: { castId, date: latestTown.date, importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, select: { id: true } }));
    const classification = classifyJ1({ status: cast.status, merged: Boolean(cast.mergedIntoCastId), memberships: cast.memberships.length, aliases: cast.aliases.length, listings: cast.mediaListings.length, townCurrent: currentTown, hasEndedOn: Boolean(cast.endedOn), marker: /退店|休業/u.test(cast.displayName) });
    if (classification.classification !== "SAFE_GLOBAL_INACTIVE_CANDIDATE" || classification.plannedAction !== "SET_CAST_INACTIVE_STATUS_ONLY" || !classification.applyEligible) throw new Error("Previewが古いか、SAFE_GLOBAL_INACTIVE_CANDIDATE条件を満たしません。再Previewしてください。");
    await tx.cast.update({ where: { id: cast.id }, data: { status: "INACTIVE" } });
    return { applied: true, castId, classification: classification.classification, action: classification.plannedAction, previousStatus: "ACTIVE", newStatus: "INACTIVE", endedOnChanged: false };
  }, { isolationLevel: "Serializable" });
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
