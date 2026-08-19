import { readFileSync } from "node:fs";
import { accessSync, constants as fsConstants } from "node:fs";
import type { Readable } from "node:stream";
import { google } from "googleapis";

import { GoogleDriveConnectionError, toGoogleDriveError } from "./errors";
import {
  DriveApi,
  DriveFileMetadata,
  DriveFolderMetadata,
  GOOGLE_DRIVE_READONLY_SCOPE,
  GoogleDriveClient,
} from "./types";

const DRIVE_FILE_FIELDS = "id,name,mimeType,size,createdTime,modifiedTime,parents,trashed,md5Checksum";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

export function loadServiceAccountCredentials(credentialsPath = process.env.GOOGLE_DRIVE_CREDENTIALS_PATH): ServiceAccountCredentials {
  if (!credentialsPath?.trim()) {
    throw new GoogleDriveConnectionError("GOOGLE_DRIVE_CREDENTIALS_PATH_MISSING", "GOOGLE_DRIVE_CREDENTIALS_PATH is not set.");
  }

  try {
    accessSync(credentialsPath, fsConstants.R_OK);
  } catch {
    throw new GoogleDriveConnectionError("GOOGLE_DRIVE_CREDENTIALS_FILE_NOT_FOUND", "Google Drive credential file is missing or unreadable.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(credentialsPath, "utf8"));
  } catch {
    throw new GoogleDriveConnectionError("GOOGLE_DRIVE_CREDENTIALS_INVALID_JSON", "Google Drive credential file is not valid JSON.");
  }

  const candidate = parsed as Partial<ServiceAccountCredentials>;
  if (typeof candidate.client_email !== "string" || typeof candidate.private_key !== "string" || !candidate.client_email || !candidate.private_key) {
    throw new GoogleDriveConnectionError("GOOGLE_DRIVE_CREDENTIALS_INVALID", "Google Drive credential file does not contain a valid service account.");
  }
  return { client_email: candidate.client_email, private_key: candidate.private_key, project_id: typeof candidate.project_id === "string" ? candidate.project_id : undefined };
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDriveFile(raw: Record<string, unknown>): DriveFileMetadata {
  const id = typeof raw.id === "string" ? raw.id : "";
  const name = typeof raw.name === "string" ? raw.name : "";
  if (!id || !name) throw new GoogleDriveConnectionError("GOOGLE_DRIVE_API_ERROR", "Google Drive returned file metadata without an id or name.");
  return {
    id,
    name,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : null,
    sizeBytes: numberOrNull(raw.size),
    createdTime: typeof raw.createdTime === "string" ? raw.createdTime : null,
    modifiedTime: typeof raw.modifiedTime === "string" ? raw.modifiedTime : null,
    parents: Array.isArray(raw.parents) ? raw.parents.filter((value): value is string => typeof value === "string") : [],
    trashed: raw.trashed === true,
    md5Checksum: typeof raw.md5Checksum === "string" ? raw.md5Checksum : null,
  };
}

export function requireDevelopmentFolderId(folderId = process.env.GOOGLE_DRIVE_DEV_ROOT_FOLDER_ID): string {
  if (!folderId?.trim()) throw new GoogleDriveConnectionError("GOOGLE_DRIVE_FOLDER_ID_MISSING", "GOOGLE_DRIVE_DEV_ROOT_FOLDER_ID is not set.");
  return folderId.trim();
}

class GoogleDriveClientImpl implements GoogleDriveClient {
  constructor(private readonly api: DriveApi) {}

  async getFolderMetadata(folderId: string): Promise<DriveFolderMetadata> {
    if (!folderId.trim()) throw new GoogleDriveConnectionError("GOOGLE_DRIVE_FOLDER_ID_MISSING", "Google Drive folder ID is empty.");
    try {
      const response = await this.api.files.get({ fileId: folderId, fields: DRIVE_FILE_FIELDS, supportsAllDrives: false });
      return normalizeDriveFile((response.data as Record<string, unknown> | undefined) ?? {});
    } catch (error) {
      throw toGoogleDriveError(error);
    }
  }

  async listFilesInFolder(folderId: string): Promise<DriveFileMetadata[]> {
    if (!folderId.trim()) throw new GoogleDriveConnectionError("GOOGLE_DRIVE_FOLDER_ID_MISSING", "Google Drive folder ID is empty.");
    const files: DriveFileMetadata[] = [];
    let pageToken: string | undefined;
    try {
      do {
        const response = await this.api.files.list({
          q: `'${folderId}' in parents and trashed = false`,
          fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`,
          orderBy: "name",
          pageSize: 1000,
          pageToken,
          spaces: "drive",
          includeItemsFromAllDrives: false,
          supportsAllDrives: false,
        });
        for (const file of response.data?.files ?? []) files.push(normalizeDriveFile(file));
        pageToken = response.data?.nextPageToken ?? undefined;
      } while (pageToken);
      return files;
    } catch (error) {
      throw toGoogleDriveError(error);
    }
  }

  async downloadFile(fileId: string): Promise<Readable> {
    if (!fileId.trim()) throw new GoogleDriveConnectionError("GOOGLE_DRIVE_FILE_NOT_FOUND", "Google Drive file ID is empty.");
    try {
      const response = await this.api.files.get({ fileId, alt: "media" }, { responseType: "stream" });
      if (!response.data || typeof (response.data as { pipe?: unknown }).pipe !== "function") {
        throw new GoogleDriveConnectionError("GOOGLE_DRIVE_DOWNLOAD_FAILED", "Google Drive did not return a download stream.");
      }
      return response.data as Readable;
    } catch (error) {
      if (error instanceof GoogleDriveConnectionError) throw error;
      const status = typeof error === "object" && error !== null
        ? ((error as { response?: { status?: number }; code?: number }).response?.status ?? (error as { code?: number }).code)
        : undefined;
      if (status === 404) throw new GoogleDriveConnectionError("GOOGLE_DRIVE_FILE_NOT_FOUND", "Google Drive file was not found.");
      if (status === 403) throw new GoogleDriveConnectionError("GOOGLE_DRIVE_PERMISSION_DENIED", "Google Drive permission denied.");
      throw new GoogleDriveConnectionError("GOOGLE_DRIVE_DOWNLOAD_FAILED", "Google Drive file download failed.");
    }
  }
}

export function createDriveClient(options: { driveApi?: DriveApi; credentialsPath?: string } = {}): GoogleDriveClient {
  if (options.driveApi) return new GoogleDriveClientImpl(options.driveApi);
  const credentials = loadServiceAccountCredentials(options.credentialsPath);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [GOOGLE_DRIVE_READONLY_SCOPE] });
  return new GoogleDriveClientImpl(google.drive({ version: "v3", auth }) as unknown as DriveApi);
}
