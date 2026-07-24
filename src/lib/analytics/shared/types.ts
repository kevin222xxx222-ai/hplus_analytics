export type AnalyticsFilterState = { period?: string; from: string; to: string; store: string; castId?: string; dimension?: string; category?: string; comparison?: string; metric?: string; metricGroup?: string; growth?: string; confidence?: string; castSearch?: string; sort?: string; order?: string };
export type AnalyticsQueryState<T> = { data: T | null; loading: boolean; error: string | null; status: string; retry: () => void };
export type AnalyticsSortColumn = { key: string; label: string; direction?: "asc" | "desc" };
