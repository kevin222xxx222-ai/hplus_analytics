import { describe, expect, it } from "vitest";
import { deriveActionStageStates } from "./stage-state";
import type { CastEngineCast } from "@/lib/analytics/cast-diagnosis/types";

const cast = (states: Record<string, number>) => ({
  fact: { contracts: { value: 12, availability: "VALUE" }, townUu: { value: 200, availability: "VALUE" } },
  comparisons: Object.entries(states).map(([metricKey, relativeRatio]) => ({ metricKey, label: metricKey, peerMedianMetric: { value: 100, availability: "VALUE" }, relativeRatio, status: relativeRatio >= 1 ? "ABOVE" : relativeRatio >= 0.8 ? "COMPARABLE" : relativeRatio >= 0.6 ? "INTERMEDIATE" : "BELOW", diagnosticUsage: "FORMAL" })),
} as unknown as CastEngineCast);

describe("Action stage state normalization", () => {
  it("normalizes all formal comparison states", () => {
    const result = deriveActionStageStates(cast({ hourlyReward: 0.5, townUu: 0.9, photoNominationsPer100Uu: 0.7, mainNominationRate: 0.5 }));
    expect(result).toEqual({ result: "LOW", pageTraffic: "ADEQUATE", photoConversion: "BORDERLINE", repeatConversion: "LOW" });
  });

  it("does not treat a missing comparison as zero", () => {
    const value = cast({ hourlyReward: 0.5 });
    expect(deriveActionStageStates(value).pageTraffic).toBe("INSUFFICIENT");
  });
});
