import { describe, expect, it } from "vitest";
import { daysInclusive, endOfMonth, resolveEvaluationDate } from "./home-dates";

describe("home evaluation dates", () => {
  it("uses the latest confirmed date on or before yesterday and never a future date", () => {
    const result = resolveEvaluationDate({ today: new Date("2026-07-26T03:00:00Z"), selectedFrom: new Date("2026-07-01T00:00:00Z"), selectedTo: new Date("2026-07-31T00:00:00Z"), confirmedDates: [new Date("2026-07-24T00:00:00Z"), new Date("2026-07-25T00:00:00Z")] });
    expect(result.date?.toISOString().slice(0, 10)).toBe("2026-07-25");
    expect(result.label).toBe("前日");
  });

  it("falls back to the latest prior confirmed date when yesterday is missing", () => {
    const result = resolveEvaluationDate({ today: new Date("2026-07-26T03:00:00Z"), selectedFrom: new Date("2026-07-01T00:00:00Z"), selectedTo: new Date("2026-07-31T00:00:00Z"), confirmedDates: [new Date("2026-07-24T00:00:00Z"), new Date("2026-07-30T00:00:00Z")] });
    expect(result.date?.toISOString().slice(0, 10)).toBe("2026-07-24");
    expect(result.note).toContain("2026-07-24");
  });

  it("uses calendar month ends and remaining days correctly", () => {
    expect(endOfMonth(new Date("2026-07-01T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-07-31");
    expect(endOfMonth(new Date("2026-02-01T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(endOfMonth(new Date("2024-02-01T00:00:00Z")).toISOString().slice(0, 10)).toBe("2024-02-29");
    expect(endOfMonth(new Date("2026-04-01T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-04-30");
    expect(daysInclusive(new Date("2026-07-26T00:00:00Z"), new Date("2026-07-31T00:00:00Z"))).toBe(6);
  });

  it("returns a missing evaluation when no confirmed date exists", () => {
    const result = resolveEvaluationDate({ today: new Date("2026-07-26T03:00:00Z"), selectedFrom: new Date("2026-07-01T00:00:00Z"), selectedTo: new Date("2026-07-31T00:00:00Z"), confirmedDates: [] });
    expect(result.date).toBeNull();
    expect(result.note).toContain("確定データがありません");
  });
});
