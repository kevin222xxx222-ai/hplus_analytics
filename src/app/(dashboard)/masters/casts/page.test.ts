import { describe, expect, it } from "vitest";
import { StoreCode } from "@/generated/prisma/client";
import { parseMastersCastsStore } from "./page";
describe("masters casts store filter", () => {
  it("accepts supported stores and falls back for invalid values", () => { expect(parseMastersCastsStore(StoreCode.KASUKABE)).toBe(StoreCode.KASUKABE); expect(parseMastersCastsStore("invalid")).toBeUndefined(); });
});
