import type { AnalyticsFilterState } from "./types";

const filterKeys: (keyof AnalyticsFilterState)[] = ["period", "from", "to", "store", "castId", "dimension", "category", "comparison", "metric", "metricGroup", "growth", "confidence", "castSearch", "sort", "order"];

export function readAnalyticsFilters(params: URLSearchParams, defaults: AnalyticsFilterState): AnalyticsFilterState {
  const next = { ...defaults };
  for (const key of filterKeys) {
    const value = params.get(key);
    if (value) next[key] = value;
  }
  return next;
}

export function writeAnalyticsFilters(filters: AnalyticsFilterState): string {
  const query = new URLSearchParams();
  for (const key of filterKeys) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  return query.toString();
}
