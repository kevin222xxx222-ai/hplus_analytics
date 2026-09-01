import { describe, expect, it } from "vitest";
import { classifyHistoricalResult, readiness } from "./j3-historical-coverage";
const d = new Date("2026-08-01");
describe("J3 historical coverage", () => {
  it("uses three-valued membership semantics", () => { expect(classifyHistoricalResult([{ storeId: "s", status: "ACTIVE", joinedAt: new Date("2026-07-01"), leftAt: null }], "s", d).result).toBe("MEMBER"); expect(classifyHistoricalResult([{ storeId: "s", status: "LEFT", joinedAt: new Date("2026-06-01"), leftAt: new Date("2026-07-01") }], "s", d).result).toBe("NOT_MEMBER"); expect(classifyHistoricalResult([{ storeId: "s", status: "ACTIVE", joinedAt: null, leftAt: null }], "s", d).result).toBe("UNKNOWN"); });
  it("does not infer readiness from dates", () => expect(readiness(0.5)).toBe("NOT_READY"));
});
