import "dotenv/config";
import { createDriveClient } from "../src/lib/import-automation/google-drive/client";
import { dispatchDriveImport } from "../src/lib/import-automation/google-drive/dispatcher";
import { resolveDriveFolderMapping } from "../src/lib/import-automation/google-drive/mapping-service";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

async function main() {
  const folderId = requiredEnv("GOOGLE_DRIVE_DEV_TEST_FOLDER_ID");
  const client = createDriveClient({ credentialsPath: requiredEnv("GOOGLE_DRIVE_CREDENTIALS_PATH") });
  const mapping = await resolveDriveFolderMapping(folderId);
  const files = await client.listFilesInFolder(folderId);
  const requestedFileId = process.env.GOOGLE_DRIVE_DEV_TEST_FILE_ID?.trim();
  const file = requestedFileId ? files.find((candidate) => candidate.id === requestedFileId) : files[0];
  if (!file) throw new Error("No Drive file was found in the Development test Folder.");
  if (!file.createdTime || !file.modifiedTime) throw new Error("Selected Drive file has no createdTime or modifiedTime metadata.");

  const result = await dispatchDriveImport({
    file: {
      driveFileId: file.id, folderId, displayName: file.name, fileName: file.name, localPath: "",
      mimeType: file.mimeType, sizeBytes: file.sizeBytes ?? 0, createdTime: file.createdTime,
      modifiedTime: file.modifiedTime, driveMd5Checksum: file.md5Checksum, sha256: "", downloadedAt: "",
    },
    mapping: {
      id: mapping.id, driveFolderId: mapping.driveFolderId, displayName: mapping.displayName,
      importDataType: mapping.importDataType, metricHint: mapping.metricHint, isActive: mapping.isActive, isFuture: mapping.isFuture,
      importSource: { id: mapping.importSource.id, name: mapping.importSource.name, dataType: mapping.importSource.dataType, mediaType: mapping.importSource.mediaType, storeId: mapping.importSource.storeId },
      store: mapping.store ? { id: mapping.store.id, code: mapping.store.code, shortName: mapping.store.shortName } : null,
    },
  }, { mode: "RESOLVE_ONLY" });

  console.log("Drive Dispatcher test: OK");
  console.log(`File: ${file.name}`);
  console.log(`ImportDataType: ${mapping.importDataType}`);
  console.log(`Pipeline: ${result.pipeline ?? "BLOCKED"}`);
  console.log(`Policy: ${result.policy}`);
  console.log(`Status: ${result.status}`);
  console.log(`Import: ${result.importBatchId ? result.importBatchId : "NOT EXECUTED"}`);
}

main().catch((error: unknown) => {
  console.error(`Drive Dispatcher test: FAILED — ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
