import { getStoreAnalytics, type StoreAnalyticsResponseDto } from "./store-analytics";

type Metric = { value: number | null; availability: string };
type Legacy = StoreAnalyticsResponseDto;
type Fact = Legacy["dailyAnalysis"]["facts"][number];

const metric = (value: number | null, unavailable = false): Metric => unavailable ? { value: null, availability: "UNAVAILABLE" } : value === null ? { value: null, availability: "MISSING" } : { value, availability: value === 0 ? "ZERO" : "VALUE" };
const ratioMetric = (numerator: Metric, denominator: Metric): Metric => numerator.value === null || denominator.value === null ? metric(null) : denominator.value === 0 ? { value: null, availability: "UNCOMPUTABLE" } : metric(numerator.value / denominator.value);
const asMetricMap = (value: unknown) => value as Record<string, Metric>;
const sumMetric = (items: Metric[], unavailable = false): Metric => {
  if (unavailable) return metric(null, true);
  const values = items.map((item) => item.value).filter((item): item is number => item !== null && Number.isFinite(item));
  return values.length ? metric(values.reduce((sum, item) => sum + item, 0)) : metric(null);
};
const addMetricMaps = (maps: Record<string, Metric>[], attendanceSource?: Record<string, Metric>) => {
  const keys = [...new Set(maps.flatMap((map) => Object.keys(map)))];
  return Object.fromEntries(keys.map((key) => {
    if (["attendancePeople", "attendanceMinutes", "attendanceHours", "salesPerHour"].includes(key) && attendanceSource) return [key, attendanceSource[key] ?? metric(null, true)];
    const values = maps.map((map) => map[key]).filter((item): item is Metric => Boolean(item));
    return [key, sumMetric(values, values.length > 0 && values.every((item) => item.availability === "UNAVAILABLE"))];
  }));
};
export const withDerivedMetrics = (metrics: Record<string, Metric>, share?: Metric): Record<string, Metric> => {
  const complete: Record<string, Metric> = {
    ...metrics,
    sales: metrics.sales ?? metric(null),
    contracts: metrics.contracts ?? metric(null),
    reservations: metrics.reservations ?? metric(null),
    nominations: metrics.nominations ?? metric(null),
    averageRevenuePerContract: metrics.averageRevenuePerContract ?? metric(null),
    shareOfTotal: share ?? metrics.shareOfTotal ?? metric(null),
  };
  const derived = {
    ...complete,
    averageRevenuePerContract: ratioMetric(complete.sales, complete.contracts),
    reservationContractGap: complete.reservations.value === null || complete.contracts.value === null ? metric(null) : metric(complete.reservations.value - complete.contracts.value),
    reservationContractRate: complete.reservations.value === null || complete.reservations.value === 0 || complete.contracts.value === null ? metric(null) : metric(complete.contracts.value / complete.reservations.value),
    nominationRate: complete.contracts.value === null || complete.contracts.value === 0 || complete.nominations.value === null ? metric(null) : metric(complete.nominations.value / complete.contracts.value),
  };
  return { ...derived, contractCount: complete.contracts, reservationCount: complete.reservations, mainNominationCount: complete.nominations, mainNominationRate: derived.nominationRate, salesShare: complete.shareOfTotal };
};
export const buildStoreSalesBreakdown = (kasukabe: Metric, koshigaya: Metric, noda: Metric, total: Metric) => ({ kasukabe, koshigaya, noda, total });
export const salesAverageComparison = (dailySales: Metric, average: Metric, validDays: number) => {
  if (dailySales.value === null || average.value === null || average.value === 0 || validDays === 0) return { periodAverageDailySales: average, absoluteDifference: metric(null), differenceRate: metric(null), status: "UNAVAILABLE" as const, availability: "UNAVAILABLE" as const, label: "比較不可", tone: "unavailable" as const };
  const difference = dailySales.value - average.value;
  const rate = difference / Math.abs(average.value);
  const status = rate >= 0.05 ? "ABOVE" as const : rate <= -0.05 ? "BELOW" as const : "NEAR" as const;
  return { periodAverageDailySales: average, absoluteDifference: metric(difference), differenceRate: metric(rate), status, availability: "VALUE" as const, label: status === "ABOVE" ? "平均以上" : status === "BELOW" ? "平均以下" : "平均付近", tone: status === "ABOVE" ? "positive" as const : status === "BELOW" ? "negative" as const : "neutral" as const };
};
const compare = (current: Metric, baseline: Metric, period: { from: string; to: string }) => { const difference = current.value === null || baseline.value === null ? null : current.value - baseline.value; const differenceRate = current.value === null || baseline.value === null || baseline.value === 0 ? null : (current.value - baseline.value) / Math.abs(baseline.value); const state = comparisonState(difference, differenceRate); return { current, baseline, difference, differenceRate, ...state, period, availability: current.value === null ? current.availability : baseline.value === null ? baseline.availability : "VALUE" }; };
const scopeOf = (response: Legacy, code: string) => response.managementSummary.scopes.find((item) => item.store.code === code);
export const comparisonState = (difference: number | null, differenceRate: number | null) => {
  if (difference === null || differenceRate === null) return { state: "UNAVAILABLE" as const, stateLabel: "比較データなし" };
  if (Math.abs(differenceRate) < 0.01) return { state: "NEUTRAL" as const, stateLabel: "横ばい" };
  return difference > 0 ? { state: "POSITIVE" as const, stateLabel: "増加" } : { state: "NEGATIVE" as const, stateLabel: "減少" };
};

type WeeklyComparison = {
  current: Metric;
  baseline: Metric;
  absoluteDifference: Metric;
  relativeDifferenceRate: Metric;
  pointDifference: Metric;
  status: "ABOVE" | "NEAR" | "BELOW" | "UNAVAILABLE";
  label: string;
  tone: "positive" | "neutral" | "negative" | "unavailable";
  availability: string;
};

const weeklyCompare = (current: Metric, baseline: Metric, rate = false): WeeklyComparison => {
  if (current.value === null || baseline.value === null || baseline.value === 0) return { current, baseline, absoluteDifference: metric(null), relativeDifferenceRate: metric(null), pointDifference: metric(null), status: "UNAVAILABLE", label: "比較不可", tone: "unavailable", availability: current.value === null ? current.availability : baseline.availability };
  const difference = current.value - baseline.value;
  const relative = difference / Math.abs(baseline.value);
  const status = relative >= 0.05 ? "ABOVE" : relative <= -0.05 ? "BELOW" : "NEAR";
  return { current, baseline, absoluteDifference: metric(difference), relativeDifferenceRate: metric(relative), pointDifference: rate ? metric(difference) : metric(null), status, label: status === "ABOVE" ? "平均以上" : status === "BELOW" ? "平均以下" : "平均付近", tone: status === "ABOVE" ? "positive" : status === "BELOW" ? "negative" : "neutral", availability: "VALUE" };
};

const monday = (dateText: string) => {
  const date = new Date(`${dateText}T00:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
};
const addDays = (dateText: string, amount: number) => { const date = new Date(`${dateText}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
const sumWeekly = (values: Metric[]) => sumMetric(values);
const dayAverage = (total: Metric, days: number) => total.value === null || days === 0 ? metric(null) : metric(total.value / days);
const isValidDailyMetric = (item: Metric | undefined) => Boolean(item && (item.availability === "VALUE" || item.availability === "ZERO"));
const weekAverage = (total: Metric, count: number) => total.value === null || count === 0 ? metric(null) : metric(total.value / count);

/** Pure weekly aggregation used by the all-store adapter. Monday-Sunday is the only week boundary. */
export function buildWeeklyAnalysis(facts: Array<{ date: string; selected: Record<string, Metric>; town: { pv: Metric; uu: Metric }; heaven: { pageAccess: Metric }; storeDaily: Record<string, Record<string, Metric>> }>, from: string, to: string) {
  const grouped = new Map<string, typeof facts>();
  for (const fact of facts) grouped.set(monday(fact.date), [...(grouped.get(monday(fact.date)) ?? []), fact]);
  const weeks = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, values]) => {
    const weekEnd = addDays(weekStart, 6);
    const boundary = weekStart < from || weekEnd > to;
    const dates = new Set(values.map((item) => item.date));
    const missingMajor = values.some((item) => [item.selected.sales, item.selected.contracts, item.selected.reservations].some((m) => m.availability === "MISSING" || m.availability === "UNAVAILABLE"));
    const isComplete = !boundary && values.length === 7 && [...Array(7)].every((_, index) => dates.has(addDays(weekStart, index))) && !missingMajor;
    const partialReason = isComplete ? null : boundary ? "PERIOD_BOUNDARY" : missingMajor ? "MISSING_DATA" : "IN_PROGRESS";
    const metrics = {
      sales: sumWeekly(values.map((item) => item.selected.sales)), contracts: sumWeekly(values.map((item) => item.selected.contracts)), reservations: sumWeekly(values.map((item) => item.selected.reservations)), nominations: sumWeekly(values.map((item) => item.selected.nominations)), townPv: sumWeekly(values.map((item) => item.town.pv)), townUu: sumWeekly(values.map((item) => item.town.uu)), heavenAccess: sumWeekly(values.map((item) => item.heaven.pageAccess)),
    };
    const reservationContractRate = ratioMetric(metrics.contracts, metrics.reservations);
    const nominationRate = ratioMetric(metrics.nominations, metrics.contracts);
    const stores = Object.fromEntries(["KASUKABE", "KOSHIGAYA", "NODA"].map((code) => [code, { sales: sumWeekly(values.map((item) => item.storeDaily[code]?.sales ?? metric(null))) }]));
    const validity = { salesValidDayCount: values.filter((item) => isValidDailyMetric(item.selected.sales)).length, ctiValidDayCount: values.filter((item) => isValidDailyMetric(item.selected.sales) || isValidDailyMetric(item.selected.contracts) || isValidDailyMetric(item.selected.reservations)).length, townPvValidDayCount: values.filter((item) => isValidDailyMetric(item.town.pv)).length, townUuValidDayCount: values.filter((item) => isValidDailyMetric(item.town.uu)).length, heavenValidDayCount: values.filter((item) => isValidDailyMetric(item.heaven.pageAccess)).length };
    const townValidDayCount = Math.min(validity.townPvValidDayCount, validity.townUuValidDayCount);
    const dailyAverages = { sales: dayAverage(metrics.sales, validity.salesValidDayCount), contractCount: dayAverage(metrics.contracts, validity.ctiValidDayCount), reservationCount: dayAverage(metrics.reservations, validity.ctiValidDayCount), townPv: dayAverage(metrics.townPv, validity.townPvValidDayCount), townUu: dayAverage(metrics.townUu, validity.townUuValidDayCount), heavenPageAccess: dayAverage(metrics.heavenAccess, validity.heavenValidDayCount) };
    const validitySummary = { calendarDayCount: values.length, ...validity, townValidDayCount, label: `対象${values.length}日 / CTI取得${validity.ctiValidDayCount}日`, availability: validity.ctiValidDayCount > 0 ? "VALUE" : "MISSING" };
    return { weekStart, weekEnd, calendarDayCount: values.length, validDayCount: validity.ctiValidDayCount, days: values.length, isPartialWeek: !isComplete, isComplete, partialReason, metrics: { ...metrics, reservationContractRate, nominationRate }, overallMetrics: { sales: metrics.sales }, storeMetrics: stores, dailyAverages, validitySummary, townValidDayCount, ...validity };
  });
  const complete = weeks.filter((week) => week.isComplete);
  const total = (key: keyof typeof weeks[number]["metrics"]) => sumWeekly(complete.map((week) => week.metrics[key] as Metric));
  const summaryMetrics = { sales: total("sales"), contracts: total("contracts"), reservations: total("reservations"), nominations: total("nominations"), townPv: total("townPv"), townUu: total("townUu"), heavenAccess: total("heavenAccess") };
  const completeWeekSummary = { completeWeekCount: complete.length, metrics: { sales: weekAverage(summaryMetrics.sales, complete.length), contracts: weekAverage(summaryMetrics.contracts, complete.length), reservations: weekAverage(summaryMetrics.reservations, complete.length), nominations: weekAverage(summaryMetrics.nominations, complete.length), townPv: weekAverage(summaryMetrics.townPv, complete.length), townUu: weekAverage(summaryMetrics.townUu, complete.length), heavenAccess: weekAverage(summaryMetrics.heavenAccess, complete.length) }, reservationContractRate: ratioMetric(summaryMetrics.contracts, summaryMetrics.reservations), nominationRate: ratioMetric(summaryMetrics.nominations, summaryMetrics.contracts), storeMetrics: Object.fromEntries(["KASUKABE", "KOSHIGAYA", "NODA"].map((code) => { const values = complete.map((week) => week.storeMetrics[code].sales); const total = sumWeekly(values); return [code, { sales: weekAverage(total, complete.length) }]; })) };
  const withComparison = weeks.map((week) => ({ ...week, comparison: { sales: week.isComplete ? weeklyCompare(week.metrics.sales, completeWeekSummary.metrics.sales) : weeklyCompare(metric(null), completeWeekSummary.metrics.sales), contracts: week.isComplete ? weeklyCompare(week.metrics.contracts, completeWeekSummary.metrics.contracts) : weeklyCompare(metric(null), completeWeekSummary.metrics.contracts), reservations: week.isComplete ? weeklyCompare(week.metrics.reservations, completeWeekSummary.metrics.reservations) : weeklyCompare(metric(null), completeWeekSummary.metrics.reservations), reservationContractRate: week.isComplete ? weeklyCompare(week.metrics.reservationContractRate, completeWeekSummary.reservationContractRate, true) : weeklyCompare(metric(null), completeWeekSummary.reservationContractRate, true), nominationRate: week.isComplete ? weeklyCompare(week.metrics.nominationRate, completeWeekSummary.nominationRate, true) : weeklyCompare(metric(null), completeWeekSummary.nominationRate, true) } }));
  return { weeks: withComparison, completeWeekSummary };
}

export async function getAllStoreAnalytics(input: { from: string; to: string }) {
  const [spring, koshigaya, noda] = await Promise.all([
    getStoreAnalytics({ ...input, storeCode: "KASUKABE" }),
    getStoreAnalytics({ ...input, storeCode: "KOSHIGAYA" }),
    getStoreAnalytics({ ...input, storeCode: "NODA" }),
  ]);
  const responses = [spring, koshigaya, noda];
  const scopes = [scopeOf(spring, "KASUKABE"), scopeOf(koshigaya, "KOSHIGAYA"), scopeOf(noda, "NODA")].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const currentMaps = scopes.map((scope) => asMetricMap(scope.metrics));
  const totalMetrics = withDerivedMetrics(addMetricMaps(currentMaps, currentMaps[0]), metric(1));
  const previousMaps = scopes.map((scope) => asMetricMap(Object.fromEntries(Object.entries(scope.comparison).map(([key, value]) => [key, value.baseline]))));
  const previousMetrics = withDerivedMetrics(addMetricMaps(previousMaps, previousMaps[0]), metric(1));
  const period = { from: spring.meta.from, to: spring.meta.to };
  const totalComparison = Object.fromEntries(["sales", "contracts", "reservations", "reservationContractRate", "nominations", "nominationRate", "averageRevenuePerContract", "shareOfTotal"].map((key) => [key, compare(totalMetrics[key], previousMetrics[key], period)]));
  const scopeRows = scopes.map((scope) => { const metrics = withDerivedMetrics(asMetricMap(scope.metrics), scope.shareOfTotal); const baseline = withDerivedMetrics(Object.fromEntries(Object.entries(scope.comparison).map(([key, value]) => [key, value.baseline]))); const previousSales = previousMetrics.sales; const previousScopeSales = baseline.sales; baseline.shareOfTotal = ratioMetric(previousScopeSales, previousSales); return { ...scope, metrics, comparison: Object.fromEntries(["sales", "contracts", "reservations", "reservationContractRate", "nominations", "nominationRate", "averageRevenuePerContract", "shareOfTotal"].map((key) => [key, compare(metrics[key], baseline[key], period)])) }; });

  const facts: Fact[] = spring.dailyAnalysis.facts.map((springFact, index) => {
    const selectedByStore = responses.map((response) => response.dailyAnalysis.facts[index]?.selected).filter(Boolean) as Record<string, Metric>[];
    const selected = addMetricMaps(selectedByStore, asMetricMap(selectedByStore[0]));
    const koshFact = koshigaya.dailyAnalysis.facts[index];
    const gap = selected.reservations.value === null || selected.contracts.value === null ? metric(null) : metric(selected.reservations.value - selected.contracts.value);
    const contractRate = selected.reservations.value === null || selected.reservations.value === 0 || selected.contracts.value === null ? metric(null) : metric(selected.contracts.value / selected.reservations.value);
    const nominationRate = selected.contracts.value === null || selected.contracts.value === 0 || selected.nominations.value === null ? metric(null) : metric(selected.nominations.value / selected.contracts.value);
    const storeDaily = Object.fromEntries(responses.map((response, responseIndex) => [scopes[responseIndex]?.store.code, response.dailyAnalysis.facts[index]?.selected ?? {}]));
    const town = { pv: sumMetric([springFact.town.pv, koshFact?.town.pv].filter(Boolean)), uu: sumMetric([springFact.town.uu, koshFact?.town.uu].filter(Boolean)) };
    const storeSalesBreakdown = buildStoreSalesBreakdown((storeDaily.KASUKABE as Record<string, Metric> | undefined)?.sales ?? metric(null), (storeDaily.KOSHIGAYA as Record<string, Metric> | undefined)?.sales ?? metric(null), (storeDaily.NODA as Record<string, Metric> | undefined)?.sales ?? metric(null), selected.sales);
    const weekdayLabel = ({ 日: "日曜日", 月: "月曜日", 火: "火曜日", 水: "水曜日", 木: "木曜日", 金: "金曜日", 土: "土曜日" } as Record<string, string>)[springFact.weekday] ?? springFact.weekday;
    return { ...springFact, selected, total: selected, reservationContractGap: gap, reservationContractRate: contractRate, mainNominationRate: nominationRate, storeDaily, town, heaven: springFact.heaven, stores: [], dailyFactDto: { businessDate: springFact.date, weekday: weekdayLabel, sales: selected.sales, contractCount: selected.contracts, reservationCount: selected.reservations, reservationContractRate: contractRate, mainNominationCount: selected.nominations, mainNominationRate: nominationRate, townPv: town.pv, townUu: town.uu, heavenPageAccess: springFact.heaven.pageAccess, kasukabeAttendanceCount: selected.attendancePeople, kasukabeAttendanceHours: selected.attendanceHours, storeSalesBreakdown, availability: { sales: selected.sales.availability, contracts: selected.contracts.availability, reservations: selected.reservations.availability, townPv: town.pv.availability, townUu: town.uu.availability, heavenPageAccess: springFact.heaven.pageAccess.availability, attendance: selected.attendanceHours.availability } } } as unknown as Fact;
  });
  const validSales = facts.map((fact) => fact.selected.sales).filter((item) => item.value !== null).map((item) => item.value as number);
  const periodAverageDailySales = validSales.length ? metric(validSales.reduce((sum, item) => sum + item, 0) / validSales.length) : metric(null);
  const enrichedFacts = facts.map((fact) => {
    const tone = fact.weekday === "土" ? "saturday" : fact.weekday === "日" ? "sunday" : "weekday";
    const dailyFactDto = (fact as Fact & { dailyFactDto: Record<string, unknown> }).dailyFactDto;
    return { ...fact, dailyFactDto: { ...dailyFactDto, periodAverageDailySales, salesComparison: salesAverageComparison(fact.selected.sales, periodAverageDailySales, validSales.length), weekdayTone: tone, storeSalesBreakdownTone: { kasukabe: "green", koshigaya: "blue", noda: "slate" } } } as Fact;
  });
  const weekly = buildWeeklyAnalysis(enrichedFacts.map((fact) => ({ date: fact.date, selected: fact.selected, town: fact.town, heaven: fact.heaven, storeDaily: (fact as Fact & { storeDaily: Record<string, Record<string, Metric>> }).storeDaily })), spring.meta.from, spring.meta.to);
  const weeklyAnalysis = weekly.weeks;
  const base = spring as Legacy;
  const totalSalesState = comparisonState(totalComparison.sales.difference, totalComparison.sales.differenceRate);
  return { ...base, meta: { ...base.meta, selectedStore: "ALL" }, managementSummary: { total: { store: { code: "ALL", shortName: "管轄全体" }, metrics: totalMetrics, comparison: totalComparison }, scopes: scopeRows }, businessImpact: { totalSalesDifference: totalComparison.sales.difference, totalSalesDifferenceRate: totalComparison.sales.differenceRate, totalSalesState: totalSalesState.state, totalSalesStateLabel: totalSalesState.stateLabel, totalSalesShare: totalMetrics.shareOfTotal, byStore: scopeRows.map((scope) => { const state = comparisonState(scope.comparison.sales.difference, scope.comparison.sales.differenceRate); return { store: scope.store, difference: scope.comparison.sales.difference, differenceRate: scope.comparison.sales.differenceRate, state: state.state, stateLabel: state.stateLabel, shareOfTotal: scope.shareOfTotal }; }) }, dailyAnalysis: { ...base.dailyAnalysis, facts: enrichedFacts }, weeklyAnalysis, weeklySummary: weekly.completeWeekSummary, revenueStructure: { ...base.revenueStructure, revenueResult: { ...base.revenueStructure.revenueResult, sales: totalMetrics.sales, contracts: totalMetrics.contracts, averageRevenuePerContract: totalMetrics.averageRevenuePerContract, castReward: totalMetrics.castReward, profit: totalMetrics.profit }, serviceFlow: { ...base.revenueStructure.serviceFlow, reservations: totalMetrics.reservations, contracts: totalMetrics.contracts, reservationContractGap: totalMetrics.reservationContractGap, reservationContractRate: totalMetrics.reservationContractRate }, nominationType: { ...base.revenueStructure.nominationType, nominations: totalMetrics.nominations, nominationRate: totalMetrics.nominationRate } } };
}
