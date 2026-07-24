"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { readAnalyticsFilters, writeAnalyticsFilters, type AnalyticsFilterState } from "@/lib/analytics/shared";

export function useAnalyticsFilters(defaults: AnalyticsFilterState) {
  const params = useSearchParams(); const router = useRouter(); const pathname = usePathname();
  const filters = useMemo<AnalyticsFilterState>(() => readAnalyticsFilters(params, defaults), [defaults, params]);
  const updateFilters = useCallback((patch: Partial<AnalyticsFilterState>) => { const next = { ...filters, ...patch }; router.replace(`${pathname}?${writeAnalyticsFilters(next)}`); }, [filters, pathname, router]);
  return { filters, updateFilters };
}
