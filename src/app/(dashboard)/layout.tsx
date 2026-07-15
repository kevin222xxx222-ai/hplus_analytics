import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  return <div className="min-h-screen bg-[#f4f6f8] md:flex"><div className="hidden md:block"><Sidebar user={user} /></div><main className="min-w-0 flex-1 px-5 py-7 sm:px-8 lg:px-10 lg:py-9">{children}</main></div>;
}
