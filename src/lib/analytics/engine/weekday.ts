import { aggregateVolume } from "./volume";
import { calculateEfficiency } from "./efficiency";
import { summarizeSample } from "./sample";
import { safeDivide } from "./efficiency";
import type { AnalyticsRow, MetricValue, WeekdayAnalysis, WeekdaySuitability } from "./types";

const LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const weekdayOf = (date: string | Date) => { const value = typeof date === "string" ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : date; return value.getUTCDay(); };

export function analyzeWeekdays(rows: AnalyticsRow[]): WeekdayAnalysis[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const selected = rows.filter((row) => weekdayOf(row.date) === weekday);
    const volume = aggregateVolume(selected)[0] ?? aggregateVolume([])[0];
    const efficiency = calculateEfficiency(volume);
    const sample = summarizeSample({ ...volume.sample, sampleKind: "attendanceDays" });
    return { weekday, label: LABELS[weekday], volume, efficiency, sample };
  });
}

export function analyzeCastWeekdays(rows: AnalyticsRow[], castId: string): WeekdayAnalysis[] {
  return analyzeWeekdays(rows.filter((row) => row.castId === castId));
}

export function weekdaySuitability(input: { weekday: number; confidence: WeekdayAnalysis["sample"]["confidence"]; value: MetricValue; personalAverage: MetricValue; storeAverage: MetricValue; rankAverage: MetricValue; reservationEfficiency: MetricValue; reservationBaseline: MetricValue }): WeekdaySuitability {
  if (input.confidence === "Insufficient" || input.value === null) return { status: "Data不足", weekday: input.weekday, confidence: input.confidence, personalDelta: null, storeDelta: null, rankDelta: null, evidence: ["対象曜日の母数が不足しています"] };
  const personalDelta = safeDivide(input.value - (input.personalAverage ?? input.value), Math.abs(input.personalAverage ?? 0));
  const storeDelta = safeDivide(input.value - (input.storeAverage ?? input.value), Math.abs(input.storeAverage ?? 0));
  const rankDelta = safeDivide(input.value - (input.rankAverage ?? input.value), Math.abs(input.rankAverage ?? 0));
  const evidence = [personalDelta !== null && personalDelta > 0 ? "本人平均を上回る" : "本人平均との差を確認", storeDelta !== null && storeDelta > 0 ? "店舗平均を上回る" : "店舗平均との差を確認", rankDelta !== null && rankDelta > 0 ? "ランク平均を上回る" : "ランク平均との差を確認"];
  if (input.reservationEfficiency !== null && input.reservationBaseline !== null && input.reservationEfficiency > input.reservationBaseline) evidence.push("予約効率が基準を上回る");
  return { status: evidence.some((item) => item.includes("上回る")) ? "Suitable" : "Neutral", weekday: input.weekday, confidence: input.confidence, personalDelta, storeDelta, rankDelta, evidence };
}
