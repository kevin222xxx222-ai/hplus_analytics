export type MetricValue = number | null;
export type Confidence = "High" | "Medium" | "Low" | "Insufficient";
export type AnalysisStatus = "OK" | "Unavailable" | "DataInsufficient";
/** Distinguishes an observed zero from missing or non-computable values. */
export type Availability = "VALUE" | "ZERO" | "MISSING" | "UNCOMPUTABLE" | "UNAVAILABLE" | "INSUFFICIENT_SAMPLE";
export type Result<T> = { status: AnalysisStatus; value: T | null; warnings: string[] };

export type VolumeMetric =
  | "sales" | "castReward" | "profit" | "reservations" | "services" | "regularNominations"
  | "free" | "new" | "repeat" | "paidOptions" | "diaryPosts" | "townPv" | "townUu"
  | "heavenAccess" | "attendancePeople" | "attendanceMinutes";

export type GroupDimension = "store" | "cast" | "rank" | "media" | "weekday" | "period";

export type AnalyticsRow = {
  date: string | Date;
  storeId?: string | null;
  castId?: string | null;
  rank?: string | null;
  media?: "CTI" | "TOWN" | "HEAVEN" | null;
  metrics: Partial<Record<VolumeMetric, MetricValue>>;
  /** Optional stable source key. Rows with the same key are counted once. */
  naturalKey?: string | null;
};

export type VolumeSummary = {
  status: AnalysisStatus;
  groupKey: string;
  dimensions: Record<string, string | null>;
  metrics: Record<VolumeMetric, MetricValue>;
  metricAvailability: Record<VolumeMetric, Availability>;
  sample: SampleSummary;
};

export type SampleSummary = {
  targetDays: number;
  attendanceCount: number;
  uniqueCastCount: number;
  totalAttendanceHours: number;
  mediaDataDays: number;
  comparisonCount?: number;
  confidence: Confidence;
  sampleKind: "attendanceDays" | "attendanceCount" | "comparisonCount" | "mediaDays";
};

export type EfficiencySummary = {
  status: AnalysisStatus;
  salesPerHour: MetricValue;
  salesPerPerson: MetricValue;
  rewardPerHour: MetricValue;
  rewardPerPerson: MetricValue;
  reservationsPerHour: MetricValue;
  reservationsPerPerson: MetricValue;
  averageUnitPrice: MetricValue;
  regularNominationRate: MetricValue;
  utilizationRate: MetricValue;
  theoreticalMaxHourly: MetricValue;
  currentHourly: MetricValue;
  opIncludedHourly: MetricValue;
  theoreticalMaxAchievementRate: MetricValue;
  metricAvailability: Record<EfficiencyMetric, Availability>;
};

export type EfficiencyMetric = "salesPerHour" | "salesPerPerson" | "rewardPerHour" | "rewardPerPerson" | "reservationsPerHour" | "reservationsPerPerson" | "averageUnitPrice" | "regularNominationRate" | "utilizationRate" | "theoreticalMaxHourly" | "currentHourly" | "opIncludedHourly" | "theoreticalMaxAchievementRate";

export type BaselineKind = "previousDay" | "previousWeek" | "previousWeekday" | "previousMonth" | "previousMonthToDate" | "personalAverage" | "storeAverage" | "rankAverage";

export type DateRange = { from: string; to: string };

export type BaselineValue = {
  kind: BaselineKind;
  status: "Available" | "Unavailable";
  value: MetricValue;
  reason?: string;
  sample?: SampleSummary;
};

export type Comparison = {
  status: "Available" | "Unavailable";
  current: MetricValue;
  baseline: MetricValue;
  delta: MetricValue;
  changeRate: MetricValue;
  improvementRate: MetricValue;
  baselineKind: BaselineKind;
  reason?: string;
  availability: Availability;
  currentAvailability: Availability;
  baselineAvailability: Availability;
};

export type TrendResult = Comparison & {
  direction: "improved" | "worsened" | "flat" | "unavailable";
};

export type WeekdayAnalysis = {
  weekday: number;
  label: string;
  volume: VolumeSummary;
  efficiency: EfficiencySummary;
  sample: SampleSummary;
};

export type WeekdaySuitability = {
  status: "Suitable" | "Data不足" | "Neutral";
  weekday: number;
  confidence: Confidence;
  personalDelta: MetricValue;
  storeDelta: MetricValue;
  rankDelta: MetricValue;
  evidence: string[];
};

export type GrowthPotential = "Exposure不足" | "Activity不足" | "Efficiency改善余地" | "Schedule制約" | "Capacity上限" | "Data不足" | "安定維持";

export type GrowthInput = {
  confidence: Confidence;
  exposure: MetricValue;
  exposureBaseline: MetricValue;
  activity: MetricValue;
  activityBaseline: MetricValue;
  efficiency: MetricValue;
  efficiencyBaseline: MetricValue;
  utilizationRate: MetricValue;
  theoreticalMaxAchievementRate: MetricValue;
  attendanceHours: MetricValue;
  maxAttendanceHours?: MetricValue;
};

export type GrowthResult = {
  classification: GrowthPotential;
  status: AnalysisStatus;
  score: number;
  evidence: string[];
  missingMetrics?: string[];
};

export type NextBestAction = {
  classification: GrowthPotential;
  cause: string;
  evidence: string[];
  action: string | null;
  recommendationLevel: "ACTION" | "REFERENCE" | "NONE";
  confidence: Confidence;
  status: AnalysisStatus;
};

export type AnalysisSummary = {
  status: AnalysisStatus;
  sample: SampleSummary;
  volume: VolumeSummary;
  efficiency: EfficiencySummary;
  trend?: TrendResult;
  growth?: GrowthResult;
  nextBestAction?: NextBestAction;
};
