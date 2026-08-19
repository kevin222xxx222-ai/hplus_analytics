import type { DriveFileMetadata } from "./types";

export const GOOGLE_WORKSPACE_MIME_PREFIX = "application/vnd.google-apps.";

export type DriveFileInspection = {
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  trashed: boolean;
  hasMd5Checksum: boolean;
  createdTime: string | null;
  modifiedTime: string | null;
  downloadable: boolean;
};

/** Mirrors the existing download-test predicate without performing a download. */
export function inspectDriveFile(file: DriveFileMetadata): DriveFileInspection {
  return {
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    trashed: file.trashed,
    hasMd5Checksum: Boolean(file.md5Checksum),
    createdTime: file.createdTime,
    modifiedTime: file.modifiedTime,
    downloadable: !file.mimeType?.startsWith(GOOGLE_WORKSPACE_MIME_PREFIX) && !file.trashed,
  };
}
