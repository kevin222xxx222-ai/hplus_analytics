import { describe, expect, it } from "vitest";
import { ImportBatchStatus } from "@/generated/prisma/client";
import { heavenConfirmCompletionFields } from "./service";

describe("Heaven Confirm completion timestamp", () => {
  it.each([
    ["SHOP completed", 0, ImportBatchStatus.COMPLETED],
    ["CAST completed", 0, ImportBatchStatus.COMPLETED],
    ["completed with warnings", 1, ImportBatchStatus.COMPLETED_WITH_WARNINGS],
  ])("sets completedAt for %s", (_name, pending, status) => {
    const completedAt = new Date("2026-08-19T00:00:00.000Z");
    expect(heavenConfirmCompletionFields(pending, completedAt)).toEqual({ status, completedAt });
    expect(heavenConfirmCompletionFields(pending, completedAt).completedAt).toBeInstanceOf(Date);
  });

  it("does not use the success helper for failure statuses", () => {
    const result = heavenConfirmCompletionFields(0);
    expect(result.status).not.toBe(ImportBatchStatus.FAILED);
    expect(result.status).not.toBe(ImportBatchStatus.CANCELLED);
  });
});
