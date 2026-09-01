import { describe, expect, it } from "vitest";
import { J4_INVENTORY, summarizeJ4Inventory } from "./j4-legacy-inventory";
describe("J4 inventory", () => {
  it("classifies legacy fields deterministically", () => { const a = summarizeJ4Inventory(); const b = summarizeJ4Inventory(); expect(a).toEqual(b); expect(a.totalReferences).toBe(J4_INVENTORY.length); });
  it("does not mark primaryStore as membership truth", () => expect(J4_INVENTORY.filter((r) => r.field === "primaryStoreId").every((r) => r.classification === "COMPATIBILITY_ONLY")).toBe(true));
});
