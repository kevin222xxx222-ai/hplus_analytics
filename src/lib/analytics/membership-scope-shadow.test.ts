import { describe, expect, it } from "vitest";
import { buildCurrentScopeShadow } from "./membership-scope-shadow";
const stores = [{ id: "kas", name: "春日部", shortName: "春日部" }, { id: "kos", name: "越谷", shortName: "越谷" }];
const cast = (overrides: Record<string, unknown> = {}) => ({ id: "c1", displayName: "A", status: "ACTIVE", endedOn: null, primaryStoreId: "kas", memberships: [], ...overrides }) as never;
describe("analytics current scope shadow", () => {
  it("compares legacy and membership per store", () => { const rows = buildCurrentScopeShadow([cast({ memberships: [{ storeId: "kas", status: "ACTIVE" }] })], stores); expect(rows.find((row) => row.storeId === "kas")?.differenceType).toBe("MATCH_INCLUDED"); expect(rows.find((row) => row.storeId === "kos")?.differenceType).toBe("MATCH_EXCLUDED"); });
  it("includes ON_LEAVE as current membership", () => { const rows = buildCurrentScopeShadow([cast({ primaryStoreId: "kas", memberships: [{ storeId: "kos", status: "ON_LEAVE" }] })], stores); expect(rows.find((row) => row.storeId === "kos")?.membershipIncluded).toBe(true); expect(rows.find((row) => row.storeId === "kos")?.differenceType).toBe("MEMBERSHIP_ONLY"); });
});
