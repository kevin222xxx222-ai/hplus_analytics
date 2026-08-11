import { CAST_METRIC_COMPARISON_AXIS } from "@/lib/analytics/cast-comparison/metric-axis-map";
import type { CastComparisonAxis } from "@/lib/analytics/cast-comparison/types";
import { validateDiagnosisAssignment } from "./engine";
import type { CastDiagnosisEngineResult, CastEngineCast, CastDiagnosisType } from "./types";
import type { CastDiagnosisAuditReport } from "./audit-types";

const AXES = ["RESULT_TOP_PEERS", "MAIN_ATTENDANCE_PEERS", "NEW_ACQUISITION_PEERS", "REPEAT_CONVERSION_PEERS"] as const;
const DIAGNOSES = ["STABLE_HIGH_EFFICIENCY", "LIMITED_BY_AVAILABILITY", "LOW_PAGE_TRAFFIC", "LOW_PROFILE_CONVERSION", "LOW_REPEAT_CONVERSION", "LOW_NEW_CUSTOMER_ACQUISITION", "OTHER_REVIEW", "INSUFFICIENT_DATA"];
const STEPS = ["result", "pageTraffic", "photoConversion", "repeatConversion"] as const;
const EPSILON = 1e-9;
const countBy = (values: string[]) => Object.fromEntries([...new Set([...DIAGNOSES, ...values])].map((key) => [key, values.filter((value) => value === key).length]));
const confidenceBy = (values: string[]) => Object.fromEntries(["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"].map((key) => [key, values.filter((value) => value === key).length]));
const main = (cast: CastEngineCast) => cast.isMainAttendanceCast;
const factValues = (cast: CastEngineCast) => cast.diagnosis.facts.map((fact) => cast.comparisons.find((comparison) => comparison.metricKey === fact.metricKey)).filter(Boolean);

function axisAudit(current: CastDiagnosisEngineResult) {
  const mismatches: unknown[] = []; let checkedCount = 0;
  for (const cast of current.casts) for (const comparison of cast.comparisons) {
    const expected = (CAST_METRIC_COMPARISON_AXIS as Record<string, CastComparisonAxis>)[comparison.metricKey];
    if (!expected) continue;
    checkedCount++;
    if (comparison.comparisonAxis !== expected) mismatches.push({ castId: cast.fact.castId, castName: cast.fact.castName, metricKey: comparison.metricKey, expectedAxis: expected, actualAxis: comparison.comparisonAxis ?? null });
  }
  return { checkedCount, mismatchCount: mismatches.length, mismatches };
}

function factsAudit(current: CastDiagnosisEngineResult) {
  const mismatches: unknown[] = []; let checkedCount = 0;
  for (const cast of current.casts) for (const comparison of factValues(cast)) {
    if (!comparison) continue; checkedCount++;
    const fact = cast.diagnosis.facts.find((item) => item.metricKey === comparison.metricKey)!;
    // Sample-size Facts (for example 成約8本) intentionally have no peer
    // median and are not Comparison Engine Facts.
    if (fact.peerMedianValue === null && fact.relativeRatio === null) continue;
    if (fact.castValue !== comparison.castMetric.value || fact.peerMedianValue !== comparison.peerMedianMetric.value || (fact.relativeRatio === null ? comparison.relativeRatio !== null : comparison.relativeRatio === null || Math.abs(fact.relativeRatio - comparison.relativeRatio) > EPSILON) || fact.availability !== comparison.castMetric.availability || fact.comparisonAxis !== comparison.comparisonAxis) mismatches.push({ castId: cast.fact.castId, castName: cast.fact.castName, metricKey: comparison.metricKey, factValue: fact.castValue, comparisonValue: comparison.castMetric.value, factMedian: fact.peerMedianValue, comparisonMedian: comparison.peerMedianMetric.value, axis: comparison.comparisonAxis });
  }
  return { checkedCount, mismatchCount: mismatches.length, mismatches };
}

function availabilityAudit(current: CastDiagnosisEngineResult) {
  const byAxis: Record<string, Record<string, number>> = {}; const byMetric: Record<string, Record<string, number>> = {};
  for (const axis of AXES) byAxis[axis] = {};
  for (const cast of current.casts) for (const comparison of cast.comparisons) { const key = comparison.diagnosticUsage === "REFERENCE_ONLY" ? "REFERENCE_ONLY" : comparison.peerMedianMetric.availability; byAxis[comparison.comparisonAxis ?? "UNKNOWN"] ??= {}; byAxis[comparison.comparisonAxis ?? "UNKNOWN"][key] = (byAxis[comparison.comparisonAxis ?? "UNKNOWN"][key] ?? 0) + 1; byMetric[comparison.metricKey] ??= {}; byMetric[comparison.metricKey][key] = (byMetric[comparison.metricKey][key] ?? 0) + 1; }
  return { byAxis, byMetric };
}

function confidenceAudit(result: CastDiagnosisEngineResult) { const overall = confidenceBy(result.casts.map((cast) => cast.confidence.overall.level)); const steps = Object.fromEntries(STEPS.map((step) => [step, confidenceBy(result.casts.map((cast) => cast.confidence.steps[step].level))])); return { overall, steps }; }

function castDiffs(baseline: CastDiagnosisEngineResult, current: CastDiagnosisEngineResult) {
  const oldById = new Map(baseline.casts.map((cast) => [cast.fact.castId, cast])); const changed: unknown[] = [];
  for (const cast of current.casts) { const old = oldById.get(cast.fact.castId); if (!old || old.diagnosis.primaryType === cast.diagnosis.primaryType) continue; changed.push({ castId: cast.fact.castId, castName: cast.fact.castName, storeLabels: cast.fact.storeLabels, attendanceDays: cast.fact.attendanceDays.value, workingHours: cast.fact.workingHours.value, contracts: cast.fact.contracts.value, hourlyReward: cast.fact.hourlyReward.value, baseline: { primaryType: old.diagnosis.primaryType, secondaryTypes: old.diagnosis.secondaryTypes, confidence: old.confidence.overall.level, facts: old.diagnosis.facts, reviewTargets: old.diagnosis.reviewTargets }, current: { primaryType: cast.diagnosis.primaryType, secondaryTypes: cast.diagnosis.secondaryTypes, confidence: cast.confidence.overall.level, facts: cast.diagnosis.facts, reviewTargets: cast.diagnosis.reviewTargets }, metricDiffs: cast.comparisons.map((comparison) => ({ metricKey: comparison.metricKey, current: { axis: comparison.comparisonAxis, median: comparison.peerMedianMetric.value, ratio: comparison.relativeRatio, validPeerCount: comparison.validPeerCount ?? 0, availability: comparison.peerMedianMetric.availability, diagnosticUsage: comparison.diagnosticUsage ?? "FORMAL" } })), changeReasons: ["比較軸変更によりPrimaryが変更"], validationViolations: validateDiagnosisAssignment(cast).violations }); }
  return changed;
}

export function buildCastDiagnosisAuditReport(baseline: CastDiagnosisEngineResult, current: CastDiagnosisEngineResult, period: { from: string; to: string }, gitCommit: string | null = null): CastDiagnosisAuditReport {
  const validationViolations = current.casts.flatMap((cast) => { const result = validateDiagnosisAssignment(cast); return result.valid ? [] : [{ castId: cast.fact.castId, castName: cast.fact.castName, primaryType: cast.diagnosis.primaryType, violations: result.violations }]; });
  const axis = axisAudit(current); const facts = factsAudit(current); const changed = castDiffs(baseline, current); const oldOther = new Set(baseline.casts.filter((cast) => cast.diagnosis.primaryType === "OTHER_REVIEW").map((cast) => cast.fact.castId)); const currentOther = new Set(current.casts.filter((cast) => cast.diagnosis.primaryType === "OTHER_REVIEW").map((cast) => cast.fact.castId));
  const newlyEntered = [...currentOther].filter((id) => !oldOther.has(id)).map((id) => { const cast = current.casts.find((item) => item.fact.castId === id)!; return { castId: id, castName: cast.fact.castName, baselinePrimary: baseline.casts.find((item) => item.fact.castId === id)?.diagnosis.primaryType, nearestDiagnosis: null, reasons: [cast.diagnosis.otherReviewReason ?? "NO_EXPLICIT_DIAGNOSIS_MATCH"] }; });
  const currentMain = current.casts.filter(main); const baselineMain = baseline.casts.filter(main); const expectedRepresentatives: Record<string, CastDiagnosisType> = { "あゆみ": "LOW_REPEAT_CONVERSION", "まゆ": "STABLE_HIGH_EFFICIENCY", "ゆあ": "STABLE_HIGH_EFFICIENCY", "まりな": "STABLE_HIGH_EFFICIENCY", "りあ": "STABLE_HIGH_EFFICIENCY" }; const representativeReasons = Object.entries(expectedRepresentatives).flatMap(([name, expected]) => { const cast = current.casts.find((item) => item.fact.castName === name); return cast && cast.diagnosis.primaryType !== expected ? [`代表${name}のPrimaryが${expected}ではありません`] : []; }); const allCountMismatch = DIAGNOSES.reduce((n, key) => n + current.casts.filter((cast) => cast.diagnosis.primaryType === key).length, 0) !== current.casts.length; const mainCountMismatch = DIAGNOSES.reduce((n, key) => n + currentMain.filter((cast) => cast.diagnosis.primaryType === key).length, 0) !== currentMain.length; const stoppedReasons = [...(changed.length >= 15 ? ["Primary変更が15名以上"] : []), ...(validationViolations.length ? ["Diagnosis違反"] : []), ...(axis.mismatchCount ? ["比較軸不一致"] : []), ...(facts.mismatchCount ? ["Facts不一致"] : []), ...(allCountMismatch || mainCountMismatch ? ["診断数不一致"] : []), ...representativeReasons];
  return { metadata: { generatedAt: new Date().toISOString(), period, comparisonModes: { baseline: "LEGACY_RESULT_TOP_ONLY", current: "AXIS_SPECIFIC" }, diagnosisVersion: current.thresholds.version, thresholdsVersion: current.thresholds.version, gitCommit }, dataset: { totalFactCastCount: current.casts.length, mainAttendanceCastCount: currentMain.length, nonMainAttendanceCastCount: current.casts.length - currentMain.length, comparisonEligibleCount: current.comparisonGroup.eligibleCastCount, topGroupCount: current.comparisonGroup.topGroupCastCount }, summary: { baselineDiagnosisCounts: countBy(baseline.casts.map((cast) => cast.diagnosis.primaryType)), currentDiagnosisCounts: countBy(current.casts.map((cast) => cast.diagnosis.primaryType)), baselineMainDiagnosisCounts: countBy(baselineMain.map((cast) => cast.diagnosis.primaryType)), currentMainDiagnosisCounts: countBy(currentMain.map((cast) => cast.diagnosis.primaryType)), baselineConfidenceCounts: confidenceBy(baseline.casts.map((cast) => cast.confidence.overall.level)), currentConfidenceCounts: confidenceBy(current.casts.map((cast) => cast.confidence.overall.level)), primaryChangedCount: changed.length, primaryUnchangedCount: current.casts.length - changed.length, validationViolationCount: validationViolations.length, factsMismatchCount: facts.mismatchCount, axisMismatchCount: axis.mismatchCount, stoppedBySafetyCondition: stoppedReasons.length > 0, safetyReasons: stoppedReasons }, changedCasts: changed, representativeCasts: current.casts.filter((cast) => ["あゆみ", "まゆ", "ゆあ", "まりな", "りあ"].includes(cast.fact.castName)).map((cast) => ({ castId: cast.fact.castId, castName: cast.fact.castName, storeLabels: cast.fact.storeLabels, primaryType: cast.diagnosis.primaryType, confidence: cast.confidence.overall.level, comparisons: cast.comparisons, facts: cast.diagnosis.facts, reviewTargets: cast.diagnosis.reviewTargets, validation: validateDiagnosisAssignment(cast) })), validation: { checkedCastCount: current.casts.length, validCastCount: current.casts.length - validationViolations.length, invalidCastCount: validationViolations.length, violations: validationViolations }, axisAudit: axis, factsAudit: facts, availabilityAudit: availabilityAudit(current), confidenceAudit: { baselineOverall: confidenceAudit(baseline).overall, currentOverall: confidenceAudit(current).overall, baselineSteps: confidenceAudit(baseline).steps, currentSteps: confidenceAudit(current).steps }, otherReviewAudit: { baselineCount: oldOther.size, currentCount: currentOther.size, remainedCount: [...currentOther].filter((id) => oldOther.has(id)).length, newlyEnteredCount: newlyEntered.length, exitedCount: [...oldOther].filter((id) => !currentOther.has(id)).length, reasonCounts: Object.fromEntries([...new Set(current.casts.filter((cast) => cast.diagnosis.primaryType === "OTHER_REVIEW").map((cast) => cast.diagnosis.otherReviewReason ?? "NO_EXPLICIT_DIAGNOSIS_MATCH"))].map((reason) => [reason, current.casts.filter((cast) => cast.diagnosis.otherReviewReason === reason).length])), newlyEntered } };
}
