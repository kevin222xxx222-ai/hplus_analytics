import { describe, expect, it } from "vitest";
import { heavenDiaryMetric, weekRange } from "./store-week-detail";

describe("store week detail date rules", () => {
  it("normalizes a Monday to the Monday-Sunday range", () => {
    expect(weekRange("2026-07-06")).toEqual({
      weekStart: "2026-07-06",
      weekEnd: "2026-07-12",
    });
  });

  it("normalizes a Sunday to the containing Monday-Sunday range", () => {
    expect(weekRange("2026-07-12")).toEqual({
      weekStart: "2026-07-06",
      weekEnd: "2026-07-12",
    });
  });
});

describe("weekly Heaven diary aggregation", () => {
  it("includes posts on days without CTI attendance", () => {
    expect(heavenDiaryMetric([
      { businessDate: new Date("2026-07-20T00:00:00Z"), rawValue: 4, rawValueStatus: "VALUE" },
      { businessDate: new Date("2026-07-21T00:00:00Z"), rawValue: 6, rawValueStatus: "VALUE" },
    ])).toMatchObject({ value: 10, availability: "VALUE", validDayCount: 2 });
  });

  it("keeps a formally collected zero as ZERO", () => {
    expect(heavenDiaryMetric([{ businessDate: new Date("2026-07-20T00:00:00Z"), rawValue: 0, rawValueStatus: "VALUE" }])).toMatchObject({ value: 0, availability: "ZERO" });
  });

  it("returns MISSING for blank Heaven data", () => {
    expect(heavenDiaryMetric([{ businessDate: new Date("2026-07-20T00:00:00Z"), rawValue: null, rawValueStatus: "BLANK" }])).toMatchObject({ value: null, availability: "MISSING" });
  });
});
