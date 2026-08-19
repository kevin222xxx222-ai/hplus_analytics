import "dotenv/config";
import { createDriveClient } from "../src/lib/import-automation/google-drive/client";
import { runManualOneShotScan } from "../src/lib/import-automation/google-drive/one-shot-scan";
import { listActiveDriveFolderMappings } from "../src/lib/import-automation/google-drive/mapping-service";

async function main() {
  if (process.env.GOOGLE_DRIVE_AUTOMATION_ENV !== "development") throw new Error("GOOGLE_DRIVE_AUTOMATION_ENV=development is required; Production scan is refused.");
  const credentialsPath = process.env.GOOGLE_DRIVE_CREDENTIALS_PATH?.trim();
  if (!credentialsPath) throw new Error("GOOGLE_DRIVE_CREDENTIALS_PATH is not set.");
  const client = createDriveClient({ credentialsPath });
  console.log("Phase H Development Scan: START");
  const result = await runManualOneShotScan({ client, getMappings: async () => listActiveDriveFolderMappings() as never });
  for (const file of result.files) {
    console.log(`File: ${file.fileName}`);
    console.log(`Detection: ${file.classification}`);
    console.log(`State: ${file.status}`);
    console.log(`Action: ${file.download === "OK" ? "DOWNLOAD" : "SKIP"}`);
    if (file.dispatcher) {
      console.log(`Dispatcher: ${file.dispatcher.pipeline ?? "BLOCKED"}`);
      console.log(`Policy: ${file.dispatcher.policy}`);
      console.log("Import: NOT EXECUTED");
    }
    if (file.error) console.log(`Error: ${file.error}`);
  }
  const summary = result.summary;
  console.log("Summary:");
  for (const [key, value] of Object.entries(summary)) console.log(`${key}: ${value}`);
  console.log("Import: NOT EXECUTED");
  console.log("Phase H Development Scan: OK");
}

main().catch((error: unknown) => {
  console.error(`Phase H Development Scan: FAILED — ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
