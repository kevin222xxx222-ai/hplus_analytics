import "dotenv/config";
import { createDriveClient } from "../src/lib/import-automation/google-drive/client";
import { executeHeavenShopDriveFile, validateHeavenShopExecuteInput } from "../src/lib/import-automation/google-drive/heaven-shop-execute";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const driveFileId = arg("drive-file-id");
  const confirmProduction = process.argv.includes("--confirm-production");
  if (!driveFileId) throw new Error("Usage: npm run drive:execute-heaven-shop -- --drive-file-id=<id> [--confirm-production]");
  validateHeavenShopExecuteInput({ driveFileId });
  const result = await executeHeavenShopDriveFile({ driveFileId, confirmProduction, client: createDriveClient() });
  console.log(`Heaven SHOP Drive Execute: ${result.outcome === "SKIPPED" ? "SKIPPED" : "OK"}`);
  if (result.batchId) console.log(`ImportBatch: ${result.batchId}`);
  if (result.batchStatus) console.log(`Batch Status: ${result.batchStatus}`);
  console.log(`Drive State: ${result.outcome === "EXECUTED" ? "REVIEW_REQUIRED" : result.reason || "UNCHANGED"}`);
  if (result.reviewUrl) console.log(`Review URL: ${result.reviewUrl}`);
  console.log("Confirm: NOT EXECUTED");
}

main().catch((error: unknown) => {
  console.error(`Heaven SHOP Drive Execute: FAILED — ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
