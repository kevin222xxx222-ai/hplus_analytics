"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AliasReviewStatus, CastStatus, ImportDataType, ImportSourceKind, MediaType, StoreCode, UserRole } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { normalizeCastName } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/date";
import { renameCast } from "@/lib/casts/name-service";
import { executeCastMerge } from "@/lib/casts/merge-service";
import { buildCastStartDateBulkPreview, executeCastStartDateBulkChange } from "@/lib/casts/start-date-bulk-service";

const optionalUuid = z.string().uuid().optional().or(z.literal(""));
const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalDate = dateValue.optional().or(z.literal(""));

export async function updateStoreAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(100), shortName: z.string().trim().min(1).max(50) }).parse(Object.fromEntries(formData));
  await prisma.store.update({
    where: { id: parsed.id },
    data: {
      name: parsed.name,
      shortName: parsed.shortName,
      isActive: formData.get("isActive") === "on",
      hasManagementMetrics: formData.get("hasManagementMetrics") === "on",
      hasAcquisitionMetrics: formData.get("hasAcquisitionMetrics") === "on",
    },
  });
  revalidatePath("/masters/stores");
}

export async function createCastAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    displayName: z.string().trim().min(1).max(100),
    startedOn: dateValue,
    primaryStoreId: optionalUuid,
    notes: z.string().trim().max(1000).optional(),
  }).parse(Object.fromEntries(formData));
  await prisma.cast.create({ data: {
    displayName: parsed.displayName,
    normalizedName: normalizeCastName(parsed.displayName),
    startedOn: parseDateOnly(parsed.startedOn),
    primaryStoreId: parsed.primaryStoreId || null,
    notes: parsed.notes || null,
  } });
  revalidatePath("/masters/casts");
}

export async function updateCastPrimaryStoreAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), primaryStoreId: optionalUuid }).parse(Object.fromEntries(formData));
  const cast = await prisma.cast.findFirst({ where: { id: parsed.id, mergedIntoCastId: null }, select: { id: true } });
  if (!cast) throw new Error("統合済みキャストは変更できません。");
  if (parsed.primaryStoreId) {
    const store = await prisma.store.findFirst({ where: { id: parsed.primaryStoreId, isActive: true }, select: { id: true } });
    if (!store) throw new Error("有効な主所属店舗を選択してください。");
  }
  await prisma.cast.update({ where: { id: parsed.id }, data: { primaryStoreId: parsed.primaryStoreId || null } });
  revalidatePath("/masters/casts");
  return { primaryStoreId: parsed.primaryStoreId || null };
}

export async function updateCastDisplayNameAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z.object({
    id: z.string().uuid(),
    displayName: z.string().trim().min(1).max(100),
    reason: z.string().trim().max(1000).optional(),
    confirmDuplicate: z.enum(["true", "false"]).default("false"),
  }).parse(Object.fromEntries(formData));
  const result = await renameCast({
    castId: parsed.id,
    displayName: parsed.displayName,
    reason: parsed.reason || null,
    changedByUserId: admin.id,
    confirmDuplicate: parsed.confirmDuplicate === "true",
  });
  if (result.status === "UPDATED") {
    revalidatePath("/masters/casts");
    revalidatePath("/analytics/casts");
    revalidatePath(`/analytics/casts/${parsed.id}`);
    revalidatePath("/analytics/town/casts");
  }
  return result;
}

export async function setCastStatusAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), status: z.nativeEnum(CastStatus), endedOn: optionalDate }).parse(Object.fromEntries(formData));
  const cast = await prisma.cast.findFirst({ where: { id: parsed.id, mergedIntoCastId: null }, select: { id: true } });
  if (!cast) throw new Error("統合済みキャストの在籍状態は変更できません。");
  await prisma.cast.update({ where: { id: parsed.id }, data: {
    status: parsed.status,
    endedOn: parsed.status === CastStatus.INACTIVE && parsed.endedOn ? parseDateOnly(parsed.endedOn) : null,
  } });
  revalidatePath("/masters/casts");
}

export async function createAliasAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    mediaType: z.nativeEnum(MediaType), aliasName: z.string().trim().min(1).max(100),
    storeId: optionalUuid, castId: optionalUuid,
  }).parse(Object.fromEntries(formData));
  if (parsed.castId) {
    const cast = await prisma.cast.findFirst({ where: { id: parsed.castId, mergedIntoCastId: null }, select: { id: true } });
    if (!cast) throw new Error("統合済みキャストはAliasの紐付け先にできません。");
  }
  await prisma.castAlias.create({ data: {
    mediaType: parsed.mediaType,
    aliasName: parsed.aliasName,
    normalizedAlias: normalizeCastName(parsed.aliasName),
    storeId: parsed.storeId || null,
    castId: parsed.castId || null,
    reviewStatus: parsed.castId ? AliasReviewStatus.MAPPED : AliasReviewStatus.PENDING,
  } });
  revalidatePath("/masters/aliases");
}

export async function mapAliasAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), castId: optionalUuid, reviewStatus: z.nativeEnum(AliasReviewStatus) }).parse(Object.fromEntries(formData));
  if (parsed.castId) {
    const cast = await prisma.cast.findFirst({ where: { id: parsed.castId, mergedIntoCastId: null }, select: { id: true } });
    if (!cast) throw new Error("統合済みキャストはAliasの紐付け先にできません。");
  }
  await prisma.castAlias.update({ where: { id: parsed.id }, data: {
    castId: parsed.reviewStatus === AliasReviewStatus.MAPPED ? parsed.castId || null : null,
    reviewStatus: parsed.reviewStatus === AliasReviewStatus.MAPPED && !parsed.castId ? AliasReviewStatus.PENDING : parsed.reviewStatus,
  } });
  revalidatePath("/masters/aliases");
}

export async function executeCastMergeAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z.object({
    sourceCastId: z.string().uuid(), targetCastId: z.string().uuid(), expectedFingerprint: z.string().length(64),
    displayName: z.string().trim().min(1).max(100), primaryStoreId: optionalUuid,
    startedOn: dateValue, endedOn: optionalDate, notes: z.string().trim().max(1000).optional(),
    reason: z.string().trim().max(1000).optional(), confirmation: z.literal("MERGE"),
  }).parse(Object.fromEntries(formData));
  const result = await executeCastMerge({
    sourceCastId: parsed.sourceCastId,
    targetCastId: parsed.targetCastId,
    expectedFingerprint: parsed.expectedFingerprint,
    finalValues: {
      displayName: parsed.displayName,
      primaryStoreId: parsed.primaryStoreId || null,
      startedOn: parseDateOnly(parsed.startedOn),
      endedOn: parsed.endedOn ? parseDateOnly(parsed.endedOn) : null,
      notes: parsed.notes || null,
    },
    mergedByUserId: admin.id,
    reason: parsed.reason || null,
  });
  revalidatePath("/masters/casts");
  revalidatePath("/masters/casts/duplicates");
  revalidatePath("/masters/casts/merges");
  revalidatePath("/masters/aliases");
  revalidatePath("/analytics/casts");
  revalidatePath("/analytics/town/casts");
  return result;
}

const castStartDateBulkSchema = z.object({
  castIds: z.array(z.string().uuid()).min(1),
  targetDate: dateValue,
  mediaScope: z.nativeEnum(MediaType).or(z.literal("ALL")),
});

const castStartDateBulkPreviewSchema = castStartDateBulkSchema.extend({
  expectedSelectionCount: z.number().int().positive().max(1000),
}).superRefine((value, context) => {
  const receivedSelectionCount = new Set(value.castIds).size;
  if (receivedSelectionCount !== value.expectedSelectionCount || receivedSelectionCount !== value.castIds.length) {
    context.addIssue({
      code: "custom",
      path: ["castIds"],
      message: `選択件数とサーバー受領件数が一致しません（申告${value.expectedSelectionCount}件／受領${receivedSelectionCount}件）。`,
    });
  }
});

export async function previewCastStartDateBulkChangeAction(input: unknown) {
  await requireAdmin();
  const parsed = castStartDateBulkPreviewSchema.parse(input);
  const preview = await buildCastStartDateBulkPreview({ castIds: parsed.castIds, targetDate: parsed.targetDate, mediaScope: parsed.mediaScope });
  return { ...preview, receivedSelectionCount: parsed.castIds.length };
}

export async function executeCastStartDateBulkChangeAction(input: unknown) {
  const admin = await requireAdmin();
  const parsed = castStartDateBulkSchema.extend({
    expectedFingerprint: z.string().length(64),
    reason: z.string().trim().min(1).max(1000),
  }).parse(input);
  const result = await executeCastStartDateBulkChange({ ...parsed, changedByUserId: admin.id });
  revalidatePath("/masters/casts");
  revalidatePath("/masters/casts/start-date-maintenance");
  revalidatePath("/masters/aliases");
  return result;
}

export async function createImportSourceAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    name: z.string().trim().min(1).max(120), kind: z.nativeEnum(ImportSourceKind), mediaType: z.nativeEnum(MediaType),
    dataType: z.nativeEnum(ImportDataType), storeId: optionalUuid, metricType: z.string().trim().max(100).optional(), folderPath: z.string().trim().max(500).optional(),
  }).parse(Object.fromEntries(formData));
  if (parsed.storeId) {
    const store = await prisma.store.findFirst({ where: { id: parsed.storeId, isActive: true, code: { not: StoreCode.KUKI } }, select: { id: true } });
    if (!store) throw new Error("久喜は媒体取込対象店舗に設定できません。");
  }
  await prisma.importSource.create({ data: {
    name: parsed.name, kind: parsed.kind, mediaType: parsed.mediaType, dataType: parsed.dataType,
    storeId: parsed.storeId || null, metricType: parsed.metricType || null, folderPath: parsed.folderPath || null,
  } });
  revalidatePath("/masters/import-sources");
}

export async function toggleImportSourceAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), isActive: z.enum(["true", "false"]) }).parse(Object.fromEntries(formData));
  await prisma.importSource.update({ where: { id: parsed.id }, data: { isActive: parsed.isActive !== "true" } });
  revalidatePath("/masters/import-sources");
}

export async function createUserAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    loginId: z.string().trim().min(3).max(100), email: z.string().trim().email().optional().or(z.literal("")),
    displayName: z.string().trim().min(1).max(100), role: z.nativeEnum(UserRole), password: z.string().min(12).max(128),
  }).parse(Object.fromEntries(formData));
  await prisma.user.create({ data: {
    loginId: parsed.loginId, email: parsed.email?.toLowerCase() || null, displayName: parsed.displayName,
    role: parsed.role, passwordHash: await hash(parsed.password, 12),
  } });
  revalidatePath("/masters/users");
}

export async function toggleUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), isActive: z.enum(["true", "false"]) }).parse(Object.fromEntries(formData));
  if (parsed.id === admin.id) return;
  await prisma.user.update({ where: { id: parsed.id }, data: { isActive: parsed.isActive !== "true" } });
  revalidatePath("/masters/users");
}
