import { describe, expect, it } from "vitest";
import { parseTownUrl } from "@/lib/imports/town/url";

describe("Town URL parser", () => {
  it.each([
    ["https://www.dto.jp/shop/16829", "STORE_TOP"],
    ["https://www.dto.jp/official/16829/schedule", "SCHEDULE"],
    ["https://www.dto.jp/shop/16829/gals", "GIRL_LIST"],
    ["https://www.dto.jp/shop/16829/diary", "SHOP_DIARY"],
    ["https://www.dto.jp/gal/1234567", "CAST_PROFILE"],
    ["https://www.dto.jp/official/gal/1234567/diary", "CAST_DIARY"],
    ["https://www.dto.jp/shop/16829/information", "EVENT"],
    ["https://www.dto.jp/gal/1234567/video", "OTHER"],
  ])("classifies %s", (url, pageType) => expect(parseTownUrl(url).pageType).toBe(pageType));

  it("removes query and fragment and extracts external ids", () => {
    expect(parseTownUrl("https://www.dto.jp/shop/16829/?a=1#x")).toMatchObject({ normalizedUrl: "https://www.dto.jp/shop/16829", externalStoreId: "16829" });
    expect(parseTownUrl("https://www.dto.jp/gal/7654321/diary")).toMatchObject({ externalCastId: "7654321" });
  });

  it("keeps unknown URLs importable as OTHER", () => expect(parseTownUrl("not-a-url")).toMatchObject({ valid: false, pageType: "OTHER" }));
});

