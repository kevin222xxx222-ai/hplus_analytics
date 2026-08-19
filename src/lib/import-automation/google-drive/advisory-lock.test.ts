import { describe, expect, it, vi } from "vitest";
import { driveFileLockName, withAdvisoryLock } from "./advisory-lock";

function connection(locked = true) {
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes("try") ? [{ locked }] : [] }));
  return { query, end: vi.fn(async () => undefined) };
}

describe("advisory locks", () => {
  it("acquires, runs, and unlocks", async () => {
    const c = connection();
    const result = await withAdvisoryLock("file-1", async () => "ok", { connect: async () => c });
    expect(result).toEqual({ acquired: true, result: "ok" });
    expect(c.query).toHaveBeenCalledTimes(2);
    expect(c.end).toHaveBeenCalledOnce();
  });

  it("returns immediately when a lock is busy", async () => {
    const c = connection(false);
    const operation = vi.fn();
    const result = await withAdvisoryLock("file-1", operation, { connect: async () => c });
    expect(result).toEqual({ acquired: false });
    expect(operation).not.toHaveBeenCalled();
    expect(c.query).toHaveBeenCalledOnce();
  });

  it("unlocks after operation failure and uses distinct deterministic file names", async () => {
    const c = connection();
    await expect(withAdvisoryLock(driveFileLockName("file-1"), async () => { throw new Error("boom"); }, { connect: async () => c })).rejects.toThrow("boom");
    expect(c.query).toHaveBeenCalledTimes(2);
    expect(driveFileLockName("file-1")).not.toBe(driveFileLockName("file-2"));
  });
});
