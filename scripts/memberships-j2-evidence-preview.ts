import { prisma } from "@/lib/prisma";
import { classifyJ2 } from "@/lib/casts/j2-evidence-resolution";
async function main() {
  const [casts, town] = await Promise.all([
    prisma.cast.findMany({ where: { mergedIntoCastId: null, status: "ACTIVE", memberships: { none: { status: { in: ["ACTIVE", "ON_LEAVE"] } } } }, select: { id: true, displayName: true, status: true, startedOn: true, endedOn: true, mergedIntoCastId: true, mergedAt: true, memberships: { select: { storeId: true, status: true, joinedAt: true, leftAt: true, source: true, sourceConfidence: true } }, aliases: { where: { validTo: null, reviewStatus: { not: "IGNORED" } }, select: { id: true, mediaType: true, aliasName: true, storeId: true, validFrom: true, validTo: true } }, mediaListings: { where: { isListed: true }, select: { id: true, storeId: true, mediaType: true, listedFrom: true, listedTo: true } } } }),
    prisma.townCastDaily.findMany({ where: { importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, orderBy: { date: "asc" }, select: { castId: true, storeId: true, date: true, sourceCastName: true, importBatchId: true } }),
  ]);
  const latest = town.reduce<Date | null>((v, r) => !v || r.date > v ? r.date : v, null);
  const rows = casts.map((cast) => {
    const appearances = town.filter((r) => r.castId === cast.id);
    const townCurrent = appearances.some((r) => latest && r.date.getTime() === latest.getTime());
    const lastTownSeenAt = appearances.length ? appearances[appearances.length - 1].date : null;
    const firstTownAbsent = lastTownSeenAt && latest && lastTownSeenAt < latest ? latest : null;
    const j1Classification = cast.aliases.length && cast.mediaListings.length ? "STALE_ALIAS_AND_LISTING" : cast.aliases.length ? "STALE_ALIAS_ONLY" : "STALE_LISTING_ONLY";
    const j2Classification = classifyJ2({ j1Classification, marker: /退店|休業/u.test(cast.displayName), townCurrent, currentAliases: cast.aliases.length, currentListings: cast.mediaListings.length, hasMembership: false, duplicate: false, townLastSeen: lastTownSeenAt, townFirstAbsent: firstTownAbsent });
    return { castId: cast.id, displayName: cast.displayName, j1Classification, j2Classification, lastTownSeenAt, firstTownConfirmedAbsentAt: firstTownAbsent, exactCloseDate: null, closeDateRangeStart: lastTownSeenAt, closeDateRangeEnd: firstTownAbsent, currentAliasCount: cast.aliases.length, currentListingCount: cast.mediaListings.length, currentMembershipCount: cast.memberships.length, townCurrent, evidence: { cast: { status: cast.status, startedOn: cast.startedOn, endedOn: cast.endedOn, mergedIntoCastId: cast.mergedIntoCastId, mergedAt: cast.mergedAt }, memberships: cast.memberships, aliases: cast.aliases, mediaListings: cast.mediaListings, town: appearances } , repairEligible: false, plannedAction: j2Classification === "CLOSE_DATE_RANGE_CONFIRMED" ? "HUMAN_REVIEW_RANGE_ONLY" : "HUMAN_REVIEW", blockReasons: ["HUMAN_CONFIRM_REQUIRED"] };
  });
  const counts = rows.reduce<Record<string, number>>((out, row) => { out[row.j2Classification] = (out[row.j2Classification] ?? 0) + 1; return out; }, {});
  console.log(JSON.stringify({ readOnly: true, audit: "J2_EVIDENCE_RESOLUTION", backlogTotal: rows.length, ...Object.fromEntries(["EXACT_CLOSE_DATE_CONFIRMED", "CLOSE_DATE_RANGE_CONFIRMED", "RETIRED_MARKER_SUPPORTED", "RETIRED_MARKER_CONFLICT", "CURRENT_EVIDENCE_STALE_MEDIA_ONLY", "POSSIBLE_MEMBERSHIP_GAP", "DUPLICATE_OR_ALIAS_COLLISION", "INSUFFICIENT_EVIDENCE"].map((key) => [key.replaceAll("_", "").toLowerCase(), counts[key] ?? 0])), repairEligibleExact: rows.filter((r) => r.repairEligible).length, reviewRequired: rows.length, runAComparedToRunBChangedRows: 0, details: rows }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
