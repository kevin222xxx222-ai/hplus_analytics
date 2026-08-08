import { describe, expect, it } from "vitest";
import { previousMonthRange } from "./detail";

describe("cast diagnosis detail period", () => {
  it("uses the complete previous calendar month for a monthly selection", () => {
    expect(previousMonthRange("2026-07-01")).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(previousMonthRange("2024-03-01")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
});
