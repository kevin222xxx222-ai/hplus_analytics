import { describe, expect, it } from "vitest";
import { analyzeDiaryWeekdays, safeDiaryRatio, summarizeDiary } from "./diary-engine";
import type { DiaryInputRow } from "./diary-types";

let rowSequence = 0;
const row = (overrides: Partial<DiaryInputRow> = {}): DiaryInputRow => ({ date: "2026-06-01", storeId: "store", castId: "cast", naturalKey: `k-${rowSequence++}`, townDiaryPv: 10, townDiaryUu: 5, ctiDiaryPostCount: 2, heavenDiaryPostCount: 1, sales: 100, reservations: 2, workHours: 2, ...overrides });
describe("Diary Engine", () => {
  it("集計と自然キー重複除外を行う", () => { const a = row({ naturalKey: "same" }); const b = row({ naturalKey: "same" }); expect(summarizeDiary([a, b]).townDiaryPv.value).toBe(10); });
  it("分母0をUNCOMPUTABLEにする", () => { expect(safeDiaryRatio({ value: 10, availability: "VALUE" }, { value: 0, availability: "ZERO" }).availability).toBe("UNCOMPUTABLE"); });
  it("欠測をMISSINGにする", () => { expect(summarizeDiary([row({ townDiaryPv: null })]).townDiaryPv.availability).toBe("MISSING"); });
  it("曜日分析で原因候補と信頼度を返す", () => { const result = analyzeDiaryWeekdays([row({ date: "2026-06-01" }), row({ date: "2026-06-08" })]); expect(result).toHaveLength(7); expect(result[1].primaryCause).toBeDefined(); });
  it("原因候補に優先度と改善アクションを含める", () => { const result = analyzeDiaryWeekdays(Array.from({ length: 14 }, (_, index) => row({ date: `2026-06-${String(index + 1).padStart(2, "0")}`, townStoreUu: index % 2 ? 10 : 100, sales: index % 2 ? 10 : 1000 }))); const monday = result[1]; expect(monday.causeCandidates[0]).toHaveProperty("score"); expect(monday.recommendedActions).toBeDefined(); });
});
