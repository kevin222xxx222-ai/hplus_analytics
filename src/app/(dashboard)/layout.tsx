import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";
import { AnalyticsPageGuide } from "@/components/analytics-page-guide";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  return <div className="min-h-screen bg-[#f4f6f8]"><Sidebar user={user} /><main className="min-w-0 px-5 py-7 sm:px-8 md:ml-[264px] lg:px-10 lg:py-9"><AnalyticsPageGuide />{children}</main></div>;
}
