import { describe, expect, it } from "vitest";
import { ImportBatchStatus, ImportDataType } from "@/generated/prisma/client";
import { canResolveTownRow } from "@/lib/imports/town/resolution-policy";
import type { TownCastPreviewRow } from "@/lib/imports/town/types";

const row: TownCastPreviewRow = {
  kind: "CAST", rowKey: "CAST:5", sourceRowNumber: 5, date: "2026-07-13", originalCastName: "未紐付け", normalizedCastName: "未紐付け",
  castId: null, castDisplayName: null, resolutionStatus: "UNMATCHED", isListed: true, pv: 1, uu: 1, averagePv: 1, sourceAveragePv: 1,
  telTapUu: 0, conversionRate: 0, sourceConversionRate: 0, issues: [{ code: "UNMATCHED_CAST", level: "WARNING", message: "未紐付け" }],
};

describe("Town resolution UI policy", () => {
  it("shows for COMPLETED_WITH_WARNINGS with an OPEN unmatched error", () => expect(canResolveTownRow(ImportDataType.TOWN_CAST, ImportBatchStatus.COMPLETED_WITH_WARNINGS, row, new Set([5]))).toBe(true));
  it("shows for COMPLETED with an OPEN unmatched error", () => expect(canResolveTownRow(ImportDataType.TOWN_CAST, ImportBatchStatus.COMPLETED, row, new Set([5]))).toBe(true));
  it("hides for COMPLETED when no unmatched error remains", () => expect(canResolveTownRow(ImportDataType.TOWN_CAST, ImportBatchStatus.COMPLETED, row, new Set())).toBe(false));
  it("applies to URL/LP but never TOWN_STORE", () => {
    expect(canResolveTownRow(ImportDataType.TOWN_URL, ImportBatchStatus.COMPLETED_WITH_WARNINGS, { ...row, kind: "URL", rowKey: "URL:5", url: "https://example.test", normalizedUrl: "https://example.test", externalStoreId: null, externalCastId: null, sourceCastName: "未紐付け", pageType: "OTHER" }, new Set([5]))).toBe(true);
    expect(canResolveTownRow(ImportDataType.TOWN_STORE, ImportBatchStatus.COMPLETED_WITH_WARNINGS, row, new Set([5]))).toBe(false);
  });
});
