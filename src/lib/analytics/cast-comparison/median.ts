import type { CastMetric } from "@/lib/analytics/cast-diagnosis/types";

export type MedianEvidence = {
  metric: CastMetric<number>;
  method: "ODD_CENTER" | "EVEN_CENTER_AVERAGE" | "UNAVAILABLE";
  centerValues: number[];
  centerPositions: number[];
};

/** ZERO is valid; missing, unavailable and uncomputable values are excluded. */
export function medianWithEvidence(metrics: CastMetric<number>[]): MedianEvidence {
  const values = metrics
    .filter((item) => item.value !== null && !["MISSING", "UNAVAILABLE", "UNCOMPUTABLE", "INSUFFICIENT_SAMPLE"].includes(item.availability))
    .map((item) => item.value as number)
    .sort((a, b) => a - b);
  if (!values.length) return { metric: { value: null, availability: "MISSING" }, method: "UNAVAILABLE", centerValues: [], centerPositions: [] };
  const even = values.length % 2 === 0;
  const positions = even ? [values.length / 2 - 1, values.length / 2] : [Math.floor(values.length / 2)];
  const centerValues = positions.map((position) => values[position]);
  const value = centerValues.reduce((sum, item) => sum + item, 0) / centerValues.length;
  return { metric: { value, availability: value === 0 ? "ZERO" : "VALUE" }, method: even ? "EVEN_CENTER_AVERAGE" : "ODD_CENTER", centerValues, centerPositions: positions.map((position) => position + 1) };
}

