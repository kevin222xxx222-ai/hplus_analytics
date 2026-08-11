import { describe, expect, it } from "vitest";
import { activeCoverage, monthStatus, normalizeMonthRange } from "./monthly-aggregation";

describe("monthly trend boundaries", () => {
  it("normalizes arbitrary dates to calendar months", () => {
    expect(normalizeMonthRange("2026-04-15", "2026-08-05")).toEqual({ from: "2026-04-01", to: "2026-08-31", months: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"] });
  });
  it("distinguishes complete and partial months", () => {
    expect(monthStatus("2026-07", "2026-08-31", new Date("2026-08-05T00:00:00Z"))).toBe("COMPLETE");
    expect(monthStatus("2026-08", "2026-08-31", new Date("2026-08-05T00:00:00Z"))).toBe("PARTIAL");
  });
  it("keeps entry and exit boundaries separate from current-month partial", () => {
    expect(activeCoverage("2026-07", "2026-07-14", "2026-07-20")).toMatchObject({ activeDaysInMonth: 7, isPartialActiveMonth: true });
    expect(activeCoverage("2026-06", "2026-07-14", null).activeDaysInMonth).toBe(0);
    expect(activeCoverage("2026-08", "2026-01-01", "2026-07-20").activeDaysInMonth).toBe(0);
  });
});
