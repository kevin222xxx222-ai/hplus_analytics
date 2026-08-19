import { createDriveClient, requireDevelopmentFolderId } from "../src/lib/import-automation/google-drive/client";
import { downloadDriveFile } from "../src/lib/import-automation/google-drive/download";
import { GoogleDriveConnectionError } from "../src/lib/import-automation/google-drive/errors";
import { GoogleDriveTemporaryStorage } from "../src/lib/import-automation/google-drive/temporary-storage";

const GOOGLE_WORKSPACE_MIME_PREFIX = "application/vnd.google-apps.";

async function main() {
  const folderId = requireDevelopmentFolderId();
  const client = createDriveClient();
  const folder = await client.getFolderMetadata(folderId);
  const files = await client.listFilesInFolder(folderId);
  const requestedId = process.env.GOOGLE_DRIVE_DEV_TEST_FILE_ID?.trim();
  const file = requestedId ? files.find((candidate) => candidate.id === requestedId) : files.find((candidate) => !candidate.mimeType?.startsWith(GOOGLE_WORKSPACE_MIME_PREFIX) && !candidate.trashed);
  if (!file) throw new GoogleDriveConnectionError("GOOGLE_DRIVE_FILE_NOT_FOUND", requestedId ? "GOOGLE_DRIVE_DEV_TEST_FILE_ID was not found in the Development Folder." : "No downloadable file was found in the Development Folder.");

  const storage = new GoogleDriveTemporaryStorage();
  let localPath: string | undefined;
  try {
    console.log("Google Drive download test: START");
    console.log(`Folder: ${folder.name}`);
    console.log(`File: ${file.name}`);
    const result = await downloadDriveFile({ client, file, folderId, storage });
    localPath = result.localPath;
    console.log(`Size: ${result.sizeBytes} bytes`);
    console.log(`SHA-256: ${result.sha256}`);
    console.log(`Temporary file created: ${result.localPath}`);
    await storage.cleanup(result.localPath);
    localPath = undefined;
    console.log("Temporary cleanup: OK");
    console.log("Google Drive download test: OK");
  } finally {
    if (localPath) await storage.cleanup(localPath).catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Google Drive download test failed.";
  console.error(`Google Drive download test: FAILED — ${message}`);
  process.exitCode = 1;
});
