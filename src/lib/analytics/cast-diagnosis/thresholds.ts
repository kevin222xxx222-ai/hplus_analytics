export const CAST_DIAGNOSIS_THRESHOLDS = {
  version: "cast-diagnosis-v1",
  mainAttendanceDays: 2,
  comparisonMinimumDays: 4,
  comparisonMinimumHours: 20,
  comparisonMinimumContracts: 5,
  comparisonTopPercentile: 0.25,
  minimumPeerCount: 3,
  similarWorkingHoursRange: 0.4,
  minimumDiagnosisHours: 10,
  goodHourlyReward: 3000,
  completedHourlyReward: 4000,
  strongNominationRate: 0.5,
  goodNominationRate: 0.4,
  lowNominationRate: 0.25,
  comparableRatio: 0.8,
  lowRatio: 0.6,
  lowTrafficRatio: 0.7,
  nominationMinimumContracts: 10,
  conversionMinimumUu: 100,
  confidenceReferenceMaxDays: 3,
  confidenceStandardMaxDays: 7,
} as const;

export type CastDiagnosisThresholds = typeof CAST_DIAGNOSIS_THRESHOLDS;

export function thresholdsDto() {
  const t = CAST_DIAGNOSIS_THRESHOLDS;
  return {
    version: t.version,
    analysisTarget: { mainAttendanceDays: t.mainAttendanceDays, minimumDiagnosisHours: t.minimumDiagnosisHours },
    comparisonGroup: { minimumDays: t.comparisonMinimumDays, minimumHours: t.comparisonMinimumHours, minimumContracts: t.comparisonMinimumContracts, minimumDiagnosisHours: t.minimumDiagnosisHours, candidateRule: "平均時給算出可能かつ稼働10時間以上、出勤4日以上または稼働20時間以上または成約5本以上", topPercentile: t.comparisonTopPercentile, minimumPeerCount: t.minimumPeerCount, similarWorkingHoursRange: t.similarWorkingHoursRange, selfExcludedFromMedian: true },
    absoluteStandards: { goodHourlyReward: t.goodHourlyReward, completedHourlyReward: t.completedHourlyReward, strongNominationRate: t.strongNominationRate, goodNominationRate: t.goodNominationRate, lowNominationRate: t.lowNominationRate },
    relativeStandards: { comparableRatio: t.comparableRatio, lowRatio: t.lowRatio, lowTrafficRatio: t.lowTrafficRatio },
    minimumSamples: { nominationContracts: t.nominationMinimumContracts, conversionUu: t.conversionMinimumUu, nominationContractsMeaning: "本指名率を正式評価する最低母数。安定高効率型のPrimary条件ではなく、再来転換確認型では正式条件として使用。成約本数は主にConfidenceへ使用します。" },
    comparisonScope: { scope: "MANAGED_ALL" as const, description: "春日部・越谷・野田をcastId単位で統合した管轄全体" },
    newAcquisitionExclusion: { hourlyRewardMinimum: 3000, mainNominationRateMinimum: 0.5, newAcquisitionShareMaximum: 0.25, contractsMinimum: 10 },
    diagnosisDefinitions: {
      STABLE_HIGH_EFFICIENCY: "平均時給3,000円以上、時給比80%以上、本指名率40%以上。成約10本以上はPrimary条件ではありません。",
      LIMITED_BY_AVAILABILITY: "安定高効率条件に加え、女子報酬比60%未満かつ稼働時間比60%未満。成約本数はPrimary条件ではありません。",
      LOW_REPEAT_CONVERSION: "写真指名/時間比80%以上、本指名率25%未満、成約10本以上。成約10本未満では参考値として扱います。",
      OTHER_REVIEW: "他の明示診断条件に該当しない、母数を満たした確認対象。補助理由を付与し、具体条件型とフォールバック型を混在させない。",
      INSUFFICIENT_DATA: "出勤2日未満、稼働10時間未満、平均時給算出不能、または比較群3名未満のいずれか。",
    },
    cautions: ["媒体から予約・成約への経路は特定しません。", "母数不足では確定診断を行いません。", "Heaven非掲載・未取得は0として扱いません。"],
  };
}
