"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AliasReviewStatus, CastStatus, ImportDataType, ImportSourceKind, MediaType, UserRole } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { normalizeCastName } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/date";

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

export async function setCastStatusAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), status: z.nativeEnum(CastStatus), endedOn: optionalDate }).parse(Object.fromEntries(formData));
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
  await prisma.castAlias.update({ where: { id: parsed.id }, data: {
    castId: parsed.reviewStatus === AliasReviewStatus.MAPPED ? parsed.castId || null : null,
    reviewStatus: parsed.reviewStatus === AliasReviewStatus.MAPPED && !parsed.castId ? AliasReviewStatus.PENDING : parsed.reviewStatus,
  } });
  revalidatePath("/masters/aliases");
}

export async function createImportSourceAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    name: z.string().trim().min(1).max(120), kind: z.nativeEnum(ImportSourceKind), mediaType: z.nativeEnum(MediaType),
    dataType: z.nativeEnum(ImportDataType), storeId: optionalUuid, metricType: z.string().trim().max(100).optional(), folderPath: z.string().trim().max(500).optional(),
  }).parse(Object.fromEntries(formData));
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
