export type TownReferenceConfig = {
  minimumTownUu: number;
  minimumCtiContracts: number;
  minimumAttendanceMinutes: number;
  excellentTelRateQuantile: number;
};

export type TownReferenceInput = {
  pv: number;
  uu: number;
  telTapUu: number;
  salesAmount: number;
  castRewardAmount: number;
  contractCount: number;
  regularNominationCount: number;
  attendanceMinutes: number;
  hasTownData: boolean;
  hasCtiData: boolean;
};

export type TownReferenceMetrics = TownReferenceInput & {
  telRate: number | null;
  calculatedContractPerUu: number | null;
  salesPerUu: number | null;
  salesPerTel: number | null;
  regularNominationRate: number | null;
};

export type TownReferenceRow = { id: string; name: string; metrics: TownReferenceMetrics };
export type TownReferenceRankKey = "pv" | "uu" | "telTapUu" | "telRate" | "salesAmount" | "castRewardAmount" | "contractCount" | "regularNominationRate" | "salesPerUu";
export type TownReferenceRank = { id: string; name: string; value: number; rank: number };
export type TownEvaluationCode = "EXCELLENT" | "GOOD" | "WATCH" | "INSUFFICIENT_DATA";

export type TownReferenceTownRecord = { date: Date; storeId: string; pv: number; uu: number; telTapUu: number };
export type TownReferenceCtiRecord = {
  businessDate: Date;
  storeId: string;
  salesAmount: number;
  castRewardAmount: number;
  contractCount: number;
  regularNominationCount: number;
  attendanceMinutes: number;
};

export const TOWN_EVALUATION_LABELS: Record<TownEvaluationCode, string> = {
  EXCELLENT: "好調",
  GOOD: "良好",
  WATCH: "要確認",
  INSUFFICIENT_DATA: "データ不足",
};

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

export function calculateTownReferenceMetrics(input: TownReferenceInput): TownReferenceMetrics {
  return {
    ...input,
    telRate: ratio(input.telTapUu, input.uu),
    calculatedContractPerUu: ratio(input.contractCount, input.uu),
    salesPerUu: ratio(input.salesAmount, input.uu),
    salesPerTel: ratio(input.salesAmount, input.telTapUu),
    regularNominationRate: ratio(input.regularNominationCount, input.contractCount),
  };
}

export function buildTownReferenceScope(
  townRecords: TownReferenceTownRecord[],
  ctiRecords: TownReferenceCtiRecord[],
  from: Date,
  to: Date,
  storeId?: string,
) {
  const town = townRecords.filter((row) => row.date >= from && row.date <= to && (!storeId || row.storeId === storeId));
  const cti = ctiRecords.filter((row) => row.businessDate >= from && row.businessDate <= to && (!storeId || row.storeId === storeId));
  return calculateTownReferenceMetrics({
    pv: town.reduce((sum, row) => sum + row.pv, 0),
    uu: town.reduce((sum, row) => sum + row.uu, 0),
    telTapUu: town.reduce((sum, row) => sum + row.telTapUu, 0),
    salesAmount: cti.reduce((sum, row) => sum + row.salesAmount, 0),
    castRewardAmount: cti.reduce((sum, row) => sum + row.castRewardAmount, 0),
    contractCount: cti.reduce((sum, row) => sum + row.contractCount, 0),
    regularNominationCount: cti.reduce((sum, row) => sum + row.regularNominationCount, 0),
    attendanceMinutes: cti.reduce((sum, row) => sum + row.attendanceMinutes, 0),
    hasTownData: town.length > 0,
    hasCtiData: cti.length > 0,
  });
}

function rankValue(row: TownReferenceRow, key: TownReferenceRankKey, config: TownReferenceConfig) {
  const metrics = row.metrics;
  if (key === "telRate" || key === "salesPerUu") return metrics.uu >= config.minimumTownUu ? metrics[key] : null;
  if (key === "regularNominationRate") return metrics.contractCount >= config.minimumCtiContracts ? metrics.regularNominationRate : null;
  if (["pv", "uu", "telTapUu"].includes(key)) return metrics.hasTownData ? metrics[key] : null;
  return metrics.hasCtiData ? metrics[key] : null;
}

export function rankTownReferenceRows(rows: TownReferenceRow[], key: TownReferenceRankKey, config: TownReferenceConfig): TownReferenceRank[] {
  const sorted = rows.flatMap((row) => {
    const value = rankValue(row, key, config);
    return value === null ? [] : [{ id: row.id, name: row.name, value: Number(value) }];
  }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ja"));
  const ranked: TownReferenceRank[] = [];
  for (const [index, row] of sorted.entries()) {
    ranked.push({ ...row, rank: index === 0 || row.value !== sorted[index - 1].value ? index + 1 : ranked[index - 1].rank });
  }
  return ranked;
}

function quantile(values: number[], position: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index); const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function metricValues(rows: TownReferenceRow[], key: "uu" | "telRate" | "regularNominationRate", config: TownReferenceConfig) {
  return rows.flatMap((row) => {
    if (key === "uu") return row.metrics.hasTownData ? [row.metrics.uu] : [];
    if (key === "telRate") return row.metrics.uu >= config.minimumTownUu && row.metrics.telRate !== null ? [row.metrics.telRate] : [];
    return row.metrics.contractCount >= config.minimumCtiContracts && row.metrics.regularNominationRate !== null ? [row.metrics.regularNominationRate] : [];
  });
}

export function evaluateTownReferencePreview(row: TownReferenceRow, cohort: TownReferenceRow[], config: TownReferenceConfig) {
  const metrics = row.metrics;
  const insufficient: string[] = [];
  if (metrics.uu < config.minimumTownUu) insufficient.push(`UU ${metrics.uu}は最低母数${config.minimumTownUu}未満`);
  if (metrics.contractCount < config.minimumCtiContracts) insufficient.push(`CTI成約数 ${metrics.contractCount}は最低母数${config.minimumCtiContracts}未満`);
  if (metrics.attendanceMinutes < config.minimumAttendanceMinutes) insufficient.push(`出勤時間 ${(metrics.attendanceMinutes / 60).toFixed(1)}時間は最低母数${(config.minimumAttendanceMinutes / 60).toFixed(1)}時間未満`);
  if (insufficient.length > 0) return { code: "INSUFFICIENT_DATA" as const, reasons: insufficient, suggestions: ["データ不足：最低母数を満たした期間で再確認してください。"] };

  const medianUu = quantile(metricValues(cohort, "uu", config), 0.5) ?? metrics.uu;
  const medianTelRate = quantile(metricValues(cohort, "telRate", config), 0.5) ?? metrics.telRate!;
  const upperTelRate = quantile(metricValues(cohort, "telRate", config), config.excellentTelRateQuantile) ?? metrics.telRate!;
  const medianRegularRate = quantile(metricValues(cohort, "regularNominationRate", config), 0.5) ?? metrics.regularNominationRate!;
  const favorable = [metrics.uu >= medianUu, metrics.telRate! >= medianTelRate, metrics.regularNominationRate! >= medianRegularRate];
  const code: TownEvaluationCode = favorable.every(Boolean) && metrics.telRate! >= upperTelRate ? "EXCELLENT" : favorable.filter(Boolean).length >= 2 ? "GOOD" : "WATCH";
  const reasons = [
    `UUは比較対象中央値${medianUu.toFixed(1)}${metrics.uu >= medianUu ? "以上" : "未満"}`,
    metrics.telRate! >= upperTelRate ? `TEL率は比較対象上位${Math.round((1 - config.excellentTelRateQuantile) * 100)}%水準以上` : `TEL率は比較対象中央値${(medianTelRate * 100).toFixed(2)}%${metrics.telRate! >= medianTelRate ? "以上" : "未満"}`,
    `本指名率は比較対象中央値${(medianRegularRate * 100).toFixed(2)}%${metrics.regularNominationRate! >= medianRegularRate ? "以上" : "未満"}`,
  ];
  const suggestions: string[] = [];
  if (metrics.uu < medianUu && metrics.telRate! >= medianTelRate) suggestions.push(`UUは中央値を下回っていますが、TEL率は中央値以上です。露出強化の余地がある可能性があります。`);
  if (metrics.telRate! < medianTelRate) suggestions.push(`TEL率${(metrics.telRate! * 100).toFixed(2)}%は中央値${(medianTelRate * 100).toFixed(2)}%未満です。閲覧からTELへの転換を確認する候補です。`);
  if (metrics.regularNominationRate! < medianRegularRate) suggestions.push(`本指名率${(metrics.regularNominationRate! * 100).toFixed(2)}%は中央値${(medianRegularRate * 100).toFixed(2)}%未満です。本指名化に改善余地がある可能性があります。`);
  if (suggestions.length === 0) suggestions.push("主要参考指標は比較対象中央値以上です。現時点で顕著な改善候補はありません。");
  return { code, reasons, suggestions };
}
