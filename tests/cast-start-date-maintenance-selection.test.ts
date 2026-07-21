import { describe, expect, it } from "vitest";
import { filterStartDateCandidates, getEligibleStartDateCandidateIds, selectionsMatch } from "@/lib/casts/start-date-maintenance-selection";

function candidates(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `cast-${index + 1}`,
    displayName: index % 2 ? `越谷${index + 1}` : `春日部${index + 1}`,
    primaryStoreName: index % 2 ? "越谷" : "春日部",
    startedOn: "2026-07-13",
    endedOn: null,
  }));
}

describe("start-date maintenance selection", () => {
  it("creates a preview selection for one eligible cast", () => {
    expect(getEligibleStartDateCandidateIds(candidates(1), "2026-04-01")).toEqual(["cast-1"]);
  });

  it("keeps all 115 selected IDs in the same selection array", () => {
    const selected = getEligibleStartDateCandidateIds(candidates(115), "2026-04-01");
    expect(selected).toHaveLength(115);
    expect(selectionsMatch(selected, [...selected].reverse())).toBe(true);
  });

  it("becomes zero after selection is cleared", () => {
    const selected = new Set(getEligibleStartDateCandidateIds(candidates(115), "2026-04-01"));
    selected.clear();
    expect(selected.size).toBe(0);
  });

  it("selects only eligible casts currently visible under search", () => {
    const visible = filterStartDateCandidates(candidates(12), "越谷");
    expect(visible).toHaveLength(6);
    expect(getEligibleStartDateCandidateIds(visible, "2026-04-01")).toHaveLength(6);
  });

  it("rejects a different received selection or duplicate IDs", () => {
    expect(selectionsMatch(["cast-1", "cast-2"], ["cast-1"])).toBe(false);
    expect(selectionsMatch(["cast-1", "cast-1"], ["cast-1"])).toBe(false);
  });
});
