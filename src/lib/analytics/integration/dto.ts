import type { Availability, Comparison, EfficiencySummary, GrowthResult, NextBestAction, SampleSummary, TrendResult, VolumeSummary, WeekdayAnalysis } from "@/lib/analytics/engine";
import type { AnalyticsInputDto } from "./adapter";

const serialise = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type GrowthDto = { classification: GrowthResult["classification"]; availability: Availability; reason: string | null; evidence: string[]; score: number };
export type NextBestActionDto = { level: NextBestAction["recommendationLevel"]; actionLevel: NextBestAction["recommendationLevel"]; cause: string; evidence: string[]; action: string | null; reason?: string; confidence: NextBestAction["confidence"]; availability: Availability; status: NextBestAction["status"] };
export type RankDto = { availability: "UNAVAILABLE"; reason: string };
export type ComparisonDto = { availability: Availability; currentAvailability: Availability; baselineAvailability: Availability; current: number | null; baseline: number | null; difference: number | null; differenceRate: number | null; baselineKind: Comparison["baselineKind"]; period: { from: string; to: string }; direction?: "increase" | "decrease" | "flat" | "unavailable"; sample?: SampleSummary; confidence?: SampleSummary["confidence"]; reason?: string };
export type AnalyticsSummaryDto = { volume: VolumeSummary; efficiency: EfficiencySummary; sample: SampleSummary; trend?: TrendResult; growth?: GrowthDto; nextBestAction?: NextBestActionDto; rank?: RankDto; comparison?: ComparisonDto[] };
export type StoreSummaryDto = { store: { id: string; code: string; name: string; shortName: string }; summary: AnalyticsSummaryDto };

export function toSummaryDto(input: { volume: VolumeSummary; efficiency: EfficiencySummary; sample: SampleSummary; trend?: TrendResult; growth?: GrowthResult; nextBestAction?: NextBestAction }): AnalyticsSummaryDto {
  const growth = input.growth
    ? {
        classification: input.growth.classification,
        availability: input.growth.classification === "Data不足" ? "INSUFFICIENT_SAMPLE" as const : input.growth.missingMetrics?.length ? "MISSING" as const : "VALUE" as const,
        reason: input.growth.missingMetrics?.length ? `不足指標: ${input.growth.missingMetrics.join(", ")}` : null,
        evidence: input.growth.evidence,
        score: input.growth.score,
      }
    : undefined;
  const action = input.nextBestAction
    ? {
        level: input.nextBestAction.recommendationLevel,
        actionLevel: input.nextBestAction.recommendationLevel,
        cause: input.nextBestAction.cause,
        evidence: input.nextBestAction.evidence,
        action: input.nextBestAction.action,
        reason: input.nextBestAction.action ? undefined : input.nextBestAction.cause,
        confidence: input.nextBestAction.confidence,
        availability: input.nextBestAction.status === "DataInsufficient" ? "INSUFFICIENT_SAMPLE" as const : "VALUE" as const,
        status: input.nextBestAction.status,
      }
    : undefined;
  return serialise({ volume: input.volume, efficiency: input.efficiency, sample: input.sample, trend: input.trend, growth, nextBestAction: action });
}

export function toComparisonDto(comparison: Comparison, period: { from: string; to: string }, sample?: SampleSummary, direction?: ComparisonDto["direction"]): ComparisonDto {
  return { availability: comparison.availability, currentAvailability: comparison.currentAvailability, baselineAvailability: comparison.baselineAvailability, current: comparison.current, baseline: comparison.baseline, difference: comparison.delta, differenceRate: comparison.changeRate, baselineKind: comparison.baselineKind, period, direction, sample, confidence: sample?.confidence, reason: comparison.reason };
}

export function toPerformanceDto(input: AnalyticsInputDto, summaries: Array<{ castId: string; summary: AnalyticsSummaryDto }>, overall?: AnalyticsSummaryDto, storeSummaries: StoreSummaryDto[] = []) {
  return serialise({ period: { from: input.from, to: input.to }, stores: input.stores, storeSummaries, overall, casts: summaries.map((item) => ({ cast: input.casts.find((cast) => cast.id === item.castId) ?? null, ...item })) });
}

export function toTrendDto(input: AnalyticsInputDto, summary: AnalyticsSummaryDto, daily: Array<{ date: string; volume: VolumeSummary; efficiency: EfficiencySummary }>, comparison?: ComparisonDto, storeSummaries: StoreSummaryDto[] = [], comparisons: ComparisonDto[] = []) {
  return serialise({ period: { from: input.from, to: input.to }, stores: input.stores, storeSummaries, overall: summary, summary, comparison, comparisons, daily });
}

export function toTimeDto(input: AnalyticsInputDto, weekdays: WeekdayAnalysis[], overall?: AnalyticsSummaryDto, storeSummaries: StoreSummaryDto[] = [], comparison?: ComparisonDto) { return serialise({ period: { from: input.from, to: input.to }, stores: input.stores, storeSummaries, overall, comparison, weekdays }); }
