import { redirect } from "next/navigation";

export default async function LegacyCastDetailRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const next = new URLSearchParams();
  if (query.from) next.set("from", query.from);
  if (query.to) next.set("to", query.to);
  redirect(`/analytics/cast/${encodeURIComponent(id)}?${next.toString()}`);
}
