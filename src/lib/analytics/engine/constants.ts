import type { Confidence } from "./types";

export const CONFIDENCE_THRESHOLDS = Object.freeze({ high: 20, medium: 10, low: 5 });

export const THEORETICAL_MAX_HOURLY: Readonly<Record<string, number>> = Object.freeze({
  PLATINUM: 7600,
  REGULAR: 6300,
});

export function confidenceForSample(sample: number): Confidence {
  if (!Number.isFinite(sample) || sample <= CONFIDENCE_THRESHOLDS.low - 1) return "Insufficient";
  if (sample < CONFIDENCE_THRESHOLDS.medium) return "Low";
  if (sample < CONFIDENCE_THRESHOLDS.high) return "Medium";
  return "High";
}
