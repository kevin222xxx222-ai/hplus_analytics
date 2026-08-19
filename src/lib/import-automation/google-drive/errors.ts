export type GoogleDriveErrorCode =
  | "GOOGLE_DRIVE_CREDENTIALS_PATH_MISSING"
  | "GOOGLE_DRIVE_CREDENTIALS_FILE_NOT_FOUND"
  | "GOOGLE_DRIVE_CREDENTIALS_INVALID_JSON"
  | "GOOGLE_DRIVE_CREDENTIALS_INVALID"
  | "GOOGLE_DRIVE_AUTH_FAILURE"
  | "GOOGLE_DRIVE_FILE_NOT_FOUND"
  | "GOOGLE_DRIVE_UNSUPPORTED_WORKSPACE_FILE"
  | "GOOGLE_DRIVE_DOWNLOAD_FAILED"
  | "GOOGLE_DRIVE_TEMP_STORAGE_FAILED"
  | "GOOGLE_DRIVE_CHECKSUM_FAILED"
  | "GOOGLE_DRIVE_CLEANUP_FAILED"
  | "GOOGLE_DRIVE_FOLDER_ID_MISSING"
  | "GOOGLE_DRIVE_FOLDER_NOT_FOUND"
  | "GOOGLE_DRIVE_PERMISSION_DENIED"
  | "GOOGLE_DRIVE_API_ERROR";

export class GoogleDriveConnectionError extends Error {
  readonly code: GoogleDriveErrorCode;

  constructor(code: GoogleDriveErrorCode, message: string) {
    super(message);
    this.name = "GoogleDriveConnectionError";
    this.code = code;
  }
}

export function toGoogleDriveError(error: unknown): GoogleDriveConnectionError {
  if (error instanceof GoogleDriveConnectionError) return error;

  const status = typeof error === "object" && error !== null
    ? ((error as { response?: { status?: number }; code?: number }).response?.status ?? (error as { code?: number }).code)
    : undefined;
  if (status === 401) return new GoogleDriveConnectionError("GOOGLE_DRIVE_AUTH_FAILURE", "Google Drive authentication failed.");
  if (status === 403) return new GoogleDriveConnectionError("GOOGLE_DRIVE_PERMISSION_DENIED", "Google Drive permission denied.");
  if (status === 404) return new GoogleDriveConnectionError("GOOGLE_DRIVE_FOLDER_NOT_FOUND", "Google Drive folder was not found.");
  return new GoogleDriveConnectionError("GOOGLE_DRIVE_API_ERROR", "Google Drive API request failed.");
}
