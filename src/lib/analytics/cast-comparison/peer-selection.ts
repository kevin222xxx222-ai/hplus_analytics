import type { CastMonthlyFact } from "@/lib/analytics/cast-diagnosis/types";
import type { CastComparisonAxis, CastMetricKey, CastPeerSelectionMethod } from "./types";

export const MINIMUM_PEER_COUNT = 3;
export const WORKING_HOURS_RANGE_40 = 0.4;
export const WORKING_HOURS_RANGE_60 = 0.6;

const value = (fact: CastMonthlyFact, key: CastMetricKey) => fact[key].value;
const valid = (fact: CastMonthlyFact, key: CastMetricKey) => value(fact, key) !== null && !["MISSING", "UNAVAILABLE", "UNCOMPUTABLE", "INSUFFICIENT_SAMPLE"].includes(fact[key].availability);
const hoursValid = (fact: CastMonthlyFact) => fact.workingHours.value !== null && fact.workingHours.availability !== "UNAVAILABLE" && fact.workingHours.availability !== "UNCOMPUTABLE";
const inRange = (subject: CastMonthlyFact, peer: CastMonthlyFact, ratio: number) => {
  if (!hoursValid(subject) || !hoursValid(peer)) return false;
  const hours = subject.workingHours.value as number;
  const peerHours = peer.workingHours.value as number;
  return peerHours >= hours * (1 - ratio) && peerHours <= hours * (1 + ratio);
};

export type PeerSelection = {
  peers: CastMonthlyFact[];
  candidates: CastMonthlyFact[];
  method: CastPeerSelectionMethod;
  range: { minimum: number; maximum: number } | null;
  fallbackReason: string | null;
};

function rangeOf(subject: CastMonthlyFact, ratio: number) {
  if (!hoursValid(subject)) return null;
  const hours = subject.workingHours.value as number;
  return { minimum: hours * (1 - ratio), maximum: hours * (1 + ratio) };
}

export function selectPeers(axis: CastComparisonAxis, subject: CastMonthlyFact, facts: CastMonthlyFact[], metricKey: CastMetricKey, resultTopGroup?: CastMonthlyFact[], rollingResultTopGroup?: CastMonthlyFact[]): PeerSelection {
  const withoutSelf = (items: CastMonthlyFact[]) => items.filter((fact) => fact.castId !== subject.castId);
  if (axis === "RESULT_TOP_PEERS") {
    const topSource = resultTopGroup ?? deriveResultTopGroup(facts);
    const top = withoutSelf(topSource);
    const similar = top.filter((fact) => inRange(subject, fact, WORKING_HOURS_RANGE_40));
    if (similar.length >= MINIMUM_PEER_COUNT) return { peers: similar, candidates: top, method: "SIMILAR_WORKING_HOURS_40", range: rangeOf(subject, WORKING_HOURS_RANGE_40), fallbackReason: null };
    // Keep a small (but traceable) result-top sample when the subject itself
    // is in a three-person top group. Other axes still determine overall
    // confidence; this step is marked by its validPeerCount.
    const fallback = top.length >= MINIMUM_PEER_COUNT || topSource.length >= MINIMUM_PEER_COUNT ? top : withoutSelf(rollingResultTopGroup ?? []);
    if (fallback.length >= MINIMUM_PEER_COUNT) return { peers: fallback, candidates: top, method: "RESULT_TOP_GROUP_FALLBACK", range: rangeOf(subject, WORKING_HOURS_RANGE_40), fallbackReason: "近似稼働量Peerが3名未満のため結果上位群へフォールバックしました。" };
    return { peers: fallback, candidates: top, method: "INSUFFICIENT", range: rangeOf(subject, WORKING_HOURS_RANGE_40), fallbackReason: "本人除外後の結果上位群が3名未満です。" };
  }

  const candidates = withoutSelf(facts.filter((fact) => axisCandidate(axis, fact, metricKey)));
  const range40 = candidates.filter((fact) => inRange(subject, fact, WORKING_HOURS_RANGE_40));
  if (range40.length >= MINIMUM_PEER_COUNT) return { peers: range40, candidates, method: "SIMILAR_WORKING_HOURS_40", range: rangeOf(subject, WORKING_HOURS_RANGE_40), fallbackReason: null };
  const range60 = candidates.filter((fact) => inRange(subject, fact, WORKING_HOURS_RANGE_60));
  if (range60.length >= MINIMUM_PEER_COUNT) return { peers: range60, candidates, method: "SIMILAR_WORKING_HOURS_60", range: rangeOf(subject, WORKING_HOURS_RANGE_60), fallbackReason: "±40%の有効Peerが3名未満のため±60%へ拡張しました。" };
  if (candidates.length >= MINIMUM_PEER_COUNT) return { peers: candidates, candidates, method: "ALL_AXIS_CANDIDATES", range: rangeOf(subject, WORKING_HOURS_RANGE_40), fallbackReason: "±60%でも3名未満のため軸候補全体へフォールバックしました。" };
  return { peers: candidates, candidates, method: "INSUFFICIENT", range: rangeOf(subject, WORKING_HOURS_RANGE_40), fallbackReason: "軸候補が3名未満です。" };
}

function axisCandidate(axis: CastComparisonAxis, fact: CastMonthlyFact, metricKey: CastMetricKey) {
  const main = (fact.attendanceDays.value ?? 0) >= 2;
  if (!main || !hoursValid(fact) || !valid(fact, metricKey)) return false;
  if (axis === "MAIN_ATTENDANCE_PEERS") return true;
  if (axis === "NEW_ACQUISITION_PEERS") {
    const uu = fact.townUu.value;
    const contracts = fact.contracts.value;
    const mainRate = fact.mainNominationRate.value;
    const share = fact.photoNominationShare.value === null || fact.freeCount.value === null || contracts === null || contracts === 0 ? null : ((fact.photoNominations.value ?? 0) + fact.freeCount.value) / contracts;
    // Condition E: hourly reward, contract sample, main-nomination rate and photo/free composition
    // are combined so a photo-rich high-nomination cast is not removed by rate alone.
    const mature = fact.hourlyReward.value !== null && fact.hourlyReward.value >= 3000 && mainRate !== null && mainRate >= 0.5 && share !== null && share < 0.25 && contracts !== null && contracts >= 10;
    return (fact.workingHours.value ?? 0) >= 10 && uu !== null && uu >= 100 && fact.photoNominations.value !== null && !mature;
  }
  if (axis === "REPEAT_CONVERSION_PEERS") {
    const contracts = fact.contracts.value;
    return contracts !== null && contracts >= 10 && fact.mainNominationRate.value !== null && fact.photoNominations.value !== null && fact.freeCount.value !== null && fact.photoNominations.value + fact.freeCount.value >= 3;
  }
  return false;
}

function deriveResultTopGroup(facts: CastMonthlyFact[]) {
  const eligible = facts.filter((fact) => fact.hourlyReward.value !== null && (fact.workingHours.value ?? 0) >= 10 && ((fact.attendanceDays.value ?? 0) >= 4 || (fact.workingHours.value ?? 0) >= 20 || (fact.contracts.value ?? 0) >= 5));
  const sorted = [...eligible].sort((a, b) => (b.hourlyReward.value as number) - (a.hourlyReward.value as number) || a.castId.localeCompare(b.castId));
  return sorted.slice(0, eligible.length >= 8 ? Math.ceil(eligible.length * 0.25) : eligible.length >= 5 ? 2 : 0);
}
