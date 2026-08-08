import { describe, expect, it } from "vitest";
import { formatAvailability, priorityForCast } from "./cast-diagnosis-view-model";

describe("Cast diagnosis list presentation", () => {
  it("keeps zero distinct from missing and unavailable", () => {
    expect(formatAvailability(0, "ZERO", "件")).toBe("0件");
    expect(formatAvailability(null, "MISSING", "件")).toBe("—");
    expect(formatAvailability(null, "UNAVAILABLE", "件")).toBe("掲載対象外");
  });

  it("returns insufficient for an absent card instead of throwing", () => {
    expect(priorityForCast(undefined)).toBe("INSUFFICIENT");
  });
});
