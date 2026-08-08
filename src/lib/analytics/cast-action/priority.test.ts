import { describe, expect, it } from "vitest";
import { calculatePriority } from "./priority";

describe("Cast Action priority guard", () => {
  it("allows HIGH only for a clear low result with reliable comparison", () => {
    expect(calculatePriority({ actionType: "REVIEW_PAGE_TRAFFIC", result: "LOW", confidence: "HIGH", hasFormalComparison: true, warningCodes: [] })).toEqual({ score: 8, priority: "HIGH" });
  });

  it("does not make borderline, low-confidence, or warning cases HIGH", () => {
    expect(calculatePriority({ actionType: "REVIEW_PAGE_TRAFFIC", result: "BORDERLINE", confidence: "HIGH", hasFormalComparison: true, warningCodes: [] }).priority).not.toBe("HIGH");
    expect(calculatePriority({ actionType: "REVIEW_PROFILE_CONVERSION", result: "LOW", confidence: "LOW", hasFormalComparison: true, warningCodes: [] }).priority).not.toBe("HIGH");
    expect(calculatePriority({ actionType: "REVIEW_REPEAT_CONVERSION", result: "LOW", confidence: "HIGH", hasFormalComparison: true, warningCodes: ["REFERENCE_ONLY"] }).priority).not.toBe("HIGH");
  });

  it("keeps stable and insufficient states conservative", () => {
    expect(calculatePriority({ actionType: "MAINTAIN_CURRENT", result: "GOOD", confidence: "HIGH", hasFormalComparison: true, warningCodes: [] }).priority).toBe("NONE");
    expect(calculatePriority({ actionType: "WAIT_FOR_MORE_DATA", result: "INSUFFICIENT", confidence: "INSUFFICIENT", hasFormalComparison: false, warningCodes: [] }).priority).toBe("LOW");
  });
});
