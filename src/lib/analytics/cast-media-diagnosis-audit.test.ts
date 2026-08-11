import { describe, expect, it } from "vitest";
import { evaluateMediaDiagnosisRules } from "./cast-media-diagnosis-audit";
import type { CastEngineCast } from "./cast-diagnosis/types";

const cast = (ratios: Record<string, number | null>, values: Record<string, number | null> = {}): CastEngineCast => ({
  fact: { contracts: { value: 12, availability: "VALUE" }, castId: "c", castName: "監査", } as CastEngineCast["fact"],
  comparisons: Object.entries(ratios).map(([metricKey, relativeRatio]) => ({ metricKey, relativeRatio, castMetric: { value: values[metricKey] ?? 1, availability: "VALUE" }, peerMedianMetric: { value: 1, availability: "VALUE" } })) as CastEngineCast["comparisons"],
} as unknown as CastEngineCast);

describe("media diagnosis audit rules", () => {
  it("uses existing comparison ratios and does not treat missing values as a match", () => {
    const result = evaluateMediaDiagnosisRules(cast({ townUu: 1, heavenMyGirlAdds: 0.5, photoNominationsPer100Uu: 1, mainNominationRate: 0.5, heavenFavoriteTalks: 1, hourlyReward: 0.5, contractsPerHour: 0.5, heavenPageAccess: 1, heavenMyGirlAddsPer100Access: 1, heavenFavoriteTalksPerAttendanceDay: 1 }));
    expect(result.find((item) => item.rule === "A")?.matched).toBe(true);
    expect(evaluateMediaDiagnosisRules(cast({ townUu: 1, heavenMyGirlAdds: null })).find((item) => item.rule === "A")?.matched).toBe(false);
  });

  it("reports a media candidate without changing any result diagnosis", () => {
    const result = evaluateMediaDiagnosisRules(cast({ townUu: 1, heavenMyGirlAdds: 2, photoNominationsPer100Uu: 1, mainNominationRate: 0.5, heavenFavoriteTalks: 0.5 }));
    expect(result.find((item) => item.rule === "E")?.matched).toBe(true);
  });
});
