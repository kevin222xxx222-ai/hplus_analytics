import { describe, expect, it } from "vitest";
import { selectRepresentativeDates } from "./shadow-datasets";

describe("CTI shadow dataset selection", () => {
  it("selects oldest, middle, and latest unique dates", () => {
    expect(selectRepresentativeDates(["2026-08-22", "2026-04-01", "2026-06-10", "2026-08-22"])).toEqual(["2026-04-01", "2026-06-10", "2026-08-22"]);
  });
  it("does not duplicate a single dataset date", () => {
    expect(selectRepresentativeDates(["2026-08-22", "2026-08-22"])).toEqual(["2026-08-22"]);
  });
});
