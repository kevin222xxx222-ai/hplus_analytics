"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GoalScopeType } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";

const optionalNumber = z.string().trim().optional().or(z.literal("")).transform((v) => v ? Number(v) : null).refine((v) => v === null || Number.isFinite(v), "数値を入力してください");
const schema = z.object({
  targetMonth: z.string().regex(/^\d{4}-\d{2}$/), scopeType: z.nativeEnum(GoalScopeType), storeId: z.string().uuid().optional().or(z.literal("")), reason: z.string().trim().max(500).optional(), note: z.string().trim().max(2000).optional(),
  salesTarget: optionalNumber, contractsTarget: optionalNumber, averageActiveCastsTarget: optionalNumber, nominationRateTarget: optionalNumber, castPayoutTarget: optionalNumber, averageUnitPriceTarget: optionalNumber, workingHoursTarget: optionalNumber, townPvTarget: optionalNumber, townUuTarget: optionalNumber, townTelTarget: optionalNumber, heavenPageAccessTarget: optionalNumber,
});

export async function upsertMonthlyGoalAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = schema.parse(Object.fromEntries(formData));
  if (parsed.scopeType === GoalScopeType.STORE && !parsed.storeId) throw new Error("店舗目標は店舗を選択してください。");
  if (parsed.scopeType === GoalScopeType.OVERALL && parsed.storeId) throw new Error("全体目標に店舗は指定できません。");
  const targetMonth = parseDateOnly(`${parsed.targetMonth}-01`);
  const scopeKey = parsed.scopeType === GoalScopeType.OVERALL ? "OVERALL" : `STORE:${parsed.storeId}`;
  const data = { targetMonth, scopeType: parsed.scopeType, scopeKey, storeId: parsed.storeId || null, salesTarget: parsed.salesTarget, contractsTarget: parsed.contractsTarget, averageActiveCastsTarget: parsed.averageActiveCastsTarget, nominationRateTarget: parsed.nominationRateTarget === null ? null : parsed.nominationRateTarget / 100, castPayoutTarget: parsed.castPayoutTarget, averageUnitPriceTarget: parsed.averageUnitPriceTarget, workingHoursTarget: parsed.workingHoursTarget, townPvTarget: parsed.townPvTarget, townUuTarget: parsed.townUuTarget, townTelTarget: parsed.townTelTarget, heavenPageAccessTarget: parsed.heavenPageAccessTarget, note: parsed.note || null };
  await prisma.$transaction(async (tx) => {
    const before = await tx.monthlyGoal.findUnique({ where: { targetMonth_scopeKey: { targetMonth, scopeKey } } });
    const goal = await tx.monthlyGoal.upsert({ where: { targetMonth_scopeKey: { targetMonth, scopeKey } }, create: { ...data, createdByUserId: admin.id, updatedByUserId: admin.id }, update: { ...data, updatedByUserId: admin.id } });
    await tx.monthlyGoalChangeHistory.create({ data: { monthlyGoalId: goal.id, beforeValues: before ? JSON.parse(JSON.stringify(before, (_, v) => typeof v === "bigint" ? Number(v) : v)) : null, afterValues: JSON.parse(JSON.stringify(goal, (_, v) => typeof v === "bigint" ? Number(v) : v)), changedByUserId: admin.id, reason: parsed.reason || null } });
  });
  revalidatePath("/"); revalidatePath("/settings/goals");
}
