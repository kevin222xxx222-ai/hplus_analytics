import { describe, expect, it } from "vitest";
import { buildHomeComparisons } from "./home-comparison";

describe("home comparison", () => {
  it("compares the previous day with period and weekday averages without zero-filling missing media", () => {
    const rows = buildHomeComparisons({
      previousDate: new Date("2026-07-10T00:00:00.000Z"),
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-10T00:00:00.000Z"),
      daily: [
        { date: new Date("2026-07-03T00:00:00.000Z"), sales: 100, reservations: 2, attendance: 2, minutes: 120, townPv: 10 },
        { date: new Date("2026-07-10T00:00:00.000Z"), sales: 80, reservations: 1, attendance: 1, minutes: 60, townPv: null },
      ],
    });
    const sales = rows.find((row) => row.key === "sales")!;
    expect(sales.direction).toBe("HIGHER_IS_BETTER");
    expect(sales.previousDay.value).toBe(80);
    expect(sales.monthAverage.value).toBe(100);
    expect(sales.weekdayAverage.value).toBe(100);
    expect(sales.vsMonthAverage.difference.value).toBe(-20);
    expect(sales.vsWeekdayAverage.differenceRate.value).toBe(-0.2);
    const town = rows.find((row) => row.key === "townPv")!;
    expect(town.previousDay.availability).toBe("MISSING");
  });

  it("returns insufficient confidence and uncomputable rate when the baseline is zero", () => {
    const rows = buildHomeComparisons({
      previousDate: new Date("2026-07-02T00:00:00.000Z"),
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-02T00:00:00.000Z"),
      daily: [{ date: new Date("2026-07-02T00:00:00.000Z"), reservations: 1 }, { date: new Date("2026-07-01T00:00:00.000Z"), reservations: 0 }],
    });
    const reservations = rows.find((row) => row.key === "reservations")!;
    expect(reservations.vsMonthAverage.differenceRate.availability).toBe("UNCOMPUTABLE");
    expect(reservations.vsMonthAverage.confidence).toBe("Insufficient");
  });

  it("keeps missing month and weekday values distinct from zero", () => {
    const rows = buildHomeComparisons({ previousDate: new Date("2026-07-10T00:00:00.000Z"), from: new Date("2026-07-01T00:00:00.000Z"), to: new Date("2026-07-10T00:00:00.000Z"), daily: [{ date: new Date("2026-07-10T00:00:00.000Z"), townPv: null }] });
    const town = rows.find((row) => row.key === "townPv")!;
    expect(town.previousDay.availability).toBe("MISSING");
    expect(town.monthAverage.availability).toBe("MISSING");
    expect(town.weekdayAverage.availability).toBe("MISSING");
    expect(town.vsMonthAverage.differenceRate.value).toBeNull();
  });

  it("exposes a deterministic Japanese status for comparison cards", () => {
    const rows = buildHomeComparisons({
      previousDate: new Date("2026-07-25T00:00:00.000Z"),
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-25T00:00:00.000Z"),
      daily: [
        ...Array.from({ length: 20 }, (_, index) => ({ date: new Date(Date.UTC(2026, 6, index + 1)), sales: 100 })),
        { date: new Date("2026-07-25T00:00:00.000Z"), sales: 120 },
      ],
    });
    expect(rows.find((row) => row.key === "sales")?.vsMonthAverage.status).toBe("十分");
  });
});
