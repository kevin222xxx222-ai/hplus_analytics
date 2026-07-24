import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsComparisonSwitch, AnalyticsFilterBar, AnalyticsHeader, AnalyticsPageLayout, AnalyticsTable, AnalyticsMetricGroup } from "@/components/analytics/shared";
import { AnalyticsFetchError, fetchAnalyticsJson, readAnalyticsFilters, writeAnalyticsFilters } from "@/lib/analytics/shared";

describe("analytics shared presentation infrastructure", () => {
  it("renders an accessible header and loading state", () => {
    const html = renderToStaticMarkup(createElement("div", null, createElement(AnalyticsHeader, { title: "Performance", loading: true, description: "説明" }), createElement(AnalyticsPageLayout, { title: "Performance", loading: true }, createElement("div", null, "content"))));
    expect(html).toContain("Performance");
    expect(html).toContain("aria-busy=\"true\"");
    expect(html).toContain("分析データを読み込み中");
  });

  it("keeps filter controls labelled and comparison options reusable", () => {
    const html = renderToStaticMarkup(createElement(AnalyticsFilterBar, { onSubmit: vi.fn() }, createElement(AnalyticsComparisonSwitch, { value: "previousWeek", options: [{ value: "previousWeek", label: "前週" }], onChange: vi.fn() })));
    expect(html).toContain("比較基準");
    expect(html).toContain("前週");
    expect(html).toContain("role=\"search\"");
  });

  it("renders table captions, headers and empty status without requiring a page-specific table", () => {
    const html = renderToStaticMarkup(createElement(AnalyticsTable, { caption: "Cast比較", columns: [{ key: "name", label: "キャスト" }], rows: [], renderCell: () => null }));
    expect(html).toContain("Cast比較");
    expect(html).toContain("キャスト");
    expect(html).toContain("表示できるデータがありません");
  });

  it("renders metric groups through the existing KPI primitive", () => {
    const html = renderToStaticMarkup(createElement(AnalyticsMetricGroup, { title: "Volume", metrics: [{ key: "sales", label: "売上", value: 0, hint: "実績" }] }));
    expect(html).toContain("Volume");
    expect(html).toContain("売上");
    expect(html).toContain(">0</p>");
  });

  it("normalizes non-2xx responses while preserving HTTP details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "unauthorized", code: "AUTH" }), { status: 401, headers: { "content-type": "application/json" } })));
    await expect(fetchAnalyticsJson("/api/analytics/performance")).rejects.toMatchObject({ status: 401, code: "AUTH" } satisfies Partial<AnalyticsFetchError>);
    vi.unstubAllGlobals();
  });

  it("passes abort signals to the shared fetch utility", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await fetchAnalyticsJson("/api/analytics/trend", controller.signal);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal, cache: "no-store" });
    vi.unstubAllGlobals();
  });

  it("round-trips supported filters through the URL without losing defaults", () => {
    const defaults = { from: "2026-06-01", to: "2026-06-30", store: "ALL", sort: "sales" };
    const query = writeAnalyticsFilters({ ...defaults, comparison: "previousWeek", castSearch: "あい" });
    const filters = readAnalyticsFilters(new URLSearchParams(query), defaults);
    expect(filters).toMatchObject({ from: defaults.from, to: defaults.to, store: "ALL", comparison: "previousWeek", castSearch: "あい", sort: "sales" });
  });
});
