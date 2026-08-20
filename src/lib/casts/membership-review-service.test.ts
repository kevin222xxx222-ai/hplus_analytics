import { describe, expect, it } from "vitest";
import { reviewClassificationLabel, reviewStatusLabel } from "./membership-review-service";
import { CastStatus } from "@/generated/prisma/client";

describe("membership review presentation", () => {
  it("provides stable labels for review classifications", () => {
    expect(reviewClassificationLabel("MULTI_STORE_EVIDENCE")).toBe("複数店舗根拠");
    expect(reviewClassificationLabel("EXISTING_MEMBERSHIP")).toBe("対応済み");
    expect(reviewClassificationLabel("UNKNOWN")).toBe("UNKNOWN");
  });

  it("maps cast lifecycle status for the review queue", () => {
    expect(reviewStatusLabel(CastStatus.ACTIVE)).toBe("在籍");
    expect(reviewStatusLabel(CastStatus.INACTIVE)).toBe("退店");
  });
});
