import type { BaselineKind, BaselineValue, DateRange, MetricValue, SampleSummary } from "./types";

export function availableBaseline(kind: BaselineKind, value: MetricValue, sample?: SampleSummary, reason?: string): BaselineValue {
  if (value === null || value === undefined || !Number.isFinite(value)) return { kind, value: null, status: "Unavailable", sample, reason: reason ?? "比較対象の値が存在しません" };
  return { kind, value, status: "Available", sample };
}

export function unavailableBaseline(kind: BaselineKind, reason: string): BaselineValue { return { kind, value: null, status: "Unavailable", reason }; }

export function averageBaseline(kind: BaselineKind, values: MetricValue[], sample?: SampleSummary): BaselineValue {
  const available = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!available.length) return unavailableBaseline(kind, "比較対象の値が存在しません");
  return availableBaseline(kind, available.reduce((sum, value) => sum + value, 0) / available.length, sample);
}

function shiftUtc(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function iso(date: Date) { return date.toISOString().slice(0, 10); }

/** Returns a comparison window without filling missing dates or values. */
export function comparisonRange(range: DateRange, kind: Exclude<BaselineKind, "personalAverage" | "storeAverage" | "rankAverage">): DateRange {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  if (kind === "previousDay") { const date = shiftUtc(from, -1); return { from: iso(date), to: iso(date) }; }
  if (kind === "previousWeek" || kind === "previousWeekday") { const previousTo = shiftUtc(to, -7); return { from: iso(shiftUtc(previousTo, -(days - 1))), to: iso(previousTo) }; }
  if (kind === "previousMonthToDate") {
    const previousYear = to.getUTCMonth() === 0 ? to.getUTCFullYear() - 1 : to.getUTCFullYear();
    const previousMonth = (to.getUTCMonth() + 11) % 12;
    const lastDay = new Date(Date.UTC(previousYear, previousMonth + 1, 0)).getUTCDate();
    const previousTo = new Date(Date.UTC(previousYear, previousMonth, Math.min(to.getUTCDate(), lastDay)));
    return { from: iso(new Date(Date.UTC(previousTo.getUTCFullYear(), previousTo.getUTCMonth(), 1))), to: iso(previousTo) };
  }
  const previousTo = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 0));
  const previousFrom = new Date(Date.UTC(previousTo.getUTCFullYear(), previousTo.getUTCMonth(), 1));
  return { from: iso(previousFrom), to: iso(previousTo) };
}
