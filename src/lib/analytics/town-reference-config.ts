import type { TownReferenceConfig } from "@/lib/analytics/town-reference";

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getTownReferenceConfig(): TownReferenceConfig {
  return {
    minimumTownUu: positiveNumber(process.env.TOWN_REFERENCE_MIN_UU, 20),
    minimumCtiContracts: positiveNumber(process.env.TOWN_REFERENCE_MIN_CONTRACTS, 3),
    minimumAttendanceMinutes: positiveNumber(process.env.TOWN_REFERENCE_MIN_ATTENDANCE_MINUTES, 240),
    excellentTelRateQuantile: Math.min(0.99, Math.max(0.5, positiveNumber(process.env.TOWN_REFERENCE_EXCELLENT_TEL_QUANTILE, 0.75))),
  };
}
