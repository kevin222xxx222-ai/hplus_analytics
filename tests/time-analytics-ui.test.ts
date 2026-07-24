import { describe, expect, it } from "vitest";
import { buildTimeUrl, formatTimeValue, timeAvailability } from "@/lib/analytics/ui/time-view-model";

describe("Time Analytics UI view model", () => {
  it("builds the existing time API URL without inventing dimensions", () => {
    expect(buildTimeUrl({ from: "2026-06-01", to: "2026-06-30", store: "KASUKABE" })).toBe("/api/analytics/time?from=2026-06-01&to=2026-06-30&store=KASUKABE");
  });
  it("keeps missing and zero values distinct", () => {
    expect(formatTimeValue(0, "currency")).toBe("¥0");
    expect(formatTimeValue(null, "currency")).toBe("—");
    expect(timeAvailability(0)).toBe("ZERO");
    expect(timeAvailability(null)).toBe("MISSING");
  });
});
