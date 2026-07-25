import { describe, expect, it } from "vitest";
import { prioritizeDailyBriefActions } from "./daily-brief-rules";

const action = (id: string, priority: "HIGH" | "MEDIUM" | "LOW", category: "DATA_HEALTH" | "SALES" = "SALES") => ({ id, priority, category, title: id, situation: "確認", evidence: [], recommendedCheck: "確認", storeId: null, castId: null, detailUrl: "/", availability: "VALUE" as const, confidence: "High" as const });

describe("daily brief rules", () => {
  it("limits actions to three and puts data health first", () => {
    const result = prioritizeDailyBriefActions([action("sales", "HIGH"), action("health", "MEDIUM", "DATA_HEALTH"), action("low", "LOW"), action("medium", "MEDIUM")]);
    expect(result.map((item) => item.id)).toEqual(["health", "sales", "medium"]);
  });
  it("returns an empty list when there are no actionable findings", () => {
    expect(prioritizeDailyBriefActions([])).toEqual([]);
  });
});
