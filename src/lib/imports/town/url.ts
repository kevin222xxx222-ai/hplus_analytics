import { TownPageType } from "@/generated/prisma/client";

export type ParsedTownUrl = {
  normalizedUrl: string;
  externalStoreId: string | null;
  externalCastId: string | null;
  pageType: TownPageType;
  valid: boolean;
};

export function parseTownUrl(raw: string): ParsedTownUrl {
  try {
    const url = new URL(raw.trim());
    const path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    const normalizedUrl = `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${path}`;
    const segments = path.split("/").filter(Boolean);
    const storeMatch = path.match(/^\/(?:shop|official)\/(\d+)(?:\/|$)/);
    const castMatch = path.match(/^\/(?:official\/)?gal\/(\d+)(?:\/|$)/);
    let pageType: TownPageType = TownPageType.OTHER;
    if (/^\/(?:shop|official)\/\d+$/.test(path)) pageType = TownPageType.STORE_TOP;
    else if (/^\/(?:shop|official)\/\d+\/schedule$/.test(path)) pageType = TownPageType.SCHEDULE;
    else if (/^\/(?:shop|official)\/\d+\/gals$/.test(path)) pageType = TownPageType.GIRL_LIST;
    else if (/^\/(?:shop|official)\/\d+\/diary$/.test(path)) pageType = TownPageType.SHOP_DIARY;
    else if (/^\/(?:official\/)?gal\/\d+$/.test(path)) pageType = TownPageType.CAST_PROFILE;
    else if (/^\/(?:official\/)?gal\/\d+\/diary$/.test(path)) pageType = TownPageType.CAST_DIARY;
    else if (/^\/(?:shop|official)\/\d+\/information$/.test(path)) pageType = TownPageType.EVENT;
    return {
      normalizedUrl,
      externalStoreId: storeMatch?.[1] || null,
      externalCastId: castMatch?.[1] || null,
      pageType,
      valid: ["http:", "https:"].includes(url.protocol) && url.hostname.toLowerCase() === "www.dto.jp" && segments.length > 0,
    };
  } catch {
    return { normalizedUrl: raw.trim(), externalStoreId: null, externalCastId: null, pageType: TownPageType.OTHER, valid: false };
  }
}
