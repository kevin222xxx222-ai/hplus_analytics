import type { TownBulkLinkCandidate } from "./bulk-link-types";

export type TownCFilter = {
  reason: string;
  storeId: string;
  query: string;
  quick: "ALL" | "ID" | "NO_CANDIDATE" | "CORRECTION";
  sort: "ROWS" | "BATCHES" | "FIRST_DATE";
  hidePlanned: boolean;
};

export function townCActionSet(candidate: Pick<TownBulkLinkCandidate, "reasonCodes">) {
  const reason = candidate.reasonCodes[0];
  if (reason === "CORRECTION_CANDIDATE") return ["CORRECTION_DIFF", "KEEP_EXISTING", "CORRECTION_ADOPT", "PENDING"] as const;
  if (reason === "ID_FORMAT") return ["SOURCE_URL", "EXISTING", "SKIP", "PENDING"] as const;
  if (reason === "MULTIPLE_CANDIDATES") return ["COMPARE", "EXISTING", "PENDING"] as const;
  if (reason === "OUTSIDE_ENROLLMENT") return ["EXISTING", "BACKDATE", "PENDING"] as const;
  if (reason === "NO_CANDIDATE" || reason === "UNKNOWN_SOURCE_NAME") return ["EXISTING", "NEW", "SKIP", "PENDING"] as const;
  return ["EXISTING", "SKIP", "PENDING"] as const;
}

export function filterTownCCandidates(
  candidates: TownBulkLinkCandidate[],
  filter: TownCFilter,
  plannedKeys: ReadonlySet<string>,
) {
  const query = filter.query.trim().toLocaleLowerCase("ja");
  return candidates.filter((candidate) => {
    const reason = candidate.reasonCodes[0];
    if (filter.reason !== "ALL" && reason !== filter.reason) return false;
    if (filter.storeId !== "ALL" && candidate.storeId !== filter.storeId) return false;
    if (query && !`${candidate.townName} ${candidate.normalizedName}`.toLocaleLowerCase("ja").includes(query)) return false;
    if (filter.quick === "ID" && reason !== "ID_FORMAT") return false;
    if (filter.quick === "NO_CANDIDATE" && reason !== "NO_CANDIDATE") return false;
    if (filter.quick === "CORRECTION" && reason !== "CORRECTION_CANDIDATE") return false;
    if (filter.hidePlanned && plannedKeys.has(candidate.key)) return false;
    return true;
  }).sort((left, right) => {
    if (filter.sort === "BATCHES") return right.batchCount - left.batchCount || right.rowCount - left.rowCount;
    if (filter.sort === "FIRST_DATE") return left.firstDate.localeCompare(right.firstDate) || right.rowCount - left.rowCount;
    return right.rowCount - left.rowCount || right.batchCount - left.batchCount;
  });
}

export function pageTownCCandidates(candidates: TownBulkLinkCandidate[], page: number, pageSize = 25) {
  const pageCount = Math.max(1, Math.ceil(candidates.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  return { page: safePage, pageCount, values: candidates.slice((safePage - 1) * pageSize, safePage * pageSize) };
}
