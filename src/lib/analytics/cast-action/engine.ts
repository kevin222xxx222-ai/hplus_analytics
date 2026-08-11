import { buildActionAuditCandidate, type CastActionAuditCandidate } from "@/lib/analytics/cast-diagnosis/action-audit";
import type { CastEngineCast } from "@/lib/analytics/cast-diagnosis/types";
import { ACTION_RULE_LABELS, ACTION_STAGE_LABELS, CAST_ACTION_LABELS, CAST_ACTION_VERSION } from "./messages";
import { calculatePriority } from "./priority";
import type { CastActionEngineInput, CastActionItem, CastActionPlan, CastActionStageResult } from "./types";

const comparison = (cast: CastEngineCast, key: string) => cast.comparisons.find((item) => item.metricKey === key);
const stageMetricKeys: Record<string, { primary: string | null; supporting: string[] }> = { result: { primary: "hourlyReward", supporting: ["femaleReward", "contractsPerHour", "contractsPerDay"] }, pageTraffic: { primary: "townUu", supporting: ["townPv", "heavenPageAccess", "heavenDiaryPosts"] }, photoConversion: { primary: "photoNominationsPer100Uu", supporting: ["photoNominationsPerHour", "photoNominations", "photoNominationsPerDay"] }, repeatConversion: { primary: "mainNominationRate", supporting: ["mainNominations", "repeatShare", "repeatCount"] } };
const metricLabel = (key: string) => ({ hourlyReward: "平均時給", townUu: "Town UU", photoNominationsPer100Uu: "100UUあたり写真指名", mainNominationRate: "本指名率" } as Record<string, string>)[key] ?? key;
function stageResult(cast: CastEngineCast, stage: string, state: CastActionAuditCandidate["stageStates"][keyof CastActionAuditCandidate["stageStates"]]): CastActionStageResult {
  const keys = stageMetricKeys[stage]; const primary = keys.primary ? comparison(cast, keys.primary) : undefined; const warnings: string[] = [];
  if (stage === "result") { const aux = keys.supporting.map((key) => comparison(cast, key)).filter(Boolean); if (aux.some((item) => item!.status === "BELOW") && primary?.status === "ABOVE") warnings.push("RESULT_METRICS_MIXED"); }
  if (stage === "pageTraffic") { const diary = comparison(cast, "heavenDiaryPosts"); if (diary?.status === "BELOW" && primary?.status !== "BELOW") warnings.push("HEAVEN_DIARY_ALONE_NOT_PAGE_STATE"); }
  return { state, label: ACTION_STAGE_LABELS[state], primaryMetricKey: keys.primary, supportingMetricKeys: keys.supporting, comparisonRatio: primary?.relativeRatio ?? null, availability: primary?.peerMedianMetric.availability ?? "MISSING", diagnosticUsage: primary?.diagnosticUsage ?? "NOT_AVAILABLE", reason: primary ? `${primary.label}の比較状態を段階状態へ正規化` : "正式な比較値がありません", warnings };
}
const item = (value: CastActionAuditCandidate["reviewItems"][number]): CastActionItem => ({ key: value.key, label: value.label, description: value.reason, reason: value.reason, evidenceMetricKeys: value.evidenceMetricKeys, humanJudgmentRequired: value.humanJudgmentRequired });
const keepItem = (value: CastActionAuditCandidate["keepItems"][number]): CastActionItem => ({ key: value.key, label: value.label, description: value.reason, reason: value.reason, evidenceMetricKeys: value.evidenceMetricKeys, humanJudgmentRequired: false });
const avoidItem = (value: CastActionAuditCandidate["avoidItems"][number]): CastActionItem => ({ key: value.key, label: value.label, description: value.reason, reason: value.reason, evidenceMetricKeys: [], humanJudgmentRequired: false });

export function buildCastActionPlan(input: CastActionEngineInput): CastActionPlan {
  const candidate = buildActionAuditCandidate(input.cast); const actionType = candidate.proposedAction.type; const formalComparison = input.cast.comparisons.find((comparison) => comparison.peerMedianMetric.availability === "VALUE" || comparison.peerMedianMetric.availability === "ZERO"); const warnings = [...candidate.warnings]; const stageStates = candidate.stageStates;
  const results = { result: stageResult(input.cast, "result", stageStates.result), pageTraffic: stageResult(input.cast, "pageTraffic", stageStates.pageTraffic), photoConversion: stageResult(input.cast, "photoConversion", stageStates.photoConversion), repeatConversion: stageResult(input.cast, "repeatConversion", stageStates.repeatConversion) };
  for (const result of Object.values(results)) for (const warning of result.warnings) if (!warnings.includes(warning)) warnings.push(warning);
  const priority = calculatePriority({ actionType, result: stageStates.result, confidence: candidate.confidence as "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT", hasFormalComparison: Boolean(formalComparison), warningCodes: warnings });
  const evidence = input.cast.diagnosis.facts.map((fact) => ({ metricKey: fact.metricKey, label: fact.label, castValue: fact.castValue, comparisonValue: fact.peerMedianValue, comparisonRatio: fact.relativeRatio, availability: fact.availability, diagnosticUsage: fact.diagnosticUsage ?? "FORMAL", statement: fact.statement }));
  const focus = candidate.nextMonthFocus.map((focusItem) => { const metric = input.cast.fact[focusItem.metricKey as keyof typeof input.cast.fact]; return { metricKey: focusItem.metricKey, label: metricLabel(focusItem.metricKey), direction: focusItem.direction, currentValue: metric && typeof metric === "object" && "value" in metric ? metric.value : null, availability: metric && typeof metric === "object" && "availability" in metric ? metric.availability : "MISSING", reason: focusItem.reason }; });
  const actionWarnings = warnings.map((warning) => ({ code: warning, message: warning === "RESULT_METRICS_MIXED" ? "結果の補助指標が主指標と異なる状態です。主指標だけで判定を変更しません。" : warning, metricKeys: [] }));
  return { version: CAST_ACTION_VERSION, castId: input.cast.fact.castId, castName: input.cast.fact.castName, storeLabels: input.cast.fact.storeLabels, period: input.period, actionType, actionLabel: CAST_ACTION_LABELS[actionType], priority: priority.priority === "HIGH" && actionType === "REVIEW_BOOKING_EFFICIENCY" ? "MEDIUM" : priority.priority, priorityScore: priority.score, conclusion: { title: CAST_ACTION_LABELS[actionType], summary: candidate.proposedAction.conclusion }, stageStates: results, keepItems: candidate.keepItems.map(keepItem), reviewItems: candidate.reviewItems.map(item), avoidItems: candidate.avoidItems.map(avoidItem), nextMonthFocus: focus, comparisonSource: input.cast.comparisonSource, appliedRule: { key: candidate.appliedRule, label: ACTION_RULE_LABELS[candidate.appliedRule] ?? candidate.appliedRule }, evidence, confidence: { level: candidate.confidence as "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT", reasons: input.cast.confidence.overall.reasons }, warnings: actionWarnings, humanJudgmentRequired: candidate.reviewItems.some((review) => review.humanJudgmentRequired) || ["REVIEW_BOOKING_EFFICIENCY", "MANUAL_REVIEW"].includes(actionType), auditCandidate: candidate };
}

/** Removes the internal legacy-audit bridge before a plan crosses a service/API boundary. */
export function toPublicCastActionPlan(plan: CastActionPlan): Omit<CastActionPlan, "auditCandidate"> {
  const publicPlan = { ...plan } as Omit<CastActionPlan, "auditCandidate"> & { auditCandidate?: CastActionPlan["auditCandidate"] };
  delete publicPlan.auditCandidate;
  return publicPlan;
}
