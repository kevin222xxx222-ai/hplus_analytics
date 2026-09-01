import { describe, expect, it } from "vitest";
import { classifyJ2 } from "./j2-evidence-resolution";
const base = { j1Classification: "STALE_ALIAS_ONLY", marker: false, townCurrent: false, currentAliases: 1, currentListings: 0, hasMembership: false, duplicate: false, townLastSeen: null, townFirstAbsent: null };
describe("J2 evidence resolution", () => {
  it("does not infer exact date from last seen", () => expect(classifyJ2(base)).toBe("CURRENT_EVIDENCE_STALE_MEDIA_ONLY"));
  it("protects retired marker conflicts", () => expect(classifyJ2({ ...base, marker: true, townCurrent: true })).toBe("RETIRED_MARKER_CONFLICT"));
  it("identifies membership gaps", () => expect(classifyJ2({ ...base, currentAliases: 0, townCurrent: true })).toBe("POSSIBLE_MEMBERSHIP_GAP"));
});
