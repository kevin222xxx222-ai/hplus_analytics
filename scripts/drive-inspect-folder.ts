import "dotenv/config";
import { createDriveClient, requireDevelopmentFolderId } from "../src/lib/import-automation/google-drive/client";
import { inspectDriveFile } from "../src/lib/import-automation/google-drive/inspect";

async function main() {
  const folderId = requireDevelopmentFolderId();
  const client = createDriveClient();
  const folder = await client.getFolderMetadata(folderId);
  const files = await client.listFilesInFolder(folderId);

  console.log(`Folder: ${folder.name}`);
  console.log(`Files: ${files.length}`);
  files.forEach((file, index) => {
    const inspection = inspectDriveFile(file);
    console.log(`\nFile ${index + 1}: ${inspection.name}`);
    console.log(`  mimeType: ${inspection.mimeType ?? "(null)"}`);
    console.log(`  sizeBytes: ${inspection.sizeBytes ?? "(null)"}`);
    console.log(`  trashed: ${inspection.trashed}`);
    console.log(`  md5Checksum: ${inspection.hasMd5Checksum ? "present" : "absent"}`);
    console.log(`  createdTime: ${inspection.createdTime ?? "(null)"}`);
    console.log(`  modifiedTime: ${inspection.modifiedTime ?? "(null)"}`);
    console.log(`  downloadable: ${inspection.downloadable}`);
  });
}

main().catch((error: unknown) => {
  console.error(`Google Drive folder inspection: FAILED — ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
