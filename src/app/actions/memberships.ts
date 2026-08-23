"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CastMembershipSourceConfidence, CastMembershipStatus } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import { closeMembership, createMembership, createReentryMembership, exitCast, ExitDateConflictError, initializeCurrentMemberships, listMemberships, resumeFromLeave, setOnLeave, updateMembership, reenterCast, ReentryValidationError } from "@/lib/casts/membership-service";
import { loadCurrentMembershipCandidates, summarizeCurrentMembershipCandidates } from "@/lib/casts/current-membership-evidence";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = z.string().trim().max(1000).optional().or(z.literal(""));

function formValues(formData: FormData) {
  return Object.fromEntries(formData);
}

function common(data: Record<string, unknown>) {
  return {
    castId: uuid.parse(data.castId),
    storeId: uuid.parse(data.storeId),
    joinedAt: data.joinedAt ? parseDateOnly(date.parse(data.joinedAt)) : null,
    leftAt: data.leftAt ? parseDateOnly(date.parse(data.leftAt)) : null,
    status: z.nativeEnum(CastMembershipStatus).parse(data.status),
    source: optionalText.parse(data.source) || null,
    sourceConfidence: data.sourceConfidence ? z.nativeEnum(CastMembershipSourceConfidence).parse(data.sourceConfidence) : null,
    note: optionalText.parse(data.note) || null,
  };
}

export async function createMembershipAction(formData: FormData) {
  const admin = await requireAdmin();
  const data = common(formValues(formData));
  await createMembership({ ...data, createdByUserId: admin.id, updatedByUserId: admin.id });
  revalidatePath("/masters/casts/memberships");
}

export async function addCurrentMembershipAction(formData: FormData) {
  const admin = await requireAdmin();
  const castId = uuid.parse(formData.get("castId"));
  const storeId = uuid.parse(formData.get("storeId"));
  const existing = (await listMemberships(castId)).filter((membership) => membership.storeId === storeId);
  if (existing.some((membership) => membership.status === CastMembershipStatus.ACTIVE || membership.status === CastMembershipStatus.ON_LEAVE)) throw new Error("既に在籍中または休業中です。");
  if (existing.some((membership) => membership.status === CastMembershipStatus.LEFT)) await createReentryMembership({ castId, storeId, joinedAt: null, leftAt: null, source: "MANUAL_REVIEW", sourceConfidence: CastMembershipSourceConfidence.CONFIRMED, createdByUserId: admin.id, updatedByUserId: admin.id });
  else await createMembership({ castId, storeId, joinedAt: null, leftAt: null, status: CastMembershipStatus.ACTIVE, source: "MANUAL_REVIEW", sourceConfidence: CastMembershipSourceConfidence.CONFIRMED, createdByUserId: admin.id, updatedByUserId: admin.id });
  revalidatePath("/masters/casts");
}

export async function quickRegisterMembershipsAction(formData: FormData) {
  const admin = await requireAdmin();
  const castId = uuid.parse(formData.get("castId"));
  const storeIds = [...new Set(formData.getAll("storeId").map((value) => uuid.parse(value)))];
  if (storeIds.length === 0) throw new Error("登録する店舗を選択してください。");
  const existing = await listMemberships(castId);
  if (storeIds.some((storeId) => existing.some((membership) => membership.storeId === storeId))) {
    throw new Error("既存Membershipがある店舗はQuick登録の対象外です。詳細フォームから確認してください。");
  }
  for (const storeId of storeIds) {
    await createMembership({ castId, storeId, status: CastMembershipStatus.ACTIVE, joinedAt: null, leftAt: null, source: "MANUAL_REVIEW", sourceConfidence: CastMembershipSourceConfidence.UNKNOWN, createdByUserId: admin.id, updatedByUserId: admin.id });
  }
  revalidatePath("/masters/casts/memberships");
}

export async function updateMembershipAction(formData: FormData) {
  const admin = await requireAdmin();
  const data = common(formValues(formData));
  await updateMembership(uuid.parse(formData.get("id")), { ...data, updatedByUserId: admin.id });
  revalidatePath("/masters/casts/memberships");
}

export async function closeMembershipAction(formData: FormData) {
  const admin = await requireAdmin();
  await closeMembership(uuid.parse(formData.get("id")), parseDateOnly(date.parse(String(formData.get("leftAt")))), admin.id);
  revalidatePath("/masters/casts/memberships");
  revalidatePath("/masters/casts");
}

export async function exitCastAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z.object({ castId: uuid, leftAt: date, confirmation: z.literal("EXIT_CAST"), repairLegacy: z.enum(["true", "false"]).optional() }).parse(Object.fromEntries(formData));
  try {
    await exitCast(parsed.castId, parseDateOnly(parsed.leftAt), admin.id, { allowLegacyConflictRepair: parsed.repairLegacy === "true" });
  } catch (error) {
    if (error instanceof ExitDateConflictError) return { status: "CONFLICT", message: error.message, aliasCount: error.aliasDates.length, listingCount: error.listingDates.length };
    throw error;
  }
  revalidatePath("/masters/casts");
  revalidatePath("/masters/casts/memberships");
  return { status: "COMPLETED" };
}

export async function createReentryMembershipAction(formData: FormData) {
  const admin = await requireAdmin();
  const data = common(formValues(formData));
  await createReentryMembership({ ...data, createdByUserId: admin.id, updatedByUserId: admin.id });
  revalidatePath("/masters/casts/memberships");
}

export type ReentryActionState = { status?: "ERROR" | "COMPLETED"; message?: string };

export async function reenterCastAction(_previous: ReentryActionState, formData: FormData): Promise<ReentryActionState> {
  const admin = await requireAdmin();
  try {
    const castId = uuid.parse(formData.get("castId"));
    const reentryDate = parseDateOnly(date.parse(String(formData.get("reentryDate"))));
    const storeIds = [...new Set(formData.getAll("storeId").map((value) => uuid.parse(value)))];
    const confirmedSamePerson = formData.get("confirmedSamePerson") === "on";
    const aliasesValue = String(formData.get("aliases") || "[]");
    const aliases = z.array(z.object({ storeId: uuid, mediaType: z.enum(["CTI", "TOWN", "HEAVEN"]), aliasName: z.string().trim().min(1).max(100), normalizedAlias: z.string().trim().min(1).max(100) })).parse(JSON.parse(aliasesValue));
    await reenterCast({ castId, reentryDate, storeIds, aliases, confirmedSamePerson, updatedByUserId: admin.id });
    revalidatePath("/masters/casts");
    revalidatePath("/masters/casts/memberships");
    return { status: "COMPLETED", message: "再入店を登録しました。" };
  } catch (error) {
    if (error instanceof ReentryValidationError || error instanceof z.ZodError) return { status: "ERROR", message: error.message };
    throw error;
  }
}

export async function setOnLeaveAction(formData: FormData) {
  const admin = await requireAdmin();
  await setOnLeave(uuid.parse(formData.get("id")), admin.id);
  revalidatePath("/masters/casts/memberships");
}

export async function resumeMembershipAction(formData: FormData) {
  const admin = await requireAdmin();
  await resumeFromLeave(uuid.parse(formData.get("id")), admin.id);
  revalidatePath("/masters/casts/memberships");
}

export async function initializeCurrentMembershipsAction(formData: FormData) {
  const admin = await requireAdmin();
  z.literal("CONFIRM").parse(formData.get("confirm"));
  const candidates = await loadCurrentMembershipCandidates();
  const summary = summarizeCurrentMembershipCandidates(candidates);
  const equationValid = summary.createActiveTotal === summary.townOnly + summary.ctiOnly + summary.both
    && summary.createActiveTotal === Object.values(summary.storeCounts).reduce((total, count) => total + count, 0)
    && summary.duplicateCastStoreCount === 0
    && summary.invalidBatchStatusCount === 0;
  if (!equationValid) throw new Error("Current Membership監査に失敗したため、初期化を中止しました。DB変更はありません。");
  const selected = candidates.filter((candidate) => candidate.decision === "CREATE_ACTIVE");
  if (selected.length === 0) throw new Error("CREATE_ACTIVE候補がありません。DB変更はありません。");
  await initializeCurrentMemberships(selected.map((candidate) => ({ castId: candidate.castId, storeId: candidate.storeId, status: CastMembershipStatus.ACTIVE, joinedAt: null, leftAt: null, source: "MEDIA_EVIDENCE_BACKFILL", sourceConfidence: CastMembershipSourceConfidence.CONFIRMED, createdByUserId: admin.id, updatedByUserId: admin.id })));
  revalidatePath("/masters/casts/memberships/initialize");
  revalidatePath("/masters/casts");
}
