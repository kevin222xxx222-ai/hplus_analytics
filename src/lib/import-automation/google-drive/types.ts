import type { Readable } from "node:stream";

export const GOOGLE_DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly" as const;

export type DriveFileMetadata = {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdTime: string | null;
  modifiedTime: string | null;
  parents: string[];
  trashed: boolean;
  md5Checksum: string | null;
};

export type DriveFolderMetadata = DriveFileMetadata;

export type DriveFilesApi = {
  get: (params: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ data?: unknown }>;
  list: (params: Record<string, unknown>) => Promise<{ data?: { files?: Array<Record<string, unknown>>; nextPageToken?: string | null } }>;
};

export type DriveApi = { files: DriveFilesApi };

export type GoogleDriveClient = {
  getFolderMetadata: (folderId: string) => Promise<DriveFolderMetadata>;
  listFilesInFolder: (folderId: string) => Promise<DriveFileMetadata[]>;
  downloadFile: (fileId: string) => Promise<Readable>;
};

export type DriveImportFile = {
  driveFileId: string;
  folderId: string;
  displayName: string;
  fileName: string;
  localPath: string;
  mimeType: string | null;
  sizeBytes: number;
  createdTime: string | null;
  modifiedTime: string | null;
  driveMd5Checksum: string | null;
  sha256: string;
  downloadedAt: string;
};
