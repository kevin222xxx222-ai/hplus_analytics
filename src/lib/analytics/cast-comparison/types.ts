import type { Availability } from "@/lib/analytics/engine/types";
import type { CastMetric, CastMonthlyFact } from "@/lib/analytics/cast-diagnosis/types";

export type CastMetricKey =
  | "femaleReward" | "hourlyReward" | "contracts" | "workingHours" | "contractsPerDay" | "contractsPerHour"
  | "townPv" | "townUu" | "heavenPageAccess" | "heavenDiaryPosts"
  | "heavenMyGirlAdds" | "heavenFavoriteTalks" | "heavenMyGirlAddsPer100Access" | "heavenMyGirlAddsPer100TownUu" | "heavenFavoriteTalksPerAttendanceDay" | "heavenFavoriteTalksPer100Access"
  | "photoNominations" | "photoNominationsPerDay" | "photoNominationsPerHour" | "photoNominationsPer100Uu" | "photoNominationShare"
  | "mainNominations" | "mainNominationRate" | "repeatCount" | "repeatShare";

export type CastComparisonAxis =
  | "RESULT_TOP_PEERS"
  | "MAIN_ATTENDANCE_PEERS"
  | "NEW_ACQUISITION_PEERS"
  | "REPEAT_CONVERSION_PEERS";

export type CastComparisonProviderMode = "LEGACY_RESULT_TOP_ONLY" | "AXIS_SPECIFIC";

export const CAST_COMPARISON_AXIS_LABELS = {
  RESULT_TOP_PEERS: "近い稼働量の結果上位キャスト",
  MAIN_ATTENDANCE_PEERS: "近い稼働量のメイン出勤キャスト",
  NEW_ACQUISITION_PEERS: "新規獲得を必要とする比較キャスト",
  REPEAT_CONVERSION_PEERS: "新規接客母数がある比較キャスト",
} as const satisfies Record<CastComparisonAxis, string>;

export type CastPeerSelectionMethod =
  | "SIMILAR_WORKING_HOURS_40"
  | "SIMILAR_WORKING_HOURS_60"
  | "ALL_AXIS_CANDIDATES"
  | "RESULT_TOP_GROUP_FALLBACK"
  | "INSUFFICIENT";

export type CastMetricPeerComparison = {
  subjectCastId: string;
  subjectCastName: string;
  metricKey: CastMetricKey;
  axis: CastComparisonAxis;
  axisLabel: string;
  subject: CastMetric<number>;
  median: CastMetric<number>;
  ratio: CastMetric<number>;
  availability: Availability;
  selection: {
    method: CastPeerSelectionMethod;
    candidateCount: number;
    validPeerCount: number;
    selfExcluded: boolean;
    workingHoursRange: { minimum: number; maximum: number } | null;
    fallbackReason: string | null;
  };
  peers: Array<{
    castId: string;
    castName: string;
    storeLabels: string[];
    workingHours: CastMetric<number>;
    metric: CastMetric<number>;
    sortedPosition: number;
    isMedianPosition: boolean;
    inclusionReasons: string[];
    exclusionFlags?: string[];
  }>;
  medianEvidence: {
    method: "ODD_CENTER" | "EVEN_CENTER_AVERAGE";
    centerValues: number[];
    centerPositions: number[];
  } | null;
  diagnosticUsage: "FORMAL" | "REFERENCE_ONLY" | "NOT_AVAILABLE";
};

export type NewAcquisitionExclusionEvidence = {
  castId: string;
  castName: string;
  storeLabels: string[];
  excludedAsMatureMainNominationCast: boolean;
  values: {
    hourlyReward: CastMetric<number>;
    mainNominationRate: CastMetric<number>;
    newAcquisitionShare: CastMetric<number>;
    contracts: CastMetric<number>;
  };
  matchedConditions: {
    hourlyRewardAtLeast3000: boolean;
    mainNominationRateAtLeast50Percent: boolean;
    newAcquisitionShareBelow25Percent: boolean;
    contractsAtLeast10: boolean;
  };
};

export type CastComparisonInput = {
  facts: CastMonthlyFact[];
  /** Existing diagnosis result's result-top group. Supplying it avoids changing diagnosis selection. */
  resultTopGroup?: CastMonthlyFact[];
  rollingResultTopGroup?: CastMonthlyFact[];
  mode?: CastComparisonProviderMode;
};

export type CastComparisonAudit = {
  comparisons: CastMetricPeerComparison[];
  newAcquisitionExclusions: NewAcquisitionExclusionEvidence[];
};

export type CastAxisAuditSummary = {
  axis: CastComparisonAxis;
  castCount: number;
  metricComparisonCount: number;
  peerCount: { minimum: number; median: number | null; maximum: number };
  methodCounts: Record<CastPeerSelectionMethod, number>;
  availabilityCounts: Record<string, number>;
  insufficientCount: number;
};
