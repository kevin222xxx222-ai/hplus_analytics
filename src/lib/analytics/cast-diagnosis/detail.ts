import { prisma } from "@/lib/prisma";
import { getCastDiagnosis } from "./service";
import type { CastEngineCast } from "./types";
import { formatCastMetricValue } from "@/lib/analytics/ui/cast-diagnosis-view-model";
import { buildCastActionPlan, toPublicCastActionPlan } from "@/lib/analytics/cast-action";
import type { CastActionPlan } from "@/lib/analytics/cast-action/types";
import { getCastTrend } from "@/lib/analytics/cast-trend/service";
import { buildPublicCastTrendSummary, type PublicCastTrendSummary } from "@/lib/analytics/cast-trend/summary";

const iso = (date: Date) => date.toISOString().slice(0, 10);
type Availability = "VALUE" | "ZERO" | "MISSING" | "UNCOMPUTABLE" | "UNAVAILABLE" | "INSUFFICIENT_SAMPLE";
type Metric = { value: number | null; availability: Availability };
const metric = (value: number | null, availability?: Availability): Metric => ({ value, availability: availability ?? (value === null ? "MISSING" : value === 0 ? "ZERO" : "VALUE") });
const ratio = (numerator: Metric, denominator: Metric): Metric => numerator.value === null || denominator.value === null ? metric(null, numerator.availability === "UNAVAILABLE" || denominator.availability === "UNAVAILABLE" ? "UNAVAILABLE" : "UNCOMPUTABLE") : denominator.value === 0 ? metric(null, "UNCOMPUTABLE") : metric(numerator.value / denominator.value);
const sum = (values: number[]): Metric => values.length ? metric(values.reduce((total, value) => total + value, 0)) : metric(null, "MISSING");
const mediaMetric = (values: Array<number | null>, unavailable = false): Metric => { const valid = values.filter((value): value is number => value !== null); if (!valid.length) return metric(null, unavailable ? "UNAVAILABLE" : "MISSING"); return metric(valid.reduce((total, value) => total + value, 0)); };

export type CastCumulativePerformance = {
  period: { from: string | null; to: string; label: string };
  coverage: { ctiFrom: string | null; ctiTo: string | null; townFrom: string | null; townTo: string | null; heavenFrom: string | null; heavenTo: string | null };
  attendanceDays: Metric; workingHours: Metric; reservations: Metric; contracts: Metric; cancelCount: Metric;
  mainNominations: Metric; photoNominations: Metric; freeCount: Metric; newCount: Metric; repeatCount: Metric;
  femaleReward: Metric; chargeAmount: Metric; profit: Metric; paidOptionCount: Metric;
  townPv: Metric; townUu: Metric; heavenPageAccess: Metric; heavenDiaryPosts: Metric;
  hourlyReward: Metric; contractsPerDay: Metric; contractsPerHour: Metric; mainNominationRate: Metric;
  photoNominationShare: Metric; repeatShare: Metric; photoNominationsPer100Uu: Metric;
};
export type CastMedianEvidence = {
  metricKey: string; metricLabel: string; unit: string; medianMetric: Metric;
  calculation: { validPeerCount: number; method: "ODD_CENTER" | "EVEN_CENTER_AVERAGE" | "UNAVAILABLE"; centerIndexes: number[]; centerValues: number[]; formulaLabel: string };
  peers: Array<{ castId: string; castName: string; storeLabels: string[]; metric: Metric; workingHours: Metric; sortedPosition: number; isCenterValue: boolean }>;
  comparisonSource: { method: string; selfExcluded: boolean; totalTopGroupCount: number; validPeerCount: number; workingHoursRange: { minimum: number; maximum: number } | null; fallbackReason: string | null };
};
export type PublicCastActionPlan = Omit<CastActionPlan, "auditCandidate">;

function buildMedianEvidence(current: CastEngineCast): CastMedianEvidence[] {
  const keys: Array<[keyof CastEngineCast["fact"], string, string]> = [["hourlyReward", "平均時給", "円/時間"], ["townUu", "Town UU", "人"], ["photoNominationsPer100Uu", "100UUあたり写真指名", "件"], ["mainNominationRate", "本指名率", "%"]];
  return keys.map(([key, label, unit]) => {
    const comparison = current.comparisons.find((item) => item.metricKey === String(key));
    const centerPositions = comparison?.medianEvidence?.centerPositions ?? [];
    const centerValues = comparison?.medianEvidence?.centerValues ?? [];
    const display = (value: number) => formatCastMetricValue(String(key), key === "mainNominationRate" ? value * 100 : value, unit);
    return { metricKey: String(key), metricLabel: label, unit, medianMetric: comparison?.peerMedianMetric ?? metric(null, "INSUFFICIENT_SAMPLE"), calculation: { validPeerCount: comparison?.validPeerCount ?? 0, method: !comparison?.medianEvidence ? "UNAVAILABLE" : comparison.medianEvidence.method, centerIndexes: centerPositions.map((position) => position - 1), centerValues, formulaLabel: !comparison?.medianEvidence ? "有効な比較対象がありません" : comparison.medianEvidence.method === "EVEN_CENTER_AVERAGE" ? `${display(centerValues[0])}と${display(centerValues[1])}の平均` : `${display(centerValues[0])}（中央位置）` }, peers: (comparison?.peerEvidence ?? []).map((peer) => ({ castId: peer.castId, castName: peer.castName, storeLabels: peer.storeLabels, metric: peer.metric as Metric, workingHours: peer.workingHours as Metric, sortedPosition: peer.sortedPosition, isCenterValue: peer.isMedianPosition })), comparisonSource: { method: comparison?.peerSelectionMethod ?? "INSUFFICIENT", selfExcluded: true, totalTopGroupCount: comparison?.candidateCount ?? 0, validPeerCount: comparison?.validPeerCount ?? 0, workingHoursRange: comparison?.workingHoursRange ?? null, fallbackReason: comparison?.fallbackReason ?? null } };
  });
}

async function getCumulativePerformance(castId: string, toText: string): Promise<CastCumulativePerformance> {
  const today = new Date();
  const requestedTo = new Date(`${toText}T23:59:59.999Z`);
  const effectiveTo = requestedTo > today ? today : requestedTo;
  const to = iso(effectiveTo);
  const confirmed = { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] as ("COMPLETED" | "COMPLETED_WITH_WARNINGS")[] } };
  const [first, cti, town, heaven, listing] = await Promise.all([
    prisma.ctiCastDaily.findFirst({ where: { castId, businessDate: { lte: effectiveTo }, importBatch: confirmed }, orderBy: { businessDate: "asc" }, select: { businessDate: true } }),
    prisma.ctiCastDaily.findMany({ where: { castId, businessDate: { lte: effectiveTo }, importBatch: confirmed, cast: { mergedIntoCastId: null } }, select: { businessDate: true, attendanceCount: true, attendanceMinutes: true, reservationCount: true, contractCount: true, cancellationCount: true, regularNominationCount: true, photoNominationCount: true, freeCount: true, newCount: true, repeatCount: true, castRewardAmount: true, salesAmount: true, ctiProfitAmount: true, paidOptionCount: true } }),
    prisma.townCastDaily.findMany({ where: { castId, date: { lte: effectiveTo }, importBatch: confirmed, cast: { mergedIntoCastId: null } }, select: { date: true, pv: true, uu: true } }),
    prisma.heavenCastDaily.findMany({ where: { castId, businessDate: { lte: effectiveTo }, metricKey: { in: ["page_access", "diary_posts"] }, importBatch: confirmed, cast: { mergedIntoCastId: null } }, select: { businessDate: true, metricKey: true, rawValue: true, rawValueStatus: true } }),
    prisma.mediaListing.findMany({ where: { castId, mediaType: "HEAVEN", isListed: true }, select: { listedFrom: true, listedTo: true } }),
  ]);
  const from = first ? iso(first.businessDate) : null;
  const ctiValues = <K extends keyof typeof cti[number]>(key: K) => cti.map((row) => Number(row[key]));
  const attendanceDates = new Set(cti.filter((row) => row.attendanceCount > 0).map((row) => iso(row.businessDate)));
  const attendanceDays = metric(attendanceDates.size);
  const workingHours = metric(cti.reduce((total, row) => total + row.attendanceMinutes, 0) / 60);
  const reservations = sum(ctiValues("reservationCount")); const contracts = sum(ctiValues("contractCount")); const cancelCount = sum(ctiValues("cancellationCount"));
  const mainNominations = sum(ctiValues("regularNominationCount")); const photoNominations = sum(ctiValues("photoNominationCount")); const freeCount = sum(ctiValues("freeCount"));
  const newCount = mediaMetric(cti.map((row) => row.newCount)); const repeatCount = mediaMetric(cti.map((row) => row.repeatCount));
  const femaleReward = sum(ctiValues("castRewardAmount")); const chargeAmount = sum(ctiValues("salesAmount")); const profit = sum(ctiValues("ctiProfitAmount")); const paidOptionCount = sum(ctiValues("paidOptionCount"));
  const townPv = mediaMetric(town.map((row) => row.pv)); const townUu = mediaMetric(town.map((row) => row.uu));
  const heavenPageRows = heaven.filter((row) => row.metricKey === "page_access"); const heavenDiaryRows = heaven.filter((row) => row.metricKey === "diary_posts");
  const heavenPageAccess = mediaMetric(heavenPageRows.map((row) => row.rawValue !== null && row.rawValueStatus === "VALUE" ? Number(row.rawValue) : null), listing.length === 0);
  const heavenDiaryPosts = mediaMetric(heavenDiaryRows.map((row) => row.rawValue !== null && row.rawValueStatus === "VALUE" ? Number(row.rawValue) : null), listing.length === 0);
  return { period: { from, to, label: `${from ?? "初回実績日不明"}〜${to}` }, coverage: { ctiFrom: from, ctiTo: cti.length ? iso(cti.at(-1)!.businessDate) : null, townFrom: town.length ? iso(town.at(-1)!.date) : null, townTo: town.length ? iso(town[0].date) : null, heavenFrom: heaven.length ? iso(heaven.at(-1)!.businessDate) : null, heavenTo: heaven.length ? iso(heaven[0].businessDate) : null }, attendanceDays, workingHours, reservations, contracts, cancelCount, mainNominations, photoNominations, freeCount, newCount, repeatCount, femaleReward, chargeAmount, profit, paidOptionCount, townPv, townUu, heavenPageAccess, heavenDiaryPosts, hourlyReward: ratio(femaleReward, workingHours), contractsPerDay: ratio(contracts, attendanceDays), contractsPerHour: ratio(contracts, workingHours), mainNominationRate: ratio(mainNominations, contracts), photoNominationShare: ratio(photoNominations, contracts), repeatShare: ratio(repeatCount, contracts), photoNominationsPer100Uu: ratio(photoNominations, townUu).value === null ? metric(null, "UNCOMPUTABLE") : metric((photoNominations.value! / townUu.value!) * 100) };
}

export function previousMonthRange(fromText: string) {
  const from = new Date(`${fromText}T00:00:00Z`);
  const previousTo = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 0));
  const previousFrom = new Date(Date.UTC(previousTo.getUTCFullYear(), previousTo.getUTCMonth(), 1));
  return { from: iso(previousFrom), to: iso(previousTo) };
}

export async function getCastDiagnosisDetail(input: { castId: string; from: string; to: string }) {
  const cast = await prisma.cast.findUnique({
    where: { id: input.castId },
    select: {
      id: true, displayName: true, startedOn: true, endedOn: true, status: true,
      mergedIntoCastId: true, mergedAt: true,
      primaryStore: { select: { id: true, shortName: true } },
    },
  });
  if (!cast) return null;
  const selectedDate = new Date(`${input.to}T00:00:00Z`);
  const trendFrom = new Date(Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth() - 5, 1)).toISOString().slice(0, 10);
  const [currentResult, previousRange, lastAttendance, cumulativePerformance, trend] = await Promise.all([
    getCastDiagnosis({ from: input.from, to: input.to }),
    Promise.resolve(previousMonthRange(input.from)),
    prisma.ctiCastDaily.findFirst({ where: { castId: input.castId, businessDate: { gte: new Date(`${input.from}T00:00:00Z`), lte: new Date(`${input.to}T23:59:59.999Z`) }, importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, orderBy: { businessDate: "desc" }, select: { businessDate: true } }),
    getCumulativePerformance(input.castId, input.to),
    getCastTrend({ castId: input.castId, from: trendFrom, to: input.to, includeDiagnosis: false, includeAction: false }),
  ]);
  const current = currentResult.casts.find((item) => item.fact.castId === input.castId) ?? null;
  let actionPlan: PublicCastActionPlan | null = null;
  if (current) {
    try {
      const generated = buildCastActionPlan({ cast: current, period: { from: currentResult.period.from, to: currentResult.period.to } });
      actionPlan = toPublicCastActionPlan(generated);
    } catch {
      actionPlan = null;
    }
  }
  const referenceReason = (primaryType: string) => primaryType === "LOW_PAGE_TRAFFIC" ? "Town UUが高く、媒体流入の参考になるキャスト" : primaryType === "LOW_PROFILE_CONVERSION" ? "100UUあたり写真指名が高く、プロフィール転換の参考になるキャスト" : primaryType === "LOW_REPEAT_CONVERSION" ? "本指名率が高く、新規接客後の再来状況の参考になるキャスト" : primaryType === "OTHER_REVIEW" ? "平均時給と本指名率が高い安定キャスト" : "同じ安定高効率型の参考キャスト";
  const referenceCasts = currentResult.casts.filter((item) => item.fact.castId !== input.castId && item.isMainAttendanceCast && item.isTopGroupMember && item.diagnosis.primaryType === "STABLE_HIGH_EFFICIENCY" && ["HIGH", "MEDIUM"].includes(item.confidence.overall.level)).sort((a, b) => (b.fact.hourlyReward.value ?? -Infinity) - (a.fact.hourlyReward.value ?? -Infinity) || a.fact.castId.localeCompare(b.fact.castId)).slice(0, 3).map((item) => ({ castId: item.fact.castId, castName: item.fact.castName, storeLabels: item.fact.storeLabels, hourlyReward: item.fact.hourlyReward, femaleReward: item.fact.femaleReward, townUu: item.fact.townUu, photoNominations: item.fact.photoNominations, photoNominationsPer100Uu: item.fact.photoNominationsPer100Uu, mainNominations: item.fact.mainNominations, mainNominationRate: item.fact.mainNominationRate, reason: referenceReason(current?.diagnosis.primaryType ?? "STABLE_HIGH_EFFICIENCY") }));
  const previousResult = await getCastDiagnosis(previousRange);
  const previous = previousResult.casts.find((item) => item.fact.castId === input.castId)?.fact ?? null;
  const peer = current?.peerSelection;
  const trendSummary: PublicCastTrendSummary | null = trend ? buildPublicCastTrendSummary({ trend, actionType: actionPlan?.actionType ?? null, castId: input.castId }) : null;
  return {
    period: { from: currentResult.period.from, to: currentResult.period.to, label: currentResult.period.label, previousFrom: previousRange.from, previousTo: previousRange.to },
    cast: {
      castId: cast.id, castName: cast.displayName,
      currentStoreIds: current?.fact.storeIds ?? (cast.primaryStore ? [cast.primaryStore.id] : []),
      currentStoreLabels: current?.fact.storeLabels ?? (cast.primaryStore ? [cast.primaryStore.shortName] : []),
      activeFrom: cast.startedOn ? iso(cast.startedOn) : null, activeTo: cast.endedOn ? iso(cast.endedOn) : null,
      lastAttendanceDate: lastAttendance ? iso(lastAttendance.businessDate) : null,
      isMerged: Boolean(cast.mergedIntoCastId), mergedIntoCastId: cast.mergedIntoCastId,
    },
    current,
    previousPeriod: { fact: previous, comparisons: [], availability: previous ? "VALUE" : "MISSING" },
    peerContext: {
      scope: "MANAGED_ALL", method: peer?.method ?? "INSUFFICIENT", peerCount: current?.comparisonSource.peerCount ?? 0,
      totalTopGroupCount: peer?.totalTopGroupCount ?? 0, similarWorkloadCount: peer?.similarWorkloadCount ?? 0,
      workingHoursRange: peer?.workingHoursRange ?? null, selfExcluded: true, fallbackReason: peer?.fallbackReason ?? null,
      medianSourceLabel: current?.comparisonSource.medianSourceLabel ?? "比較群なし",
    },
    sections: current?.diagnosis.steps ?? null,
    actionPlan,
    thresholds: currentResult.thresholds,
    dataNotes: currentResult.dataNotes,
    medianEvidence: current ? buildMedianEvidence(current) : [],
    referenceCasts,
    cumulativePerformance,
    trendSummary,
  };
}

export type CastDiagnosisDetail = Awaited<ReturnType<typeof getCastDiagnosisDetail>>;
