import { describe, expect, it } from "vitest";
import { CTI_COLUMN_CATALOG } from "@/lib/imports/cti/column-catalog";

describe("CTI 74-column catalog", () => {
  it("defines all operational columns exactly once with fixed classifications", () => {
    expect(CTI_COLUMN_CATALOG).toHaveLength(74);
    expect(new Set(CTI_COLUMN_CATALOG.map((column) => column.internalName)).size).toBe(74);
    expect(CTI_COLUMN_CATALOG.filter((column) => column.classification === "ADOPTED")).toHaveLength(17);
    expect(CTI_COLUMN_CATALOG.filter((column) => column.classification === "FUTURE_CANDIDATE")).toHaveLength(56);
    expect(CTI_COLUMN_CATALOG.filter((column) => column.classification === "INTENTIONALLY_UNUSED")).toHaveLength(1);
  });

  it("allows negatives only for money columns", () => {
    expect(CTI_COLUMN_CATALOG.filter((column) => column.negativeAllowed).every((column) => column.dataType === "MONEY")).toBe(true);
    expect(CTI_COLUMN_CATALOG.filter((column) => column.dataType === "INTEGER_COUNT" || column.dataType === "DECIMAL_HOURS").every((column) => !column.negativeAllowed)).toBe(true);
  });
});
