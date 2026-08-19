import "dotenv/config";
import { createDriveClient } from "../src/lib/import-automation/google-drive/client";
import { classifyDriveFileUpdate, getDriveFileStateByDriveFileId, upsertDetectedDriveFile } from "../src/lib/import-automation/google-drive/file-state-service";
import { resolveDriveFolderMapping } from "../src/lib/import-automation/google-drive/mapping-service";
import { prisma } from "../src/lib/prisma";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

async function main() {
  const folderId = requiredEnv("GOOGLE_DRIVE_DEV_TEST_FOLDER_ID");
  const client = createDriveClient({ credentialsPath: requiredEnv("GOOGLE_DRIVE_CREDENTIALS_PATH") });
  const folder = await client.getFolderMetadata(folderId);
  const mapping = await resolveDriveFolderMapping(folderId);
  const files = await client.listFilesInFolder(folderId);
  const requestedFileId = process.env.GOOGLE_DRIVE_DEV_TEST_FILE_ID?.trim();
  const file = requestedFileId ? files.find((candidate) => candidate.id === requestedFileId) : files.find((candidate) => candidate.mimeType !== FOLDER_MIME_TYPE);

  if (!file) throw new Error(requestedFileId ? "GOOGLE_DRIVE_DEV_TEST_FILE_ID was not found directly in the test Folder." : "No regular file was found directly in the test Folder.");
  if (!file.createdTime || !file.modifiedTime) throw new Error("Selected Drive file has no createdTime or modifiedTime metadata.");

  const existing = await getDriveFileStateByDriveFileId(file.id);
  const classification = !existing ? "NEW" : classifyDriveFileUpdate(existing, { modifiedTime: file.modifiedTime, sha256: null }).toUpperCase();
  const state = await upsertDetectedDriveFile({
    driveFileId: file.id,
    folderId,
    fileName: file.name,
    mimeType: file.mimeType ?? "application/octet-stream",
    sizeBytes: file.sizeBytes == null ? null : BigInt(file.sizeBytes),
    driveMd5Checksum: file.md5Checksum,
    sha256: null,
    createdTime: file.createdTime,
    modifiedTime: file.modifiedTime,
    mappingId: mapping.id,
    isTrashed: file.trashed,
  });

  console.log("Drive State detect test: OK");
  console.log(`Folder: ${folder.name}`);
  console.log(`File: ${file.name}`);
  console.log(`Mapping: ${mapping.displayName} / ${mapping.importDataType}`);
  console.log(`State ID: ${state.id}`);
  console.log(`Status: ${state.status}`);
  console.log(`Update classification: ${classification}`);
  console.log("Import: NOT EXECUTED");
  console.log("Download: NOT EXECUTED");
}

main()
  .catch((error: unknown) => {
    console.error(`Drive State detect test: FAILED — ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
