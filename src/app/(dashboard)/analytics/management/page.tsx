import { AnalyticsPageLayout } from "@/components/analytics/shared";
import { ManagementDashboardPage } from "@/components/management-dashboard-page";
import { requireUser } from "@/lib/auth";
import { getManagementDashboard } from "@/lib/analytics/integration/management-dashboard";

export default async function ManagementDashboardRoute() {
  await requireUser();
  const data = await getManagementDashboard();
  return <AnalyticsPageLayout layoutOnly><ManagementDashboardPage data={data} /></AnalyticsPageLayout>;
}
