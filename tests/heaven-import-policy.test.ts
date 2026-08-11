import { describe, expect, it } from "vitest";
import { formatDateTimeJst } from "@/lib/date";
import { isSupportedHeavenStoreCode } from "@/lib/imports/heaven/service";

describe("Heaven import safety policy", () => {
  it("only permits the Kasukabe store", () => {
    expect(isSupportedHeavenStoreCode("KASUKABE")).toBe(true);
    expect(isSupportedHeavenStoreCode("KOSHIGAYA")).toBe(false);
    expect(isSupportedHeavenStoreCode("NODA")).toBe(false);
  });

  it("formats persisted UTC timestamps in JST without a hardcoded offset", () => {
    expect(formatDateTimeJst("2026-08-08T06:10:17.730Z")).toBe("2026/8/8 15:10:17");
    expect(formatDateTimeJst("2026-08-07T15:30:00.000Z")).toBe("2026/8/8 00:30:00");
    expect(formatDateTimeJst(null)).toBe("—");
  });
});
