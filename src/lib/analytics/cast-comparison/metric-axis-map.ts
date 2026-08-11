import type { CastComparisonAxis, CastMetricKey } from "./types";

export const CAST_METRIC_COMPARISON_AXIS = {
  femaleReward: "RESULT_TOP_PEERS",
  hourlyReward: "RESULT_TOP_PEERS",
  contracts: "RESULT_TOP_PEERS",
  workingHours: "RESULT_TOP_PEERS",
  contractsPerDay: "RESULT_TOP_PEERS",
  contractsPerHour: "RESULT_TOP_PEERS",
  townPv: "MAIN_ATTENDANCE_PEERS",
  townUu: "MAIN_ATTENDANCE_PEERS",
  heavenPageAccess: "MAIN_ATTENDANCE_PEERS",
  heavenDiaryPosts: "MAIN_ATTENDANCE_PEERS",
  heavenMyGirlAdds: "MAIN_ATTENDANCE_PEERS",
  heavenFavoriteTalks: "MAIN_ATTENDANCE_PEERS",
  heavenMyGirlAddsPer100Access: "MAIN_ATTENDANCE_PEERS",
  heavenMyGirlAddsPer100TownUu: "MAIN_ATTENDANCE_PEERS",
  heavenFavoriteTalksPerAttendanceDay: "MAIN_ATTENDANCE_PEERS",
  heavenFavoriteTalksPer100Access: "MAIN_ATTENDANCE_PEERS",
  photoNominations: "NEW_ACQUISITION_PEERS",
  photoNominationsPerDay: "NEW_ACQUISITION_PEERS",
  photoNominationsPerHour: "NEW_ACQUISITION_PEERS",
  photoNominationsPer100Uu: "NEW_ACQUISITION_PEERS",
  photoNominationShare: "NEW_ACQUISITION_PEERS",
  mainNominations: "REPEAT_CONVERSION_PEERS",
  mainNominationRate: "REPEAT_CONVERSION_PEERS",
  repeatCount: "REPEAT_CONVERSION_PEERS",
  repeatShare: "REPEAT_CONVERSION_PEERS",
} as const satisfies Partial<Record<CastMetricKey, CastComparisonAxis>>;

export function comparisonAxisForMetric(metricKey: CastMetricKey): CastComparisonAxis {
  const axis = CAST_METRIC_COMPARISON_AXIS[metricKey];
  if (!axis) throw new Error(`CAST_METRIC_COMPARISON_AXIS_UNMAPPED:${metricKey}`);
  return axis;
}
