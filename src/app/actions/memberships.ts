"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CastMembershipSourceConfidence, CastMembershipStatus } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import { closeMembership, createMembership, createReentryMembership, resumeFromLeave, setOnLeave, updateMembership } from "@/lib/casts/membership-service";

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
}

export async function createReentryMembershipAction(formData: FormData) {
  const admin = await requireAdmin();
  const data = common(formValues(formData));
  await createReentryMembership({ ...data, createdByUserId: admin.id, updatedByUserId: admin.id });
  revalidatePath("/masters/casts/memberships");
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
