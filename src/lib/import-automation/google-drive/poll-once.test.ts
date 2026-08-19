import { describe, expect, it, vi } from "vitest";
import { runPollOnce } from "./poll-once";

const scan = { summary: { mappingsScanned: 1, filesSeen: 1, newFiles: 0, changedFiles: 0, unchangedFiles: 1, downloadedFiles: 0, skippedFiles: 1, reviewRequired: 0, failedFiles: 0 }, files: [] };

describe("poll once", () => {
  it("runs one scan under the global lock and reports pending retry count", async () => {
    const runScan = vi.fn(async () => scan);
    const result = await runPollOnce({ client: {} as never, listRetryPending: async () => [{ id: "retry-1" }], runScan, withGlobalLock: async (operation) => ({ acquired: true, result: await operation() }) });
    expect(result).toMatchObject({ lock: "ACQUIRED", retryPending: 1, scan });
    expect(runScan).toHaveBeenCalledOnce();
  });

  it.each([
    ["DETECTED/READY only", [], 0],
    ["due retry", [{ status: "FAILED_RETRYABLE" }], 1],
    ["null retry time", [{ status: "FAILED_RETRYABLE", nextRetryAt: null }], 1],
    ["future retry/final", [], 0],
  ])("uses the retry-only query result for %s", async (_label, rows, expected) => {
    const result = await runPollOnce({ client: {} as never, listRetryPending: async () => rows, runScan: async () => scan, withGlobalLock: async (operation) => ({ acquired: true, result: await operation() }) });
    expect(result.retryPending).toBe(expected);
  });

  it("safely skips an overlapping scan", async () => {
    const runScan = vi.fn();
    const result = await runPollOnce({ client: {} as never, runScan, withGlobalLock: async () => ({ acquired: false }) });
    expect(result).toEqual({ lock: "SKIPPED", retryPending: 0, scan: null });
    expect(runScan).not.toHaveBeenCalled();
  });
});
