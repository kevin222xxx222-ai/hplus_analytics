import { describe, expect, it } from "vitest";
import { StoreCode } from "@/generated/prisma/client";
import { resolvePreviewRow, type ResolverAlias, type ResolverCast } from "@/lib/imports/cti/resolver";
import type { CtiPreviewRow } from "@/lib/imports/cti/types";

const date = new Date("2026-07-14T00:00:00Z");
const baseRow: CtiPreviewRow = { rowKey: "K:1", storeCode: StoreCode.KASUKABE, storeId: "store-k", sourceSheetName: "sheet", sourceRowNumber: 1, originalCastName: "あい", normalizedCastName: "あい", castId: null, castDisplayName: null, resolutionStatus: "UNMATCHED", exclusionReason: null, metrics: null, issues: [] };

function cast(id: string, name = "あい", from = "2026-01-01", to: string | null = null): ResolverCast {
  return { id, displayName: name, startedOn: new Date(`${from}T00:00:00Z`), endedOn: to ? new Date(`${to}T00:00:00Z`) : null };
}

function alias(target: ResolverCast, overrides: Partial<ResolverAlias> = {}): ResolverAlias {
  return { aliasName: "あい", normalizedAlias: "あい", storeId: "store-k", validFrom: null, validTo: null, cast: target, ...overrides };
}

describe("CTI cast resolver", () => {
  it("prioritizes exact store alias", () => {
    const target = cast("new");
    expect(resolvePreviewRow(baseRow, date, [alias(target)], [target]).castId).toBe("new");
  });

  it("honors cast and alias validity periods for reused names", () => {
    const old = cast("old", "あい", "2025-01-01", "2026-06-30");
    const current = cast("new", "あい", "2026-07-01");
    expect(resolvePreviewRow(baseRow, date, [alias(old), alias(current, { validFrom: new Date("2026-07-01T00:00:00Z") })], [old, current]).castId).toBe("new");
  });

  it("does not auto-link ambiguous active candidates", () => {
    const one = cast("one"); const two = cast("two");
    const result = resolvePreviewRow(baseRow, date, [alias(one), alias(two)], [one, two]);
    expect(result.resolutionStatus).toBe("AMBIGUOUS");
    expect(result.castId).toBeNull();
  });

  it("does not treat hiragana and katakana as the same", () => {
    const katakana = cast("katakana", "アイ");
    expect(resolvePreviewRow(baseRow, date, [], [katakana]).resolutionStatus).toBe("UNMATCHED");
  });
});
