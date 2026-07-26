import type { Availability, Confidence } from "@/lib/analytics/engine";
import { type HealthScope } from "@/lib/analytics/data-health";
import { formatDateOnly, parseDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { addUtcDays } from "./home-dates";
import { benchmarkStatus, confidenceForSample, summarize, type BenchmarkStatus } from "./goal-benchmarks";

export type MonthlyMediaBenchmark = {
  metricId: "townPv" | "townUu" | "heavenAccess" | "heavenDiaryPosts";
  label: string;
  currentCumulative: number | null;
  latestConfirmedDate: string | null;
  validDataDays: number;
  currentDailyAverage: number | null;
  projectedValue: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  differenceFromMedian: number | null;
  sample: number;
  confidence: Confidence;
  availability: Availability;
  status: BenchmarkStatus;
  scopeNote: string;
};

type Raw = { date?: Date; businessDate?: Date; storeId: string; pv?: number; uu?: number; metricKey?: string; rawValue?: unknown; rawValueStatus?: string };
const labels = { townPv: "Town PV", townUu: "Town UU", heavenAccess: "Heaven女子ページアクセス", heavenDiaryPosts: "Heaven写メ日記投稿数" } as const;

export async function getMonthlyMediaBenchmarks(input: { from: string; to: string; scope: HealthScope; evaluationDate: string | null }): Promise<MonthlyMediaBenchmark[]> {
  const monthStart = parseDateOnly(`${input.from.slice(0, 7)}-01`); const monthEnd = parseDateOnly(input.to); const historyStart = addUtcDays(monthStart, -365); const codes = input.scope === "ALL" ? ["KASUKABE", "KOSHIGAYA", "NODA"] : [input.scope];
  const stores = await prisma.store.findMany({ where: { code: { in: codes as Array<"KASUKABE" | "KOSHIGAYA" | "NODA"> } }, select: { id: true, code: true } }); const ids = stores.map((s) => s.id); const heavenIds = stores.filter((s) => s.code === "KASUKABE").map((s) => s.id);
  const [town, heaven] = await Promise.all([
    prisma.townStoreDaily.findMany({ where: { date: { gte: historyStart, lte: monthEnd }, storeId: { in: ids }, importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, select: { date: true, storeId: true, pv: true, uu: true } }),
    prisma.heavenCastDaily.findMany({ where: { businessDate: { gte: historyStart, lte: monthEnd }, storeId: { in: heavenIds }, castId: { not: null }, metricKey: { in: ["page_access", "diary_posts"] }, rawValueStatus: "VALUE", importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, select: { businessDate: true, storeId: true, metricKey: true, rawValue: true, rawValueStatus: true } }),
  ]);
  const monthMap = new Map<string, Record<string, number>>(); const ensure = (month: string) => { const value = monthMap.get(month) ?? {}; monthMap.set(month, value); return value; };
  for (const row of town as Raw[]) { if (!row.date) continue; const month = formatDateOnly(row.date).slice(0, 7); const value = ensure(month); value.townPv = (value.townPv ?? 0) + (row.pv ?? 0); value.townUu = (value.townUu ?? 0) + (row.uu ?? 0); }
  for (const row of heaven as Raw[]) { if (row.rawValueStatus !== "VALUE" || !row.businessDate) continue; const month = formatDateOnly(row.businessDate).slice(0, 7); const value = ensure(month); const numeric = Number(row.rawValue); if (!Number.isFinite(numeric)) continue; if (row.metricKey === "page_access") value.heavenAccess = (value.heavenAccess ?? 0) + numeric; if (row.metricKey === "diary_posts") value.heavenDiaryPosts = (value.heavenDiaryPosts ?? 0) + numeric; }
  const currentMonth = input.from.slice(0, 7); const currentDays = new Set((town as Raw[]).filter((r) => r.date && formatDateOnly(r.date).slice(0, 7) === currentMonth).map((r) => formatDateOnly(r.date!))).size; const currentHeavenDays = new Set((heaven as Raw[]).filter((r) => r.businessDate && formatDateOnly(r.businessDate).slice(0, 7) === currentMonth).map((r) => formatDateOnly(r.businessDate!))).size; const calendarDays = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  return (Object.keys(labels) as Array<keyof typeof labels>).map((key) => { const current = monthMap.get(currentMonth)?.[key] ?? null; const values = [...monthMap.entries()].filter(([month, value]) => month < currentMonth && value[key] !== undefined).map(([, value]) => value[key]); const summary = summarize(values); const validDays = key.startsWith("heaven") ? currentHeavenDays : currentDays; const projected = current !== null && validDays > 0 ? current / validDays * calendarDays : null; const availability: Availability = current === null ? "MISSING" : current === 0 ? "ZERO" : "VALUE"; const status = benchmarkStatus(projected, summary, 3); return { metricId: key, label: labels[key], currentCumulative: current, latestConfirmedDate: input.evaluationDate, validDataDays: validDays, currentDailyAverage: current !== null && validDays > 0 ? current / validDays : null, projectedValue: projected, median: summary.median, p25: summary.p25, p75: summary.p75, differenceFromMedian: projected !== null && summary.median !== null ? projected - summary.median : null, sample: summary.sample, confidence: confidenceForSample(summary.sample), availability, status, scopeNote: key.startsWith("heaven") ? (input.scope === "ALL" ? "Heavenは春日部のみです。媒体と売上の因果関係は示しません。" : input.scope === "KASUKABE" ? "Heavenの正式取得値です。" : "この店舗はHeaven対象外です。") : "現在までの実績ペースを月末まで単純延長した参考値です。" }; });
}
