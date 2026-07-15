import { describe, expect, it } from "vitest";
import { getExclusionReason } from "@/lib/imports/cti/exclusions";
import { normalizeCastName } from "@/lib/normalize";
import { parseDurationMinutes, parseInteger } from "@/lib/imports/cti/values";

describe("CTI value conversion", () => {
  it("normalizes Unicode and spaces without kana conversion", () => {
    expect(normalizeCastName("  ｱｲ　 花  ")).toBe("アイ花");
    expect(normalizeCastName("あい")).not.toBe(normalizeCastName("アイ"));
  });

  it("parses integer amounts and rejects invalid blanks", () => {
    expect(parseInteger("￥12,345円")).toBe(12345);
    expect(parseInteger("-500")).toBe(-500);
    expect(parseInteger("—")).toBeNull();
    expect(parseInteger("abc")).toBeNull();
  });

  it("converts time formats to minutes", () => {
    expect(parseDurationMinutes("8:30")).toBe(510);
    expect(parseDurationMinutes("8時間30分")).toBe(510);
    expect(parseDurationMinutes(0.5, "h:mm")).toBe(720);
    expect(parseDurationMinutes(0.5)).toBe(30);
    expect(parseDurationMinutes(8.5)).toBe(510);
  });

  it("excludes only coded special/total/header rows", () => {
    expect(getExclusionReason("　本日の周知＆引継ぎ事項(春日部店) ")).toBe("ANNOUNCEMENT_ROW");
    expect(getExclusionReason("合計")).toBe("TOTAL_ROW");
    expect(getExclusionReason("女子名")).toBe("REPEATED_HEADER");
    expect(getExclusionReason("あい")).toBeNull();
  });
});
