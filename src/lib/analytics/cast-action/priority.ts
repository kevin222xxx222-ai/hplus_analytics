import type { ActionPriority, CastActionType, ActionStageState } from "./types";

export function calculatePriority(input: { actionType: CastActionType; result: ActionStageState; confidence: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT"; hasFormalComparison: boolean; warningCodes: string[]; }) {
  if (input.actionType === "MAINTAIN_CURRENT") return { score: 0, priority: "NONE" as ActionPriority };
  if (input.actionType === "WAIT_FOR_MORE_DATA") return { score: 0, priority: "LOW" as ActionPriority };
  const severity = input.result === "LOW" ? 3 : input.result === "BORDERLINE" ? 2 : input.result === "ADEQUATE" ? 1 : 0;
  const clarity = input.actionType === "REVIEW_PAGE_TRAFFIC" || input.actionType === "REVIEW_PROFILE_CONVERSION" || input.actionType === "REVIEW_REPEAT_CONVERSION" ? 2 : input.actionType === "REVIEW_BOOKING_EFFICIENCY" || input.actionType === "MONITOR_BORDERLINE" ? 1 : 0;
  const confidence = input.confidence === "HIGH" ? 2 : input.confidence === "MEDIUM" ? 1 : 0;
  const possibility = ["REVIEW_PAGE_TRAFFIC", "REVIEW_PROFILE_CONVERSION", "REVIEW_REPEAT_CONVERSION"].includes(input.actionType) ? 1 : 0;
  const score = severity + clarity + confidence + possibility;
  const eligibleHigh = ["REVIEW_PAGE_TRAFFIC", "REVIEW_PROFILE_CONVERSION", "REVIEW_REPEAT_CONVERSION"].includes(input.actionType) && input.result === "LOW" && ["HIGH", "MEDIUM"].includes(input.confidence) && input.hasFormalComparison && input.warningCodes.length === 0;
  const priority: ActionPriority = eligibleHigh && score >= 6 ? "HIGH" : score >= 4 ? "MEDIUM" : score >= 2 ? "LOW" : "NONE";
  return { score, priority };
}
