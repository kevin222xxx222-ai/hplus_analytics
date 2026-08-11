import type { Availability } from "@/lib/analytics/engine/types";
import type { CastMetric } from "@/lib/analytics/cast-diagnosis/types";

export type HeavenMediaFunnelRow = {
  castId: string;
  businessDate: Date | string;
  metricKey: string;
  rawValue: number | null;
  deltaValue: number | null;
  valueKind: "SNAPSHOT" | "DAILY_EVENT";
  rawValueStatus: string;
};

export type HeavenMediaFunnelAggregate = {
  heavenMyGirlAdds: CastMetric;
  heavenFavoriteTalks: CastMetric;
  validDayCount: number;
  missingDayCount: number;
  negativeDeltaCount: number;
  baselineMissing: boolean;
  hasHeavenRows: boolean;
};

const dateKey = (value: Date | string) => value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
const daysBetween = (from: string, to: string) => {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((end - start) / 86_400_000) + 1);
};
const metric = (value: number | null, availability: Availability, isPartial = false, reason?: string): CastMetric => ({ value, availability, source: "HEAVEN", ...(isPartial ? { isPartial: true } : {}), ...(reason ? { reason } : {}) });

/**
 * Aggregates Heaven's daily-event and snapshot metrics without treating a
 * missing value as zero. Snapshot resets are handled as a new segment: the
 * negative transition is excluded and subsequent positive deltas remain
 * usable, while the metric is marked partial for auditability.
 */
export function aggregateHeavenMediaFunnel(input: {
  rows: HeavenMediaFunnelRow[];
  previousSnapshots?: HeavenMediaFunnelRow[];
  from: string;
  to: string;
}): Map<string, HeavenMediaFunnelAggregate> {
  const expectedDays = daysBetween(input.from, input.to);
  const previous = new Map<string, number>();
  for (const row of input.previousSnapshots ?? []) {
    if (row.metricKey !== "my_girl" || row.rawValueStatus !== "VALUE" || row.rawValue === null) continue;
    if (!previous.has(row.castId)) previous.set(row.castId, row.rawValue);
  }
  const grouped = new Map<string, HeavenMediaFunnelRow[]>();
  for (const row of input.rows) {
    if (!grouped.has(row.castId)) grouped.set(row.castId, []);
    grouped.get(row.castId)!.push(row);
  }
  const output = new Map<string, HeavenMediaFunnelAggregate>();
  for (const [castId, rows] of grouped) {
    const eventRows = rows.filter((row) => row.metricKey === "okini_talk_sent");
    const snapshotRows = rows.filter((row) => row.metricKey === "my_girl").sort((a, b) => dateKey(a.businessDate).localeCompare(dateKey(b.businessDate)));
    const validEventDates = new Set(eventRows.filter((row) => row.rawValueStatus === "VALUE" && row.rawValue !== null).map((row) => dateKey(row.businessDate)));
    const validSnapshotDates = new Set(snapshotRows.filter((row) => row.rawValueStatus === "VALUE" && row.rawValue !== null).map((row) => dateKey(row.businessDate)));
    const eventValues = eventRows.filter((row) => row.rawValueStatus === "VALUE" && row.rawValue !== null).map((row) => row.rawValue!);
    const eventPartial = validEventDates.size < expectedDays;
    const talks = eventValues.length ? metric(eventValues.reduce((a, b) => a + b, 0), eventValues.reduce((a, b) => a + b, 0) === 0 ? "ZERO" : "VALUE", eventPartial, eventPartial ? "Heavenの対象日が一部未取得です。" : undefined) : metric(null, eventRows.length ? "MISSING" : "UNAVAILABLE", false);
    let previousValue = previous.get(castId);
    const baselineMissing = previousValue === undefined;
    let negativeDeltaCount = 0;
    let adds = 0;
    for (const row of snapshotRows) {
      if (row.rawValueStatus !== "VALUE" || row.rawValue === null) continue;
      const explicitDelta = row.deltaValue;
      const delta = explicitDelta ?? (previousValue === undefined ? null : row.rawValue - previousValue);
      if (delta === null) { previousValue = row.rawValue; continue; }
      if (delta < 0) { negativeDeltaCount++; previousValue = row.rawValue; continue; }
      adds += delta;
      previousValue = row.rawValue;
    }
    const snapshotPartial = validSnapshotDates.size < expectedDays || baselineMissing || negativeDeltaCount > 0;
    const myGirl = snapshotRows.length === 0
      ? metric(null, "UNAVAILABLE")
      : validSnapshotDates.size === 0
        ? metric(null, "MISSING")
        : metric(adds, adds === 0 && !snapshotPartial ? "ZERO" : "VALUE", snapshotPartial, baselineMissing ? "初回Snapshotの比較基準が不足しています。" : negativeDeltaCount > 0 ? "Snapshotリセットを検出しました。" : validSnapshotDates.size < expectedDays ? "Heavenの対象日が一部未取得です。" : undefined);
    output.set(castId, { heavenMyGirlAdds: myGirl, heavenFavoriteTalks: talks, validDayCount: Math.max(validEventDates.size, validSnapshotDates.size), missingDayCount: Math.max(0, expectedDays - Math.max(validEventDates.size, validSnapshotDates.size)), negativeDeltaCount, baselineMissing, hasHeavenRows: rows.length > 0 });
  }
  return output;
}

export function deriveFunnelRate(numerator: CastMetric, denominator: CastMetric, multiplier: number, source: "HEAVEN" | "HEAVEN_TOWN" = "HEAVEN"): CastMetric {
  if (numerator.value === null) return { ...metric(null, numerator.availability === "UNAVAILABLE" ? "UNAVAILABLE" : "UNCOMPUTABLE"), source };
  if (denominator.value === null) return { ...metric(null, denominator.availability === "UNAVAILABLE" ? "UNAVAILABLE" : "UNCOMPUTABLE"), source };
  if (denominator.value <= 0) return { ...metric(null, "UNCOMPUTABLE"), source };
  return { ...metric(numerator.value / denominator.value * multiplier, numerator.availability === "ZERO" ? "ZERO" : "VALUE", Boolean(numerator.isPartial || denominator.isPartial)), source };
}
