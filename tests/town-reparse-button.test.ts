import { describe, expect, it, vi } from "vitest";
import { executeTownReparse } from "@/components/town-reparse-button";
import { runTownReparseExclusively } from "@/lib/imports/town/reparse-service";

const successResult = {
  before: { pendingCount: 3, warningCount: 3, errorCount: 0, unmatchedCount: 5 },
  after: { pendingCount: 0, warningCount: 0, errorCount: 0, unmatchedCount: 0 },
};

function harness(fetcher: typeof fetch, refresh = vi.fn(), timeoutMs = 1_000) {
  const pending: boolean[] = []; const errors: string[] = []; const messages: string[] = [];
  const lock = { current: false };
  const run = () => executeTownReparse({
    batchId: "batch", lock, fetcher, refresh, timeoutMs,
    setPending: (value) => pending.push(value), setError: (value) => errors.push(value), setMessage: (value) => messages.push(value),
  });
  return { run, lock, pending, errors, messages, refresh };
}

describe("Town reparse button execution", () => {
  it("releases pending after success and refresh", async () => {
    const state = harness(vi.fn(async () => Response.json(successResult)) as typeof fetch);
    await expect(state.run()).resolves.toBe(true);
    expect(state.pending).toEqual([true, false]);
    expect(state.lock.current).toBe(false);
    expect(state.refresh).toHaveBeenCalledOnce();
    expect(state.messages.at(-1)).toContain("未紐付け: 5 → 0");
  });

  it("releases pending after an API error or exception", async () => {
    const api = harness(vi.fn(async () => Response.json({ error: "APIエラー" }, { status: 500 })) as typeof fetch);
    await expect(api.run()).resolves.toBe(false);
    expect(api.pending).toEqual([true, false]);
    expect(api.errors.at(-1)).toBe("APIエラー");
    const network = harness(vi.fn(async () => { throw new Error("通信失敗"); }) as typeof fetch);
    await expect(network.run()).resolves.toBe(false);
    expect(network.pending).toEqual([true, false]);
  });

  it("aborts on timeout and releases pending", async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })) as typeof fetch;
    const state = harness(fetcher, vi.fn(), 5);
    await expect(state.run()).resolves.toBe(false);
    expect(state.pending).toEqual([true, false]);
    expect(state.errors.at(-1)).toBe("再解析がタイムアウトしました。再度お試しください。");
  });

  it("blocks rapid duplicate client and server execution", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; })) as typeof fetch;
    const state = harness(fetcher);
    const first = state.run();
    await expect(state.run()).resolves.toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
    resolveFetch(Response.json(successResult));
    await first;

    let resolveTask!: (value: string) => void;
    const task = vi.fn(() => new Promise<string>((resolve) => { resolveTask = resolve; }));
    const serverFirst = runTownReparseExclusively("same", task);
    const serverSecond = runTownReparseExclusively("same", task);
    expect(task).toHaveBeenCalledOnce();
    expect(serverSecond).toBe(serverFirst);
    resolveTask("done");
    await expect(Promise.all([serverFirst, serverSecond])).resolves.toEqual(["done", "done"]);
  });
});
