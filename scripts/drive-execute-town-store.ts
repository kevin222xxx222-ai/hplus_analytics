import "dotenv/config";
import { createDriveClient } from "../src/lib/import-automation/google-drive/client";
import { executeTownStoreDriveFile, validateTownStoreExecuteInput } from "../src/lib/import-automation/google-drive/town-store-execute";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const driveFileId = arg("drive-file-id");
  const targetDate = arg("target-date");
  const confirmProduction = process.argv.includes("--confirm-production");
  if (!driveFileId || !targetDate) throw new Error("Usage: npm run drive:execute-town-store -- --drive-file-id=<id> --target-date=YYYY-MM-DD [--confirm-production]");
  validateTownStoreExecuteInput({ driveFileId, targetDate });
  const result = await executeTownStoreDriveFile({ driveFileId, targetDate, confirmProduction, client: createDriveClient() });
  console.log(`Town STORE Drive Execute: ${result.outcome === "SKIPPED" ? "SKIPPED" : "OK"}`);
  if (result.batchId) console.log(`ImportBatch: ${result.batchId}`);
  if (result.batchStatus) console.log(`Batch Status: ${result.batchStatus}`);
  console.log(`Drive State: ${result.outcome === "EXECUTED" ? "REVIEW_REQUIRED" : result.reason || "UNCHANGED"}`);
  if (result.reviewUrl) console.log(`Review URL: ${result.reviewUrl}`);
  console.log("Confirm: NOT EXECUTED");
}

main().catch((error: unknown) => {
  console.error(`Town STORE Drive Execute: FAILED — ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
