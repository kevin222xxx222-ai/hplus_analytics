import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "./security";

function request(origin: string | null, url = "http://internal:3000/api/imports/town/upload") {
  return new Request(url, origin ? { headers: { origin } } : undefined);
}

describe("assertSameOrigin", () => {
  it("accepts the configured public origin", () => expect(() => assertSameOrigin(request("https://analytics.womansgroup.link"), { APP_ORIGIN: "https://analytics.womansgroup.link" })).not.toThrow());
  it("normalizes a trailing slash in APP_ORIGIN", () => expect(() => assertSameOrigin(request("https://analytics.womansgroup.link"), { APP_ORIGIN: "https://analytics.womansgroup.link/" })).not.toThrow());
  it.each(["https://evil.example", "http://analytics.womansgroup.link", "https://analytics.womansgroup.link:444", "https://analytics.womansgroup.link.evil.example"]) ("rejects origin %s", (origin) => expect(() => assertSameOrigin(request(origin), { APP_ORIGIN: "https://analytics.womansgroup.link" })).toThrow("Invalid request origin"));
  it("uses the request URL origin when APP_ORIGIN is unset", () => expect(() => assertSameOrigin(request("http://internal:3000"), {})).not.toThrow());
  it("keeps the no-Origin-header policy", () => expect(() => assertSameOrigin(request(null), { APP_ORIGIN: "https://analytics.womansgroup.link" })).not.toThrow());
  it("rejects an invalid configured APP_ORIGIN", () => expect(() => assertSameOrigin(request(null), { APP_ORIGIN: "not-a-url" })).toThrow("APP_ORIGIN"));
});
