import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

import { GoogleDriveConnectionError } from "./errors";
import { DriveFileMetadata, DriveImportFile, GoogleDriveClient } from "./types";
import { GoogleDriveTemporaryStorage } from "./temporary-storage";

const WORKSPACE_MIME_PREFIX = "application/vnd.google-apps.";

export function assertDownloadableDriveFile(file: DriveFileMetadata): void {
  if (!file.id) throw new GoogleDriveConnectionError("GOOGLE_DRIVE_FILE_NOT_FOUND", "Google Drive file ID is missing.");
  if (file.trashed) throw new GoogleDriveConnectionError("GOOGLE_DRIVE_FILE_NOT_FOUND", "Trashed Google Drive files cannot be downloaded.");
  if (file.mimeType?.startsWith(WORKSPACE_MIME_PREFIX)) {
    throw new GoogleDriveConnectionError("GOOGLE_DRIVE_UNSUPPORTED_WORKSPACE_FILE", "Google Workspace native files are not supported in H3.");
  }
}

export async function downloadDriveFile(input: {
  client: GoogleDriveClient;
  file: DriveFileMetadata;
  folderId: string;
  storage: GoogleDriveTemporaryStorage;
}): Promise<DriveImportFile> {
  assertDownloadableDriveFile(input.file);
  const localPath = await input.storage.create(input.file.id, input.file.name);
  try {
    const stream = await input.client.downloadFile(input.file.id);
    const hash = createHash("sha256");
    let sizeBytes = 0;
    const hashingTransform = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        sizeBytes += chunk.length;
        callback(null, chunk);
      },
    });
    await pipeline(stream, hashingTransform, createWriteStream(localPath, { flags: "wx" }));
    const sha256 = hash.digest("hex");
    return {
      driveFileId: input.file.id,
      folderId: input.folderId,
      displayName: input.file.name,
      fileName: input.file.name,
      localPath,
      mimeType: input.file.mimeType,
      sizeBytes,
      createdTime: input.file.createdTime,
      modifiedTime: input.file.modifiedTime,
      driveMd5Checksum: input.file.md5Checksum,
      sha256,
      downloadedAt: new Date().toISOString(),
    };
  } catch (error) {
    await input.storage.cleanup(localPath).catch(() => undefined);
    if (error instanceof GoogleDriveConnectionError) throw error;
    throw new GoogleDriveConnectionError("GOOGLE_DRIVE_DOWNLOAD_FAILED", "Google Drive file download failed.");
  }
}
