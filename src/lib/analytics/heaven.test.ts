import { describe, expect, it } from "vitest";
import { aggregateHeavenMetric, percentChange } from "./heaven";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
describe("Heaven analytics aggregation", () => {
  it("sums daily events and ignores non-values", () => {
    const result = aggregateHeavenMetric([
      { businessDate: day("2026-06-01"), metricKey: "page_access", rawValue: 3, deltaValue: null, valueKind: "DAILY_EVENT", rawValueStatus: "VALUE" },
      { businessDate: day("2026-06-02"), metricKey: "page_access", rawValue: 4, deltaValue: null, valueKind: "DAILY_EVENT", rawValueStatus: "VALUE" },
      { businessDate: day("2026-06-03"), metricKey: "page_access", rawValue: null, deltaValue: null, valueKind: "DAILY_EVENT", rawValueStatus: "NOT_APPLICABLE" },
    ]);
    expect(result.periodValue).toBe(7); expect(result.daily).toHaveLength(2);
  });
  it("uses first/last and delta sum for snapshots", () => {
    const result = aggregateHeavenMetric([
      { businessDate: day("2026-06-01"), metricKey: "my_girl", rawValue: 10, deltaValue: null, valueKind: "SNAPSHOT", rawValueStatus: "VALUE" },
      { businessDate: day("2026-06-02"), metricKey: "my_girl", rawValue: 13, deltaValue: 3, valueKind: "SNAPSHOT", rawValueStatus: "VALUE" },
    ]);
    expect(result.periodValue).toBe(13); expect(result.change).toBe(3); expect(result.deltaSum).toBe(3);
  });
  it("returns null percent change when denominator is zero", () => { expect(percentChange(3, 0)).toBeNull(); });
});
