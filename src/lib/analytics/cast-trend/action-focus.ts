import type { CastTrendActionFocus } from "./types";

const focus: Record<string, Omit<CastTrendActionFocus, "actionType">> = {
  REVIEW_REPEAT_CONVERSION: { primaryMetricKeys: ["mainNominationRate", "repeatShare"], maintainMetricKeys: ["townUu", "photoNominationsPer100Uu"], monitorMetricKeys: ["contracts"], reason: "本指名・再来に関係する指標を優先表示します。" },
  REVIEW_PAGE_TRAFFIC: { primaryMetricKeys: ["townUu", "townPv", "heavenPageAccess"], maintainMetricKeys: ["photoNominationsPer100Uu"], monitorMetricKeys: ["contracts"], reason: "媒体流入に関係する指標を優先表示します。" },
  REVIEW_PROFILE_CONVERSION: { primaryMetricKeys: ["photoNominationsPer100Uu", "photoNominationsPerHour"], maintainMetricKeys: ["townUu", "townPv"], monitorMetricKeys: ["contracts"], reason: "写真指名への転換に関係する指標を優先表示します。" },
  REVIEW_BOOKING_EFFICIENCY: { primaryMetricKeys: ["hourlyReward", "contractsPerHour", "contractsPerDay"], maintainMetricKeys: ["workingHours", "attendanceDays"], monitorMetricKeys: ["contracts"], reason: "結果効率に関係する指標を優先表示します。" },
  MAINTAIN_CURRENT: { primaryMetricKeys: ["hourlyReward", "mainNominationRate", "photoNominationsPer100Uu"], maintainMetricKeys: ["femaleReward", "contracts"], monitorMetricKeys: ["repeatShare"], reason: "現在の実績を維持する指標を優先表示します。" },
};
export const actionFocusFor = (actionType: string | null): CastTrendActionFocus => ({ actionType, ...(focus[actionType ?? ""] ?? { primaryMetricKeys: ["hourlyReward", "contracts", "workingHours"], maintainMetricKeys: [], monitorMetricKeys: [], reason: "主要な結果指標を優先表示します。" }) });
