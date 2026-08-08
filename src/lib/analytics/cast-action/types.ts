import type { CastEngineCast } from "@/lib/analytics/cast-diagnosis/types";
import type { ActionStageState, CastActionType, ActionPriority, CastActionAuditCandidate } from "@/lib/analytics/cast-diagnosis/action-audit";

export type { ActionStageState, CastActionType, ActionPriority };
export type CastActionStageResult = { state: ActionStageState; label: string; primaryMetricKey: string | null; supportingMetricKeys: string[]; comparisonRatio: number | null; availability: string; diagnosticUsage: string; reason: string; warnings: string[] };
export type CastActionItem = { key: string; label: string; description: string; reason: string; evidenceMetricKeys: string[]; humanJudgmentRequired: boolean };
export type CastActionFocusItem = { metricKey: string; label: string; direction: "MAINTAIN" | "IMPROVE" | "MONITOR"; currentValue: number | null; availability: string; reason: string };
export type CastActionEvidence = { metricKey: string; label: string; castValue: number | null; comparisonValue: number | null; comparisonRatio: number | null; availability: string; diagnosticUsage: string; statement: string };
export type CastActionWarning = { code: string; message: string; metricKeys: string[] };
export type CastActionPlan = {
  version: string; castId: string; castName: string; storeLabels: string[]; period: { from: string; to: string };
  actionType: CastActionType; actionLabel: string; priority: ActionPriority; priorityScore: number;
  conclusion: { title: string; summary: string };
  stageStates: { result: CastActionStageResult; pageTraffic: CastActionStageResult; photoConversion: CastActionStageResult; repeatConversion: CastActionStageResult };
  keepItems: CastActionItem[]; reviewItems: CastActionItem[]; avoidItems: CastActionItem[]; nextMonthFocus: CastActionFocusItem[];
  comparisonSource: { method: string; peerCount: number; medianSourceLabel: string };
  appliedRule: { key: string; label: string }; evidence: CastActionEvidence[]; confidence: { level: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT"; reasons: string[] }; warnings: CastActionWarning[]; humanJudgmentRequired: boolean;
  /** Internal audit bridge; not exposed by API. */
  auditCandidate: CastActionAuditCandidate;
};
export type CastActionEngineInput = { cast: CastEngineCast; period: { from: string; to: string } };
