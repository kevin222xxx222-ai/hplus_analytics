import "dotenv/config";
import { resetDriveFileState, validateResetDriveFileStateInput } from "../src/lib/import-automation/google-drive/reset-state";

function arg(name: string) { const prefix = `--${name}=`; return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length); }

async function main() {
  const driveFileId = arg("drive-file-id");
  const to = arg("to");
  const confirmProduction = process.argv.includes("--confirm-production");
  const dryRun = process.argv.includes("--dry-run");
  if (!driveFileId || to !== "READY") throw new Error("Usage: npm run drive:reset-state -- --drive-file-id=<id> --to=READY [--dry-run] [--confirm-production]");
  validateResetDriveFileStateInput({ driveFileId });
  const result = await resetDriveFileState({ driveFileId, confirmProduction, dryRun });
  console.log(`Drive State Reset: ${result.outcome}`);
  console.log(`Drive File: ${result.driveFileId}`);
  console.log(`State: ${result.from} -> ${result.to}`);
  if (result.reason) console.log(`Reason: ${result.reason}`);
}

main().catch((error: unknown) => { console.error(`Drive State Reset: FAILED — ${error instanceof Error ? error.message : "unknown error"}`); process.exitCode = 1; });
