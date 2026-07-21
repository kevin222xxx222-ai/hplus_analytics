export type StartDateSelectionCandidate = {
  id: string;
  displayName: string;
  primaryStoreName: string | null;
  startedOn: string;
  endedOn: string | null;
};

export function filterStartDateCandidates<T extends StartDateSelectionCandidate>(
  candidates: T[],
  query: string,
): T[] {
  return candidates.filter((cast) =>
    !query || `${cast.displayName} ${cast.primaryStoreName || ""}`.includes(query),
  );
}

export function getEligibleStartDateCandidateIds(
  candidates: StartDateSelectionCandidate[],
  targetDate: string,
) {
  return candidates
    .filter((cast) => cast.startedOn > targetDate && (!cast.endedOn || cast.endedOn >= targetDate))
    .map((cast) => cast.id);
}

export function selectionsMatch(requested: string[], received: string[]) {
  const requestedSet = new Set(requested);
  const receivedSet = new Set(received);
  return requestedSet.size === requested.length
    && receivedSet.size === received.length
    && requestedSet.size === receivedSet.size
    && [...requestedSet].every((id) => receivedSet.has(id));
}
