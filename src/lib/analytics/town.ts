export type TownMetricRecord = {
  pv: number;
  uu: number;
  telTapUu: number;
  bounceRate?: unknown;
};

export function townRatio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

export function aggregateTown(records: TownMetricRecord[]) {
  const pv = records.reduce((sum, row) => sum + row.pv, 0);
  const uu = records.reduce((sum, row) => sum + row.uu, 0);
  const telTapUu = records.reduce((sum, row) => sum + row.telTapUu, 0);
  const bounceRows = records.filter((row) => row.bounceRate !== null && row.bounceRate !== undefined && Number.isFinite(Number(row.bounceRate)));
  const bounceWeight = bounceRows.reduce((sum, row) => sum + row.uu, 0);
  const bounceRate = bounceWeight === 0 ? null : bounceRows.reduce((sum, row) => sum + Number(row.bounceRate) * row.uu, 0) / bounceWeight;
  return { pv, uu, telTapUu, averagePv: townRatio(pv, uu), conversionRate: townRatio(telTapUu, uu), bounceRate };
}

export function changeRate(current: number, previous: number) {
  return previous === 0 ? null : (current - previous) / previous;
}

