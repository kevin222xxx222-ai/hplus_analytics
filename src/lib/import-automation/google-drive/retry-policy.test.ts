import { describe, expect, it } from "vitest";
import { MAX_RETRY_COUNT, retryDelayMinutes } from "./file-state-service";

describe("Drive retry policy", () => {
  it("uses the five-minute, fifteen-minute, hourly, and six-hour backoff", () => {
    expect([1, 2, 3, 4].map(retryDelayMinutes)).toEqual([5, 15, 60, 360]);
    expect(MAX_RETRY_COUNT).toBe(4);
  });

  it("stops scheduling after the final retry", () => {
    expect(retryDelayMinutes(5)).toBeNull();
    expect(retryDelayMinutes(0)).toBeNull();
  });
});
