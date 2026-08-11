import type { CastEngineCast, CastMetricComparison } from "./cast-diagnosis/types";

export type MediaDiagnosisRule = "A" | "B" | "C" | "D" | "E" | "F";
export type MediaRuleResult = { rule: MediaDiagnosisRule; matched: boolean; reason: string; metricKeys: string[] };

/** Audit-only rule evaluation. It deliberately does not feed Diagnosis or Action Engine. */
const comparison = (cast: CastEngineCast, key: string) => cast.comparisons.find((item) => item.metricKey === key);
const usableRatio = (item: CastMetricComparison | undefined) => { if (!item || item.relativeRatio === null || item.relativeRatio === undefined || item.peerMedianMetric.value === null) return null; return item.relativeRatio; };
const atLeast = (cast: CastEngineCast, key: string, threshold = 0.8) => { const ratio = usableRatio(comparison(cast, key)); return ratio !== null && ratio >= threshold; };
const below = (cast: CastEngineCast, key: string, threshold = 0.8) => { const ratio = usableRatio(comparison(cast, key)); return ratio !== null && ratio < threshold; };
const available = (cast: CastEngineCast, key: string) => { const item = comparison(cast, key); return Boolean(item && item.castMetric.value !== null && item.peerMedianMetric.value !== null && item.relativeRatio !== null); };

export function evaluateMediaDiagnosisRules(cast: CastEngineCast): MediaRuleResult[] {
  const contracts = cast.fact.contracts.value ?? 0;
  const inflow = atLeast(cast, "townUu");
  const myGirl = atLeast(cast, "heavenMyGirlAdds");
  const talk = atLeast(cast, "heavenFavoriteTalks");
  const photo = atLeast(cast, "photoNominationsPer100Uu");
  const resultLow = available(cast, "hourlyReward") && available(cast, "contractsPerHour") && (below(cast, "hourlyReward") || below(cast, "contractsPerHour"));
  const keys = (condition: boolean, metricKeys: string[], reason: string): MediaRuleResult => ({ rule: "A", matched: condition, metricKeys, reason });
  return [
    { ...keys(inflow && available(cast, "heavenMyGirlAdds") && below(cast, "heavenMyGirlAdds"), ["townUu", "heavenMyGirlAdds"], "流入は比較基準以上、マイガール増加は比較基準未満"), rule: "A" },
    { ...keys(myGirl && available(cast, "heavenFavoriteTalks") && below(cast, "heavenFavoriteTalks"), ["heavenMyGirlAdds", "heavenFavoriteTalks"], "マイガール増加は比較基準以上、Talkは比較基準未満"), rule: "B" },
    { ...keys(talk && available(cast, "photoNominationsPer100Uu") && below(cast, "photoNominationsPer100Uu"), ["heavenFavoriteTalks", "photoNominationsPer100Uu"], "Talkは比較基準以上、写真指名効率は比較基準未満"), rule: "C" },
    { ...keys(photo && available(cast, "mainNominationRate") && below(cast, "mainNominationRate"), ["photoNominationsPer100Uu", "mainNominationRate"], "写真指名効率は比較基準以上、本指名率は比較基準未満"), rule: "D" },
    { ...keys(myGirl && photo && available(cast, "mainNominationRate") && below(cast, "mainNominationRate"), ["heavenMyGirlAdds", "photoNominationsPer100Uu", "mainNominationRate"], "マイガールと写真指名効率は比較基準以上、本指名率は比較基準未満"), rule: "E" },
    { ...keys(resultLow && ["townUu", "heavenPageAccess", "heavenMyGirlAddsPer100Access", "heavenFavoriteTalksPerAttendanceDay"].every((key) => atLeast(cast, key)), ["townUu", "heavenPageAccess", "heavenMyGirlAddsPer100Access", "heavenFavoriteTalksPerAttendanceDay", "hourlyReward", "contractsPerHour"], "媒体指標がすべて比較基準以上、結果指標が不足"), rule: "F" },
  ].map((item) => ({ ...item, reason: contracts < 5 ? `${item.reason}（成約母数${contracts}本）` : item.reason })) as MediaRuleResult[];
}

export const mediaRuleLabels: Record<MediaDiagnosisRule, string> = { A: "流入○・マイガール×", B: "マイガール○・Talk×", C: "Talk○・写真×", D: "写真○・本指名×", E: "マイガール○・写真○・本指名×", F: "媒体○・結果×" };
