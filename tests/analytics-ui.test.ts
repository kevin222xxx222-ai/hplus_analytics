import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalyticsKpiCard, AvailabilityBadge, ConfidenceBadge, GrowthPotentialCard, NextBestActionCard, TrendIndicator } from "@/components/analytics";
import { formatCurrency, formatDecimal, formatHours, formatPercent, formatMetric } from "@/lib/analytics/ui";

describe("Analytics UI formatters", () => {
  it("keeps zero distinct and never renders invalid numbers", () => {
    expect(formatCurrency(0)).toBe("¥0");
    expect(formatPercent(0)).toBe("0%");
    expect(formatDecimal(null)).toBe("—");
    expect(formatHours(undefined)).toBe("—");
    expect(formatCurrency(Number.NaN)).toBe("—");
    expect(formatMetric(Number.POSITIVE_INFINITY, "integer")).toBe("—");
  });
});

describe("Analytics UI states", () => {
  it("renders all availability states and distinguishes ZERO from MISSING", () => {
    const states = ["VALUE", "ZERO", "MISSING", "UNCOMPUTABLE", "UNAVAILABLE", "INSUFFICIENT_SAMPLE"];
    const html = renderToStaticMarkup(createElement("div", null, states.map((value) => createElement(AvailabilityBadge, { key: value, value: value as never }))));
    expect(html).toContain("実績0");
    expect(html).toContain("データ未取得");
    expect(html).toContain("母数不足");
  });

  it("renders confidence, trend semantics, and KPI sample context accessibly", () => {
    const html = renderToStaticMarkup(createElement("div", null, createElement(ConfidenceBadge, { value: "Low" }), createElement(TrendIndicator, { direction: "INCREASE", rate: 10, positiveIsBetter: false }), createElement(AnalyticsKpiCard, { label: "売上", value: 0, format: "currency", availability: "ZERO", confidence: "Low", sample: "3日" })));
    expect(html).toContain("参考値");
    expect(html).toContain("増加（注意）");
    expect(html).toContain("母数: 3日");
    expect(html).toContain("aria-label");
  });

  it("keeps Growth and Cause → Evidence → Action order", () => {
    const growth = renderToStaticMarkup(createElement(GrowthPotentialCard, { classification: "Capacity上限", evidence: ["稼働が高い"] }));
    const action = renderToStaticMarkup(createElement(NextBestActionCard, { result: { actionLevel: "ACTION", cause: "原因", evidence: ["根拠"], action: "提案", confidence: "High", availability: "VALUE" } }));
    expect(growth).toContain("Capacity上限");
    expect(action.indexOf("原因")).toBeLessThan(action.indexOf("根拠"));
    expect(action.indexOf("根拠")).toBeLessThan(action.indexOf("提案"));
  });
});
