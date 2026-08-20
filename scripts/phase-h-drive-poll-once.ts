import "dotenv/config";
import { createDriveClient } from "../src/lib/import-automation/google-drive/client";
import { runPollOnce } from "../src/lib/import-automation/google-drive/poll-once";

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, environment: process.env.GOOGLE_DRIVE_AUTOMATION_ENV ?? "unset", ...data }));
}

async function main() {
  const environment = process.env.GOOGLE_DRIVE_AUTOMATION_ENV;
  if (environment !== "development" && !(environment === "production" && process.env.GOOGLE_DRIVE_AUTOMATION_ENABLED === "true")) {
    throw new Error("Automation requires GOOGLE_DRIVE_AUTOMATION_ENV=development; production also requires GOOGLE_DRIVE_AUTOMATION_ENABLED=true.");
  }
  const credentialsPath = process.env.GOOGLE_DRIVE_CREDENTIALS_PATH?.trim();
  if (!credentialsPath) throw new Error("GOOGLE_DRIVE_CREDENTIALS_PATH is not set.");
  const startedAt = Date.now();
  log("scan_start");
  const result = await runPollOnce({ client: createDriveClient({ credentialsPath }) });
  if (result.lock === "SKIPPED") {
    log("scan_skipped", { reason: "GLOBAL_LOCK_BUSY", exit: 0, durationMs: Date.now() - startedAt });
    return;
  }
  const summary = result.scan?.summary;
  log("scan_end", {
    mappings: summary?.mappingsScanned ?? 0, filesSeen: summary?.filesSeen ?? 0, downloaded: summary?.downloadedFiles ?? 0,
    skipped: summary?.skippedFiles ?? 0, retryPending: result.retryPending, reviewRequired: summary?.reviewRequired ?? 0,
    failed: summary?.failedFiles ?? 0, autoExecutionEnabled: process.env.GOOGLE_DRIVE_AUTO_EXECUTION_ENABLED === "true", autoExecuted: summary?.autoExecuted ?? 0,
    autoReviewRequired: summary?.autoReviewRequired ?? 0, autoFailed: summary?.autoFailed ?? 0, autoBlocked: summary?.autoBlocked ?? 0,
    durationMs: Date.now() - startedAt, exit: 0, import: "NOT_EXECUTED",
  });
}

main().catch((error: unknown) => {
  log("scan_failed", { error: error instanceof Error ? error.message : "unknown error", exit: 1 });
  process.exitCode = 1;
});
