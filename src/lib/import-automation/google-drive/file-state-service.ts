import {
  DriveFailureCategory,
  DriveFileStatus,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type FileStateDb = Pick<PrismaClient, "driveFileState" | "driveFolderMapping">;

export type DriveFileDetectionInput = {
  driveFileId: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: bigint | number | null;
  driveMd5Checksum?: string | null;
  sha256?: string | null;
  createdTime: Date | string;
  modifiedTime: Date | string;
  mappingId?: string | null;
  isTrashed?: boolean;
  detectedAt?: Date;
};

export type DriveFileUpdateKind = "unchanged" | "changed" | "content_unchanged";

export type DriveFileFailureInput = {
  category: DriveFailureCategory;
  code?: string | null;
  message?: string | null;
  retryable: boolean;
  nextRetryAt?: Date | null;
};

export const RETRY_BACKOFF_MINUTES = [5, 15, 60, 360] as const;
export const MAX_RETRY_COUNT = RETRY_BACKOFF_MINUTES.length;

export function retryDelayMinutes(retryNumber: number): number | null {
  return retryNumber >= 1 && retryNumber <= MAX_RETRY_COUNT ? RETRY_BACKOFF_MINUTES[retryNumber - 1] : null;
}

const allowedTransitions: Record<DriveFileStatus, readonly DriveFileStatus[]> = {
  [DriveFileStatus.DETECTED]: [DriveFileStatus.DOWNLOADING, DriveFileStatus.UNMAPPED, DriveFileStatus.REVIEW_REQUIRED],
  [DriveFileStatus.DOWNLOADING]: [DriveFileStatus.READY, DriveFileStatus.FAILED_RETRYABLE, DriveFileStatus.FAILED_FINAL, DriveFileStatus.REVIEW_REQUIRED],
  [DriveFileStatus.READY]: [DriveFileStatus.DOWNLOADING, DriveFileStatus.IMPORTING, DriveFileStatus.FAILED_RETRYABLE, DriveFileStatus.FAILED_FINAL, DriveFileStatus.REVIEW_REQUIRED],
  [DriveFileStatus.IMPORTING]: [DriveFileStatus.IMPORTED, DriveFileStatus.FAILED_RETRYABLE, DriveFileStatus.FAILED_FINAL, DriveFileStatus.REVIEW_REQUIRED],
  [DriveFileStatus.IMPORTED]: [DriveFileStatus.DETECTED, DriveFileStatus.REVIEW_REQUIRED],
  [DriveFileStatus.FAILED_RETRYABLE]: [DriveFileStatus.DETECTED, DriveFileStatus.DOWNLOADING, DriveFileStatus.REVIEW_REQUIRED],
  [DriveFileStatus.FAILED_FINAL]: [DriveFileStatus.DETECTED, DriveFileStatus.REVIEW_REQUIRED],
  [DriveFileStatus.UNMAPPED]: [DriveFileStatus.DETECTED, DriveFileStatus.REVIEW_REQUIRED],
  [DriveFileStatus.REVIEW_REQUIRED]: [DriveFileStatus.DETECTED, DriveFileStatus.READY],
};

function asDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid Drive timestamp.");
  return date;
}

function normalizedId(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function normalizedMessage(message?: string | null): string | null {
  if (!message) return null;
  return message.slice(0, 2000);
}

export function classifyDriveFileUpdate(existing: { driveModifiedTime: Date; sha256: string | null }, input: Pick<DriveFileDetectionInput, "modifiedTime" | "sha256">): DriveFileUpdateKind {
  const modifiedTime = asDate(input.modifiedTime);
  if (existing.driveModifiedTime.getTime() === modifiedTime.getTime()) return "unchanged";
  if (existing.sha256 && input.sha256 && existing.sha256 === input.sha256) return "content_unchanged";
  return "changed";
}

export function canTransitionDriveFileState(from: DriveFileStatus, to: DriveFileStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertDriveFileStateTransition(from: DriveFileStatus, to: DriveFileStatus): void {
  if (!canTransitionDriveFileState(from, to)) throw new Error(`Invalid DriveFileState transition: ${from} -> ${to}.`);
}

export async function upsertDetectedDriveFile(input: DriveFileDetectionInput, db: FileStateDb = prisma) {
  const driveFileId = normalizedId(input.driveFileId, "driveFileId");
  const folderId = normalizedId(input.folderId, "folderId");
  const fileName = normalizedId(input.fileName, "fileName");
  const mimeType = normalizedId(input.mimeType, "mimeType");
  const now = input.detectedAt ?? new Date();
  const createdTime = asDate(input.createdTime);
  const modifiedTime = asDate(input.modifiedTime);
  const mappingId = input.mappingId?.trim() || null;
  const mapping = mappingId ? await db.driveFolderMapping.findUnique({ where: { id: mappingId } }) : null;
  if (mappingId && !mapping) throw new Error("DriveFolderMapping was not found.");
  if (mapping && mapping.driveFolderId !== folderId) throw new Error("Drive Folder does not match DriveFolderMapping.");
  const mappingUsable = Boolean(mapping?.isActive && !mapping.isFuture);

  const existing = await db.driveFileState.findUnique({ where: { driveFileId } });
  if (!existing) {
    return db.driveFileState.create({
      data: {
        driveFileId, folderId, fileName, mimeType, sizeBytes: input.sizeBytes == null ? null : BigInt(input.sizeBytes),
        driveMd5Checksum: input.driveMd5Checksum ?? null, sha256: input.sha256 ?? null,
        driveCreatedTime: createdTime, driveModifiedTime: modifiedTime,
        firstDetectedAt: now, lastDetectedAt: now, lastSeenAt: now,
        status: mappingUsable ? DriveFileStatus.DETECTED : DriveFileStatus.UNMAPPED,
        isTrashed: input.isTrashed ?? false, driveFolderMappingId: mappingId,
      },
    });
  }

  const folderMoved = existing.folderId !== folderId;
  const mappingChanged = existing.driveFolderMappingId !== mappingId;
  const contentChanged = classifyDriveFileUpdate(existing, input) === "changed";
  const nextStatus = folderMoved || mappingChanged
    ? DriveFileStatus.REVIEW_REQUIRED
    : (!mappingUsable ? DriveFileStatus.UNMAPPED : (contentChanged && existing.status === DriveFileStatus.IMPORTED ? DriveFileStatus.DETECTED : existing.status));

  return db.driveFileState.update({
    where: { driveFileId },
    data: {
      folderId, fileName, mimeType, sizeBytes: input.sizeBytes == null ? null : BigInt(input.sizeBytes),
      driveMd5Checksum: input.driveMd5Checksum ?? null, sha256: input.sha256 ?? existing.sha256,
      driveCreatedTime: createdTime, driveModifiedTime: modifiedTime,
      lastDetectedAt: now, lastSeenAt: now, isTrashed: input.isTrashed ?? existing.isTrashed,
      driveFolderMappingId: mappingId, status: nextStatus,
    },
  });
}

export async function transitionDriveFileState(id: string, to: DriveFileStatus, data: Prisma.DriveFileStateUpdateInput = {}, db: FileStateDb = prisma) {
  const current = await db.driveFileState.findUnique({ where: { id } });
  if (!current) throw new Error("DriveFileState was not found.");
  assertDriveFileStateTransition(current.status, to);
  return db.driveFileState.update({ where: { id }, data: { ...data, status: to } });
}

export async function markDriveFileFailure(id: string, failure: DriveFileFailureInput, db: FileStateDb = prisma) {
  const current = await db.driveFileState.findUnique({ where: { id } });
  if (!current) throw new Error("DriveFileState was not found.");
  const retryNumber = Number(current.retryCount ?? 0) + 1;
  const canRetry = failure.retryable && retryNumber <= MAX_RETRY_COUNT;
  const status = canRetry ? DriveFileStatus.FAILED_RETRYABLE : DriveFileStatus.FAILED_FINAL;
  const nextRetryAt = canRetry ? failure.nextRetryAt ?? new Date(Date.now() + (retryDelayMinutes(retryNumber) ?? 0) * 60_000) : null;
  return transitionDriveFileState(id, status, {
    lastErrorCategory: failure.category,
    lastErrorCode: failure.code ?? null,
    lastErrorMessage: normalizedMessage(failure.message),
    retryCount: retryNumber,
    nextRetryAt,
  }, db);
}

export function getDriveFileStateByDriveFileId(driveFileId: string, db: FileStateDb = prisma) {
  return db.driveFileState.findUnique({ where: { driveFileId: normalizedId(driveFileId, "driveFileId") } });
}

export function listDriveFileStatesByStatus(status: DriveFileStatus, db: FileStateDb = prisma) {
  return db.driveFileState.findMany({ where: { status }, orderBy: { lastDetectedAt: "desc" } });
}

export function listPendingDriveFileStates(now = new Date(), db: FileStateDb = prisma) {
  // Broad processing candidates: DETECTED, READY, and due retryable failures.
  return db.driveFileState.findMany({
    where: {
      OR: [
        { status: DriveFileStatus.DETECTED },
        { status: DriveFileStatus.READY },
        { status: DriveFileStatus.FAILED_RETRYABLE, OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
      ],
    },
    orderBy: { lastDetectedAt: "asc" },
  });
}

export function listRetryPendingDriveFileStates(now = new Date(), db: FileStateDb = prisma) {
  // Retry-only candidates. Keep this narrower than listPendingDriveFileStates so observability counts are unambiguous.
  return db.driveFileState.findMany({
    where: {
      status: DriveFileStatus.FAILED_RETRYABLE,
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    orderBy: { lastDetectedAt: "asc" },
  });
}
