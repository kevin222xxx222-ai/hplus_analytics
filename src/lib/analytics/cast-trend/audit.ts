import type { CastDiagnosisEngineResult, CastEngineCast, CastMetric } from "@/lib/analytics/cast-diagnosis/types";
import type { Availability } from "@/lib/analytics/engine/types";

export type TrendMonthStatus = "COMPLETE" | "PARTIAL";
export type TrendMetricKey = keyof CastEngineCast["fact"];

export const TREND_METRICS: Array<{ key: TrendMetricKey; label: string; group: "RESULT" | "MEDIA" | "NOMINATION" }> = [
  { key: "femaleReward", label: "女子報酬", group: "RESULT" },
  { key: "hourlyReward", label: "平均時給", group: "RESULT" },
  { key: "contracts", label: "成約数", group: "RESULT" },
  { key: "attendanceDays", label: "出勤日数", group: "RESULT" },
  { key: "workingHours", label: "稼働時間", group: "RESULT" },
  { key: "contractsPerDay", label: "1日平均成約", group: "RESULT" },
  { key: "contractsPerHour", label: "1時間あたり成約", group: "RESULT" },
  { key: "townPv", label: "Town PV", group: "MEDIA" },
  { key: "townUu", label: "Town UU", group: "MEDIA" },
  { key: "heavenPageAccess", label: "Heavenアクセス", group: "MEDIA" },
  { key: "heavenDiaryPosts", label: "Heaven写メ日記", group: "MEDIA" },
  { key: "photoNominations", label: "写真指名数", group: "NOMINATION" },
  { key: "photoNominationShare", label: "写真指名率（構成比）", group: "NOMINATION" },
  { key: "photoNominationsPerHour", label: "1時間あたり写真指名", group: "NOMINATION" },
  { key: "photoNominationsPer100Uu", label: "100UUあたり写真指名", group: "NOMINATION" },
  { key: "mainNominations", label: "本指名数", group: "NOMINATION" },
  { key: "mainNominationRate", label: "本指名率", group: "NOMINATION" },
  { key: "repeatCount", label: "リピート数", group: "NOMINATION" },
  { key: "repeatShare", label: "リピート構成比", group: "NOMINATION" },
];

export type MonthlyAvailabilitySummary = {
  VALUE: number;
  ZERO: number;
  MISSING: number;
  UNAVAILABLE: number;
  total: number;
};

export type CastMonthlyAudit = {
  castId: string;
  castName: string;
  month: string;
  status: TrendMonthStatus;
  startedOn: string | null;
  endedOn: string | null;
  metrics: Record<string, CastMetric>;
};

export type AliasAudit = { castId: string | null; aliasCount: number; unresolvedCount: number; aliases: string[]; validRangeIssues: number };
export type MergeAudit = { mergedCastCount: number; sourceIds: string[]; targetIds: string[]; overlapRiskCount: number };

const metric = (cast: CastEngineCast | undefined, key: TrendMetricKey): CastMetric => {
  const value = cast?.fact[key];
  if (value && typeof value === "object" && "availability" in value) return value as CastMetric;
  return { value: null, availability: "MISSING" as Availability };
};

export const monthStarts = (from: string, to: string) => {
  const start = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  const result: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) result.push(cursor.toISOString().slice(0, 7));
  return result;
};

export const monthStatus = (month: string, asOf = new Date()): TrendMonthStatus => {
  const nextMonth = new Date(`${month}-01T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return nextMonth.getTime() <= asOf.getTime() ? "COMPLETE" : "PARTIAL";
};

export const summarizeAvailability = (audits: CastMonthlyAudit[], key: TrendMetricKey): MonthlyAvailabilitySummary => {
  const summary: MonthlyAvailabilitySummary = { VALUE: 0, ZERO: 0, MISSING: 0, UNAVAILABLE: 0, total: audits.length };
  for (const audit of audits) {
    const availability = audit.metrics[key]?.availability;
    if (availability === "VALUE" || availability === "ZERO" || availability === "MISSING" || availability === "UNAVAILABLE") summary[availability]++;
    else summary.MISSING++;
  }
  return summary;
};

export const buildMonthlyAudits = (input: {
  months: Array<{ month: string; result: CastDiagnosisEngineResult }>;
  casts: Array<{ id: string; displayName: string; startedOn: string | null; endedOn: string | null }>;
  asOf?: Date;
}): CastMonthlyAudit[] => {
  const byId = new Map(input.casts.map((cast) => [cast.id, cast]));
  return input.months.flatMap(({ month, result }) => {
    const resultById = new Map(result.casts.map((cast) => [cast.fact.castId, cast]));
    return input.casts.map((cast) => {
      const engineCast = resultById.get(cast.id);
      return {
        castId: cast.id,
        castName: engineCast?.fact.castName ?? cast.displayName,
        month,
        status: monthStatus(month, input.asOf),
        startedOn: cast.startedOn,
        endedOn: cast.endedOn,
        metrics: Object.fromEntries(TREND_METRICS.map(({ key }) => [key, metric(engineCast, key)])),
      };
    });
  }).filter((audit) => byId.has(audit.castId));
};

export const auditAliasRows = (rows: Array<{ castId: string | null; aliasName: string; reviewStatus: string; validFrom: string | null; validTo: string | null }>): AliasAudit[] => {
  const groups = new Map<string, AliasAudit>();
  for (const row of rows) {
    const key = row.castId ?? "UNRESOLVED";
    const group = groups.get(key) ?? { castId: row.castId, aliasCount: 0, unresolvedCount: 0, aliases: [], validRangeIssues: 0 };
    group.aliasCount++;
    if (!row.castId || row.reviewStatus !== "MAPPED") group.unresolvedCount++;
    group.aliases.push(row.aliasName);
    if (row.validFrom && row.validTo && row.validFrom > row.validTo) group.validRangeIssues++;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (a.castId ?? "").localeCompare(b.castId ?? ""));
};

export const auditTrendCapabilities = () => ({
  available: ["前月比", "3か月平均", "6か月平均", "最高値", "最低値", "最高時給更新", "過去最高報酬", "月順位", "上昇率"],
  unavailable: [{ name: "前年同月比", reason: "2025年の確定済み同一定義データを今回の監査範囲で確認してから実装する必要があります。" }],
  judgments: ["上昇", "横ばい", "下降", "変動大", "データ不足"],
});
