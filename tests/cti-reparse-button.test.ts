import { describe, expect, it, vi } from "vitest";
import { executeCtiReparse } from "@/components/cti-reparse-button";
import { runCtiReparseExclusively } from "@/lib/imports/cti/reparse-service";

const successResult = {
  before: { pendingCount: 3, warningCount: 3, importableCount: 0 },
  after: { pendingCount: 0, warningCount: 0, importableCount: 3 },
};

function harness(fetcher: typeof fetch, refresh = vi.fn(), timeoutMs = 1_000) {
  const pending: boolean[] = [];
  const errors: string[] = [];
  const messages: string[] = [];
  const lock = { current: false };
  const run = () => executeCtiReparse({
    batchId: "batch", lock, fetcher, refresh, timeoutMs,
    setPending: (value) => pending.push(value),
    setError: (value) => errors.push(value),
    setMessage: (value) => messages.push(value),
  });
  return { run, lock, pending, errors, messages, refresh };
}

describe("CTI reparse button execution", () => {
  it("releases pending after success and refresh", async () => {
    const state = harness(vi.fn(async () => Response.json(successResult)) as typeof fetch);
    await expect(state.run()).resolves.toBe(true);
    expect(state.pending).toEqual([true, false]);
    expect(state.lock.current).toBe(false);
    expect(state.refresh).toHaveBeenCalledOnce();
    expect(state.messages.at(-1)).toContain("再解析完了");
  });

  it("releases pending after an API error", async () => {
    const state = harness(vi.fn(async () => Response.json({ error: "APIエラー" }, { status: 500 })) as typeof fetch);
    await expect(state.run()).resolves.toBe(false);
    expect(state.pending).toEqual([true, false]);
    expect(state.errors.at(-1)).toBe("APIエラー");
  });

  it("releases pending after a fetch exception", async () => {
    const state = harness(vi.fn(async () => { throw new Error("通信失敗"); }) as typeof fetch);
    await expect(state.run()).resolves.toBe(false);
    expect(state.pending).toEqual([true, false]);
    expect(state.errors.at(-1)).toBe("通信失敗");
  });

  it("aborts on timeout and releases pending", async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted"); error.name = "AbortError"; reject(error);
      });
    })) as typeof fetch;
    const state = harness(fetcher, vi.fn(), 5);
    await expect(state.run()).resolves.toBe(false);
    expect(state.pending).toEqual([true, false]);
    expect(state.errors.at(-1)).toBe("再解析がタイムアウトしました。再度お試しください。");
  });

  it("blocks a rapid second execution before React state is committed", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; })) as typeof fetch;
    const state = harness(fetcher);
    const first = state.run();
    await expect(state.run()).resolves.toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
    resolveFetch(Response.json(successResult));
    await expect(first).resolves.toBe(true);
    expect(state.pending).toEqual([true, false]);
  });

  it("deduplicates concurrent server work for the same batch", async () => {
    let resolveTask!: (value: string) => void;
    const task = vi.fn(() => new Promise<string>((resolve) => { resolveTask = resolve; }));
    const first = runCtiReparseExclusively("same-batch", task);
    const second = runCtiReparseExclusively("same-batch", task);
    expect(task).toHaveBeenCalledOnce();
    expect(second).toBe(first);
    resolveTask("done");
    await expect(Promise.all([first, second])).resolves.toEqual(["done", "done"]);
  });
});
