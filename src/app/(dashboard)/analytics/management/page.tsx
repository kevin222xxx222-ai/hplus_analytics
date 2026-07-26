import { AnalyticsPageLayout } from "@/components/analytics/shared";
import { ManagementDashboardPage } from "@/components/management-dashboard-page";
import { requireUser } from "@/lib/auth";
import { resolveDateRange } from "@/lib/analytics/cti";
import { getManagementDashboard } from "@/lib/analytics/integration/management-dashboard";
import { formatDateOnly, parseDateOnly } from "@/lib/date";

const stores = new Set(["ALL", "KASUKABE", "KOSHIGAYA", "NODA"]);
const comparisons = new Set(["previousDay", "previousWeekday", "previousMonthToDate"]);

export default async function ManagementDashboardRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const resolved = resolveDateRange(first(params.from), first(params.to));
  const today = parseDateOnly(new Date().toISOString().slice(0, 10));
  let fromDate = resolved.from > today ? today : resolved.from;
  const toDate = resolved.to > today ? today : resolved.to;
  if (toDate < fromDate) fromDate = toDate;
  const maxFrom = new Date(toDate); maxFrom.setUTCDate(maxFrom.getUTCDate() - 91);
  if (fromDate < maxFrom) fromDate = maxFrom;
  const range = { fromText: formatDateOnly(fromDate), toText: formatDateOnly(toDate) };
  const storeParam = first(params.stores) ?? first(params.store) ?? first(params.scope) ?? "ALL";
  const selectedStores = storeParam === "ALL" ? ["ALL"] : storeParam.split(",").filter((value) => stores.has(value));
  const comparisonParam = first(params.comparison) ?? "previousWeekday";
  const comparison = comparisons.has(comparisonParam) ? comparisonParam : "previousWeekday";
  const data = await getManagementDashboard({ from: range.fromText, to: range.toText, storeCodes: selectedStores, comparison });
  return <AnalyticsPageLayout layoutOnly><ManagementDashboardPage data={data} /></AnalyticsPageLayout>;
}
