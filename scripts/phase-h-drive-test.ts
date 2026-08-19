import { createDriveClient, requireDevelopmentFolderId } from "../src/lib/import-automation/google-drive/client";

async function main() {
  const folderId = requireDevelopmentFolderId();
  const client = createDriveClient();
  const folder = await client.getFolderMetadata(folderId);
  const files = await client.listFilesInFolder(folderId);

  console.log("Google Drive connection: OK");
  console.log(`Folder: ${folder.name}`);
  console.log(`Files: ${files.length}`);
  for (const file of files.slice(0, 10)) console.log(`- ${file.name}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Google Drive connection failed.";
  console.error(`Google Drive connection: FAILED — ${message}`);
  process.exitCode = 1;
});
