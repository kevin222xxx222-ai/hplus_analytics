import { confidenceForSample } from "./constants";
import type { AnalyticsRow, Availability, GroupDimension, MetricValue, SampleSummary, VolumeMetric, VolumeSummary } from "./types";

const METRICS: VolumeMetric[] = ["sales", "castReward", "profit", "reservations", "services", "regularNominations", "free", "new", "repeat", "paidOptions", "diaryPosts", "townPv", "townUu", "heavenAccess", "attendancePeople", "attendanceMinutes"];

function dateKey(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function dimensionValue(row: AnalyticsRow, dimension: GroupDimension) {
  if (dimension === "store") return row.storeId ?? null;
  if (dimension === "cast") return row.castId ?? null;
  if (dimension === "rank") return row.rank ?? null;
  if (dimension === "media") return row.media ?? null;
  if (dimension === "weekday") return String((new Date(`${dateKey(row.date)}T00:00:00Z`).getUTCDay() + 7) % 7);
  return dateKey(row.date);
}

function uniqueRows(rows: AnalyticsRow[]) {
  const seen = new Set<string>();
  return rows.filter((row, index) => {
    const key = row.naturalKey ?? `row:${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sampleFor(rows: AnalyticsRow[], dates: Set<string>): SampleSummary {
  const attendanceRows = rows.filter((row) => (row.metrics.attendancePeople ?? 0) > 0);
  const castIds = new Set(attendanceRows.map((row) => row.castId).filter((id): id is string => Boolean(id)));
  const hours = attendanceRows.reduce((sum, row) => sum + (row.metrics.attendanceMinutes ?? 0), 0) / 60;
  const mediaDates = new Set(rows.filter((row) => row.media === "TOWN" || row.media === "HEAVEN").map((row) => dateKey(row.date)));
  return {
    targetDays: dates.size,
    attendanceCount: attendanceRows.reduce((sum, row) => sum + (row.metrics.attendancePeople ?? 0), 0),
    uniqueCastCount: castIds.size,
    totalAttendanceHours: hours,
    mediaDataDays: mediaDates.size,
    confidence: confidenceForSample(dates.size),
    sampleKind: "attendanceDays",
  };
}

function sumMetric(rows: AnalyticsRow[], metric: VolumeMetric): { value: MetricValue; availability: Availability } {
  const values = rows.map((row) => row.metrics[metric]).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  if (!values.length) return { value: null, availability: "MISSING" };
  const value = values.reduce((sum, item) => sum + item, 0);
  return { value, availability: value === 0 ? "ZERO" : "VALUE" };
}

export function aggregateVolume(rows: AnalyticsRow[], groupBy: GroupDimension[] = []): VolumeSummary[] {
  const groups = new Map<string, AnalyticsRow[]>();
  for (const row of uniqueRows(rows)) {
    const values = groupBy.map((dimension) => dimensionValue(row, dimension));
    const key = values.length ? values.map((value) => value ?? "∅").join("|") : "all";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  if (groups.size === 0) groups.set("all", []);
  return [...groups.entries()].map(([groupKey, group]) => {
    const dates = new Set(group.map((row) => dateKey(row.date)));
    const sums = Object.fromEntries(METRICS.map((metric) => [metric, sumMetric(group, metric)])) as Record<VolumeMetric, { value: MetricValue; availability: Availability }>;
    const metrics = Object.fromEntries(METRICS.map((metric) => [metric, sums[metric].value])) as Record<VolumeMetric, MetricValue>;
    const metricAvailability = Object.fromEntries(METRICS.map((metric) => [metric, sums[metric].availability])) as Record<VolumeMetric, Availability>;
    const sample = sampleFor(group, dates);
    return { status: "OK", groupKey, dimensions: Object.fromEntries(groupBy.map((dimension) => [dimension, group[0] ? dimensionValue(group[0], dimension) : null])), metrics, metricAvailability, sample };
  });
}

export { METRICS as VOLUME_METRICS };
