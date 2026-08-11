import { describe, expect, it } from "vitest";
import { toPublicCastActionPlan } from "./engine";
import type { CastActionPlan } from "./types";

describe("public action plan boundary", () => {
  it("does not expose the internal audit bridge", () => {
    const plan = { auditCandidate: { internal: true }, actionType: "MAINTAIN_CURRENT" } as unknown as CastActionPlan;
    const publicPlan = toPublicCastActionPlan(plan);
    expect("auditCandidate" in publicPlan).toBe(false);
    expect(JSON.stringify(publicPlan)).not.toContain("auditCandidate");
  });
});
