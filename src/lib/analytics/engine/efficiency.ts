import { THEORETICAL_MAX_HOURLY } from "./constants";
import type { Availability, EfficiencyMetric, EfficiencySummary, MetricValue, VolumeSummary } from "./types";

const divide = (numerator: MetricValue, denominator: MetricValue): MetricValue => numerator === null || denominator === null || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0 ? null : numerator / denominator;
const divisionAvailability = (numerator: MetricValue, denominator: MetricValue, value: MetricValue): Availability => numerator === null || denominator === null ? "MISSING" : denominator === 0 ? "UNCOMPUTABLE" : value === 0 ? "ZERO" : "VALUE";
const valueAvailability = (value: MetricValue): Availability => value === null ? "MISSING" : value === 0 ? "ZERO" : "VALUE";

export type EfficiencyInput = VolumeSummary & {
  rank?: string | null;
  opIncludedRevenue?: MetricValue;
  utilizedMinutes?: MetricValue;
  availableMinutes?: MetricValue;
  theoreticalMaxHourly?: MetricValue;
};

export function theoreticalMaxHourly(rank?: string | null, override?: MetricValue): MetricValue {
  if (override !== undefined) return override;
  if (!rank) return null;
  return THEORETICAL_MAX_HOURLY[rank.toUpperCase()] ?? null;
}

export function calculateEfficiency(input: EfficiencyInput): EfficiencySummary {
  const metrics = input.metrics;
  const hours = metrics.attendanceMinutes === null ? null : metrics.attendanceMinutes / 60;
  const people = metrics.attendancePeople;
  const maxHourly = theoreticalMaxHourly(input.rank, input.theoreticalMaxHourly);
  const currentHourly = divide(metrics.sales, hours);
  const values: Record<EfficiencyMetric, MetricValue> = {
    salesPerHour: currentHourly, salesPerPerson: divide(metrics.sales, people), rewardPerHour: divide(metrics.castReward, hours), rewardPerPerson: divide(metrics.castReward, people), reservationsPerHour: divide(metrics.reservations, hours), reservationsPerPerson: divide(metrics.reservations, people), averageUnitPrice: divide(metrics.sales, metrics.services), regularNominationRate: divide(metrics.regularNominations, metrics.services), utilizationRate: divide(input.utilizedMinutes ?? null, input.availableMinutes ?? null), theoreticalMaxHourly: maxHourly, currentHourly, opIncludedHourly: divide(input.opIncludedRevenue ?? null, hours), theoreticalMaxAchievementRate: divide(currentHourly, maxHourly),
  };
  const metricAvailability = {
    salesPerHour: divisionAvailability(metrics.sales, hours, values.salesPerHour), salesPerPerson: divisionAvailability(metrics.sales, people, values.salesPerPerson), rewardPerHour: divisionAvailability(metrics.castReward, hours, values.rewardPerHour), rewardPerPerson: divisionAvailability(metrics.castReward, people, values.rewardPerPerson), reservationsPerHour: divisionAvailability(metrics.reservations, hours, values.reservationsPerHour), reservationsPerPerson: divisionAvailability(metrics.reservations, people, values.reservationsPerPerson), averageUnitPrice: divisionAvailability(metrics.sales, metrics.services, values.averageUnitPrice), regularNominationRate: divisionAvailability(metrics.regularNominations, metrics.services, values.regularNominationRate), utilizationRate: divisionAvailability(input.utilizedMinutes ?? null, input.availableMinutes ?? null, values.utilizationRate), theoreticalMaxHourly: valueAvailability(values.theoreticalMaxHourly), currentHourly: divisionAvailability(metrics.sales, hours, values.currentHourly), opIncludedHourly: divisionAvailability(input.opIncludedRevenue ?? null, hours, values.opIncludedHourly), theoreticalMaxAchievementRate: divisionAvailability(values.currentHourly, maxHourly, values.theoreticalMaxAchievementRate),
  } as Record<EfficiencyMetric, Availability>;
  return {
    status: "OK",
    ...values,
    metricAvailability,
  };
}

export { divide as safeDivide };
