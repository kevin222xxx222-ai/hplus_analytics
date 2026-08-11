import { prisma } from "@/lib/prisma";
import { buildCastActionPlan } from "@/lib/analytics/cast-action";
import { getCastDiagnosis } from "@/lib/analytics/cast-diagnosis/service";
import { buildCastTrend } from "./engine";
import { monthBounds, monthStatus, normalizeMonthRange } from "./monthly-aggregation";
import type { CastTrendResult, TrendMonthlyInput } from "./types";

const iso = (date: Date | null) => date ? date.toISOString().slice(0, 10) : null;
const effectiveToday = () => new Date().toISOString().slice(0, 10);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
export class CastTrendInputError extends Error {}

export async function getCastTrend(input: { castId: string; from: string; to: string; includeDiagnosis?: boolean; includeAction?: boolean }): Promise<CastTrendResult | null> {
  if (!validDate(input.from) || !validDate(input.to) || input.from > input.to) throw new CastTrendInputError("期間を正しく指定してください。");
  const normalized = normalizeMonthRange(input.from, input.to);
  if (normalized.months.length > 24) throw new CastTrendInputError("指定できる期間は24か月以内です。");
  const cast = await prisma.cast.findUnique({ where: { id: input.castId }, select: { id: true, displayName: true, startedOn: true, endedOn: true, primaryStore: { select: { shortName: true } }, aliases: { where: { castId: input.castId }, select: { aliasName: true } }, mergedSources: { select: { id: true } } } });
  if (!cast) return null;
  const today = effectiveToday();
  const monthlyInputs: TrendMonthlyInput[] = [];
  let currentActionType: string | null = null;
  for (const month of normalized.months) {
    const bounds = monthBounds(month);
    const result = await getCastDiagnosis({ from: bounds.from, to: bounds.to });
    const found = result.casts.find((item) => item.fact.castId === cast.id) ?? null;
    const status = monthStatus(month, normalized.to, new Date());
    const periodTo = status === "PARTIAL" ? (normalized.to < today ? normalized.to : today) : bounds.to;
    let actionSnapshot = null;
    if (found && input.includeAction) {
      const plan = buildCastActionPlan({ cast: found, period: { from: bounds.from, to: periodTo } });
      actionSnapshot = { actionType: plan.actionType, actionLabel: plan.actionLabel, priority: plan.priority, recalculatedWithCurrentRules: true as const, isPartialPeriod: status === "PARTIAL" };
      if (month === normalized.months.at(-1)) currentActionType = plan.actionType;
    }
    monthlyInputs.push({ month, periodFrom: bounds.from, periodTo, status, cast: found, diagnosisIncluded: input.includeDiagnosis, actionIncluded: input.includeAction, actionSnapshot, activeFrom: iso(cast.startedOn), activeTo: iso(cast.endedOn), calendarDaysInMonth: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate() });
  }
  const firstLabels = monthlyInputs.find((item) => item.cast)?.cast?.fact.storeLabels ?? (cast.primaryStore ? [cast.primaryStore.shortName] : []);
  return buildCastTrend({ castId: cast.id, displayName: cast.displayName, storeLabels: firstLabels, period: { from: normalized.from, to: normalized.to < today ? normalized.to : today }, months: monthlyInputs, actionType: currentActionType });
}
