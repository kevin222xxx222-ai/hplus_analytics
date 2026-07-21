import { describe, expect, it } from "vitest";
import { resolveTownPreviewRow, type TownResolverAlias, type TownResolverCast } from "@/lib/imports/town/resolver";
import type { TownCastPreviewRow } from "@/lib/imports/town/types";

const date = new Date("2026-07-13T00:00:00Z");
const row: TownCastPreviewRow = {
  kind: "CAST", rowKey: "CAST:5", sourceRowNumber: 5, date: "2026-07-13",
  originalCastName: "てすと", normalizedCastName: "てすと", castId: null, castDisplayName: null,
  resolutionStatus: "UNMATCHED", isListed: true, pv: 1, uu: 1, averagePv: 1, sourceAveragePv: 1,
  telTapUu: 0, conversionRate: 0, sourceConversionRate: 0, issues: [],
};
function cast(id: string, displayName = "てすと", from = "2026-01-01", to: string | null = null): TownResolverCast {
  return { id, displayName, startedOn: new Date(`${from}T00:00:00Z`), endedOn: to ? new Date(`${to}T00:00:00Z`) : null };
}
function alias(target: TownResolverCast, overrides: Partial<TownResolverAlias> = {}): TownResolverAlias {
  return { aliasName: "てすと", normalizedAlias: "てすと", storeId: "store-k", validFrom: null, validTo: null, cast: target, ...overrides };
}

describe("Town cast resolver", () => {
  it("uses exact TOWN alias for the selected store", () => {
    const target = cast("one");
    expect(resolveTownPreviewRow(row, "store-k", date, [alias(target)], [target])).toMatchObject({ castId: "one", resolutionStatus: "EXACT_ALIAS" });
  });
  it("ignores aliases belonging to another store", () => {
    const target = cast("one");
    expect(resolveTownPreviewRow(row, "store-k", date, [alias(target, { storeId: "store-other" })], [])).toMatchObject({ castId: null, resolutionStatus: "UNMATCHED" });
  });
  it("honors validity periods and detects name reuse ambiguity", () => {
    const old = cast("old", "てすと", "2025-01-01", "2026-06-30");
    const current = cast("new", "てすと", "2026-07-01");
    expect(resolveTownPreviewRow(row, "store-k", date, [alias(old), alias(current, { validFrom: new Date("2026-07-01T00:00:00Z") })], [old, current]).castId).toBe("new");
    const another = cast("another");
    expect(resolveTownPreviewRow(row, "store-k", date, [], [current, another]).resolutionStatus).toBe("AMBIGUOUS");
  });
});

