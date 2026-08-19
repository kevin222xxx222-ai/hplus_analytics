import { listRetryPendingDriveFileStates } from "./file-state-service";
import { withAdvisoryLock, driveFileLockName, GLOBAL_SCAN_LOCK_NAME } from "./advisory-lock";
import { runManualOneShotScan, type OneShotScanResult } from "./one-shot-scan";
import type { GoogleDriveClient } from "./types";

export type PollOnceResult = {
  lock: "ACQUIRED" | "SKIPPED";
  retryPending: number;
  scan: OneShotScanResult | null;
};

export type PollOnceDependencies = {
  client: GoogleDriveClient;
  runScan?: () => Promise<OneShotScanResult>;
  listRetryPending?: () => Promise<unknown[]>;
  withGlobalLock?: <T>(operation: () => Promise<T>) => Promise<{ acquired: boolean; result?: T }>;
  withFileLock?: <T>(driveFileId: string, operation: () => Promise<T>) => Promise<{ acquired: boolean; result?: T }>;
};

export async function runPollOnce(dependencies: PollOnceDependencies): Promise<PollOnceResult> {
  const withGlobalLock = dependencies.withGlobalLock ?? ((operation) => withAdvisoryLock(GLOBAL_SCAN_LOCK_NAME, operation));
  const locked = await withGlobalLock(async () => {
    const pending = await (dependencies.listRetryPending ?? (() => listRetryPendingDriveFileStates(new Date())))();
    const scan = dependencies.runScan
      ? await dependencies.runScan()
      : await runManualOneShotScan({ client: dependencies.client, withFileLock: dependencies.withFileLock ?? ((id, operation) => withAdvisoryLock(driveFileLockName(id), operation)) });
    return { retryPending: pending.length, scan };
  });
  if (!locked.acquired) return { lock: "SKIPPED", retryPending: 0, scan: null };
  return { lock: "ACQUIRED", retryPending: locked.result?.retryPending ?? 0, scan: locked.result?.scan ?? null };
}
