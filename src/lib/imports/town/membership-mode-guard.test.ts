import { describe, expect, it } from "vitest";
import { effectiveTownCastMode } from "./resolver";
describe("Town CAST dataset semantics guard", () => {
  it("falls back to legacy for historical datasets", () => { expect(effectiveTownCastMode("membership", "historical")).toMatchObject({ mode: "legacy", membershipEligible: false }); });
  it("allows membership mode only for current datasets", () => { expect(effectiveTownCastMode("membership", "current")).toMatchObject({ mode: "membership", membershipEligible: true }); });
});
