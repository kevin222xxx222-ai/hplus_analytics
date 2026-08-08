import type { CastMetric, CastMonthlyFact } from "@/lib/analytics/cast-diagnosis/types";
import { comparisonAxisForMetric } from "./metric-axis-map";
import { medianWithEvidence } from "./median";
import { selectPeers } from "./peer-selection";
import type { CastAxisAuditSummary, CastComparisonAudit, CastComparisonAxis, CastComparisonInput, CastMetricKey, CastMetricPeerComparison, CastPeerSelectionMethod, NewAcquisitionExclusionEvidence } from "./types";
import { CAST_COMPARISON_AXIS_LABELS } from "./types";

const invalidAvailability = new Set(["MISSING", "UNAVAILABLE", "UNCOMPUTABLE", "INSUFFICIENT_SAMPLE"]);
const isValid = (metric: CastMetric<number>) => metric.value !== null && !invalidAvailability.has(metric.availability);
const metric = (value: number | null, availability?: CastMetric<number>["availability"]): CastMetric<number> => ({ value, availability: availability ?? (value === null ? "MISSING" : value === 0 ? "ZERO" : "VALUE") });

function ratio(subject: CastMetric<number>, median: CastMetric<number>): CastMetric<number> {
  if (subject.value === null || median.value === null) return metric(null, subject.availability === "UNAVAILABLE" || median.availability === "UNAVAILABLE" ? "UNAVAILABLE" : "UNCOMPUTABLE");
  if (median.value === 0) return metric(null, "UNCOMPUTABLE");
  return metric(subject.value / median.value);
}

function matureEvidence(fact: CastMonthlyFact): NewAcquisitionExclusionEvidence {
  const contracts = fact.contracts.value;
  const shareValue = contracts === null || contracts === 0 || fact.photoNominations.value === null || fact.freeCount.value === null ? null : (fact.photoNominations.value + fact.freeCount.value) / contracts;
  const share = metric(shareValue, shareValue === null ? "UNCOMPUTABLE" : undefined);
  const matchedConditions = {
    hourlyRewardAtLeast3000: fact.hourlyReward.value !== null && fact.hourlyReward.value >= 3000,
    mainNominationRateAtLeast50Percent: fact.mainNominationRate.value !== null && fact.mainNominationRate.value >= 0.5,
    newAcquisitionShareBelow25Percent: share.value !== null && share.value < 0.25,
    contractsAtLeast10: contracts !== null && contracts >= 10,
  };
  return {
    castId: fact.castId,
    castName: fact.castName,
    storeLabels: fact.storeLabels,
    excludedAsMatureMainNominationCast: Object.values(matchedConditions).every(Boolean),
    values: { hourlyReward: fact.hourlyReward, mainNominationRate: fact.mainNominationRate, newAcquisitionShare: share, contracts: fact.contracts },
    matchedConditions,
  };
}

function peerRows(subject: CastMonthlyFact, peers: CastMonthlyFact[], metricKey: CastMetricKey, centerPositions: number[]) {
  const sorted = peers.filter((peer) => isValid(peer[metricKey])).sort((a, b) => (a[metricKey].value as number) - (b[metricKey].value as number) || a.castId.localeCompare(b.castId));
  return sorted.map((peer, index) => ({
    castId: peer.castId,
    castName: peer.castName,
    storeLabels: peer.storeLabels,
    workingHours: peer.workingHours,
    metric: peer[metricKey],
    sortedPosition: index + 1,
    isMedianPosition: centerPositions.includes(index + 1),
    inclusionReasons: ["本人ではない", "該当軸の候補条件を満たす", "対象指標が有効"],
  }));
}

function buildComparison(input: CastComparisonInput, subject: CastMonthlyFact, metricKey: CastMetricKey): CastMetricPeerComparison {
  const axis = input.mode === "LEGACY_RESULT_TOP_ONLY" ? "RESULT_TOP_PEERS" : comparisonAxisForMetric(metricKey);
  const selection = selectPeers(axis, subject, input.facts, metricKey, input.resultTopGroup, input.rollingResultTopGroup);
  const evidence = medianWithEvidence(selection.peers.map((peer) => peer[metricKey]));
  const rows = peerRows(subject, selection.peers, metricKey, evidence.centerPositions);
  const availability = selection.method === "INSUFFICIENT" || evidence.metric.value === null ? "INSUFFICIENT_SAMPLE" : evidence.metric.availability;
  const diagnosticUsage = selection.method === "INSUFFICIENT" ? "NOT_AVAILABLE" : axis === "REPEAT_CONVERSION_PEERS" && (subject.contracts.value ?? 0) < 10 ? "REFERENCE_ONLY" : "FORMAL";
  return {
    subjectCastId: subject.castId,
    subjectCastName: subject.castName,
    metricKey,
    axis,
    axisLabel: CAST_COMPARISON_AXIS_LABELS[axis],
    subject: subject[metricKey],
    median: evidence.metric,
    ratio: ratio(subject[metricKey], evidence.metric),
    availability,
    selection: {
      method: selection.method,
      candidateCount: selection.candidates.length,
      validPeerCount: rows.length,
      selfExcluded: true,
      workingHoursRange: selection.range,
      fallbackReason: selection.fallbackReason,
    },
    peers: rows,
    medianEvidence: evidence.method === "UNAVAILABLE" ? null : { method: evidence.method, centerValues: evidence.centerValues, centerPositions: evidence.centerPositions },
    diagnosticUsage,
  };
}

export function buildCastComparisonAudit(input: CastComparisonInput): CastComparisonAudit {
  const newAcquisitionExclusions = input.facts.filter((fact) => (fact.attendanceDays.value ?? 0) >= 2).map(matureEvidence).filter((evidence) => evidence.excludedAsMatureMainNominationCast);
  const comparisons = input.facts.flatMap((subject) => (Object.keys({
    femaleReward: true, hourlyReward: true, contracts: true, workingHours: true, contractsPerDay: true, contractsPerHour: true,
    townPv: true, townUu: true, heavenPageAccess: true, heavenDiaryPosts: true,
    photoNominations: true, photoNominationsPerDay: true, photoNominationsPerHour: true, photoNominationsPer100Uu: true, photoNominationShare: true,
    mainNominations: true, mainNominationRate: true, repeatCount: true, repeatShare: true,
  }) as CastMetricKey[]).map((key) => buildComparison(input, subject, key)));
  return { comparisons, newAcquisitionExclusions };
}

export function summarizeAxisAudit(comparisons: CastMetricPeerComparison[], axis: CastComparisonAxis): CastAxisAuditSummary {
  const selected = comparisons.filter((comparison) => comparison.axis === axis);
  const bySubject = [...new Map(selected.map((comparison) => [comparison.subjectCastId, comparison])).values()];
  const peerCounts = bySubject.map((comparison) => comparison.selection.validPeerCount).sort((a, b) => a - b);
  const median = peerCounts.length ? peerCounts.length % 2 ? peerCounts[Math.floor(peerCounts.length / 2)] : (peerCounts[peerCounts.length / 2 - 1] + peerCounts[peerCounts.length / 2]) / 2 : null;
  const methodCounts = Object.fromEntries(([
    "SIMILAR_WORKING_HOURS_40", "SIMILAR_WORKING_HOURS_60", "ALL_AXIS_CANDIDATES", "RESULT_TOP_GROUP_FALLBACK", "INSUFFICIENT",
  ] as CastPeerSelectionMethod[]).map((method) => [method, bySubject.filter((comparison) => comparison.selection.method === method).length])) as Record<CastPeerSelectionMethod, number>;
  const availabilityCounts = Object.fromEntries([...new Set(selected.map((comparison) => comparison.availability))].map((availability) => [availability, selected.filter((comparison) => comparison.availability === availability).length]));
  return { axis, castCount: bySubject.length, metricComparisonCount: selected.length, peerCount: { minimum: peerCounts.length ? peerCounts[0] : 0, median, maximum: peerCounts.length ? peerCounts[peerCounts.length - 1] : 0 }, methodCounts, availabilityCounts, insufficientCount: bySubject.filter((comparison) => comparison.availability === "INSUFFICIENT_SAMPLE").length };
}
