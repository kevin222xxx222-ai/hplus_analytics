import { describe, expect, it } from "vitest";
import { toPublicCastTrend } from "./public";

describe("cast trend public DTO", () => {
  it("removes non-finite values without losing availability", () => {
    const value = toPublicCastTrend({ summaries: { hourlyReward: { latest: { value: Number.NaN, availability: "VALUE" } } }, months: [], availabilitySummary: {}, warnings: [] } as never);
    expect(value.summaries.hourlyReward.latest.value).toBeNull();
    expect(value.summaries.hourlyReward.latest.availability).toBe("VALUE");
  });
});
