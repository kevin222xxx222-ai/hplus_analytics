import { contractBreakdownState, getStoreAnalytics } from "./store-analytics";
import { getAllStoreAnalytics } from "./store-analytics-all";
import { prisma } from "@/lib/prisma";

export type StoreDayDetailDto = Awaited<ReturnType<typeof getStoreDayDetail>>;

const ratio = (value: number | null, denominator: number | null) => value === null || denominator === null || denominator === 0 ? null : value / denominator;

export async function getStoreDayDetail(input: { date: string; storeCode: "ALL" | "KASUKABE" | "KOSHIGAYA" | "NODA" }) {
  const data = input.storeCode === "ALL"
    ? await getAllStoreAnalytics({ from: input.date, to: input.date })
    : await getStoreAnalytics({ from: input.date, to: input.date, storeCode: input.storeCode });
  const fact = data.dailyAnalysis.facts[0];
  if (!fact) return { businessDate: input.date, available: false as const, reason: "この日の実績データはまだ取り込まれていません。" };
  const storeFacts: Array<{ storeCode: string; fact: typeof fact }> = input.storeCode === "ALL"
    ? (await Promise.all((["KASUKABE", "KOSHIGAYA", "NODA"] as const).map(async (storeCode) => ({ storeCode, fact: (await getStoreAnalytics({ from: input.date, to: input.date, storeCode })).dailyAnalysis.facts[0] })))).filter((item): item is { storeCode: "KASUKABE" | "KOSHIGAYA" | "NODA"; fact: typeof fact } => Boolean(item.fact))
    : [{ storeCode: input.storeCode, fact }];
  const selected = fact.selected;
  const heavenDiaryRows = input.storeCode === "KOSHIGAYA" || input.storeCode === "NODA" ? [] : await prisma.heavenCastDaily.findMany({ where: { businessDate: new Date(`${input.date}T00:00:00Z`), store: { code: "KASUKABE" }, castId: { not: null }, cast: { mergedIntoCastId: null }, metricKey: "diary_posts", importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, select: { castId: true, rawValue: true, rawValueStatus: true } });
  const day = new Date(`${input.date}T00:00:00Z`);
  const heavenListings = input.storeCode === "KOSHIGAYA" || input.storeCode === "NODA" ? [] : await prisma.mediaListing.findMany({ where: { mediaType: "HEAVEN", store: { code: "KASUKABE" }, isListed: true, cast: { mergedIntoCastId: null }, AND: [{ OR: [{ listedFrom: null }, { listedFrom: { lte: day } }] }, { OR: [{ listedTo: null }, { listedTo: { gte: day } }] }] }, select: { castId: true } });
  const heavenListedCastIds = new Set(heavenListings.map((item) => item.castId));
  const casts = fact.activeCastIds.map((castId, index) => {
    const metrics = fact.castFacts[castId];
    const sales = metrics?.sales ?? { value: null, availability: "MISSING" };
    const reward = metrics?.castReward ?? { value: null, availability: "MISSING" };
    const contracts = metrics?.contracts ?? { value: null, availability: "MISSING" };
    const nominations = metrics?.nominations ?? { value: null, availability: "MISSING" };
    const hours = metrics?.attendanceHours ?? { value: null, availability: "MISSING" };
    const nominationRate = ratio(nominations.value, contracts.value);
    const heavenRows = heavenDiaryRows.filter((row) => row.castId === castId);
    const heavenDiaryValue = heavenRows.filter((row) => row.rawValueStatus === "VALUE" && row.rawValue !== null).reduce((total, row) => total + Number(row.rawValue), 0);
    const diaryAvailability = heavenRows.some((row) => row.rawValueStatus === "VALUE") ? (heavenDiaryValue === 0 ? "ZERO" : "VALUE") : heavenListedCastIds.has(castId) ? "MISSING" : "UNAVAILABLE";
    const heavenDiary = { value: heavenRows.some((row) => row.rawValueStatus === "VALUE") ? heavenDiaryValue : null, availability: diaryAvailability };
    return { castId, name: fact.activeCastNames[index] ?? "不明", storeCode: input.storeCode, sales, reward, contracts, nominations, nominationRate: { value: nominationRate, availability: nominationRate === null ? "UNCOMPUTABLE" : "VALUE" }, attendanceHours: hours, averageHourlyReward: ratio(reward.value, hours.value), contractsPerHour: ratio(contracts.value, hours.value), photoNominations: metrics?.photoNominations, free: metrics?.free, newCount: metrics?.newCount, repeat: metrics?.repeat, photoDiaryCount: heavenDiary, diaryPosts: heavenDiary, cancellations: metrics?.cancellations };
  });
  const storeBreakdown = input.storeCode === "ALL"
    ? storeFacts.map(({ storeCode, fact: storeFact }) => ({ storeCode, sales: storeFact.selected.sales, contracts: storeFact.selected.contracts, nominations: storeFact.selected.nominations, attendancePeople: storeFact.selected.attendancePeople, attendanceHours: storeFact.selected.attendanceHours, castReward: storeFact.selected.castReward }))
    : fact.stores.map((store) => ({ storeCode: store.code, sales: store.metrics.sales, contracts: store.metrics.contracts, nominations: store.metrics.nominations, attendancePeople: store.metrics.attendancePeople, attendanceHours: store.metrics.attendanceHours, castReward: store.metrics.castReward }));
  const contracts = selected.contracts.value;
  const nominations = selected.nominations.value;
  const photoNominations = selected.photoNominations.value;
  const free = selected.free.value;
  const breakdownState = contractBreakdownState(contracts, [nominations, photoNominations, free]);
  const diaryRows = heavenDiaryRows.filter((row) => row.rawValueStatus === "VALUE" && row.rawValue !== null);
  const diaryTotal = diaryRows.reduce((total, row) => total + Number(row.rawValue), 0);
  const diaryPosts = diaryRows.length ? { value: diaryTotal, availability: diaryTotal === 0 ? "ZERO" as const : "VALUE" as const } : { value: null, availability: "MISSING" as const };
  return { businessDate: input.date, available: true as const, weekday: fact.weekday, scope: input.storeCode, summary: { sales: selected.sales, contracts: selected.contracts, nominationCount: selected.nominations, nominationRate: { value: ratio(nominations, contracts), availability: ratio(nominations, contracts) === null ? "UNCOMPUTABLE" : "VALUE" }, attendanceCount: selected.attendancePeople, workingHours: selected.attendanceHours, femaleReward: selected.castReward, profit: selected.profit, townPv: fact.town.pv, townUu: fact.town.uu, heavenAccess: fact.heaven.pageAccess, diaryPosts }, contractBreakdown: { nominationCount: selected.nominations, photoNominationCount: selected.photoNominations, freeCount: selected.free, newCount: selected.newCount, cancelCount: selected.cancellations, repeatCount: selected.repeat, availability: breakdownState.availability, nominations: selected.nominations, photoNominations, free, cancellations: selected.cancellations, repeat: selected.repeat }, storeBreakdown, contractBreakdownConsistency: { isConsistent: breakdownState.isConsistent, contracts, breakdownTotal: breakdownState.breakdownTotal, difference: breakdownState.difference }, casts, media: { townPv: fact.town.pv, townUu: fact.town.uu, heavenAccess: fact.heaven.pageAccess }, featureLabels: data.featureAnalysis.filter((feature) => feature.featureDays.some((day) => day.date === input.date)).map((feature) => feature.label), availability: { cti: selected.sales.availability === "MISSING" ? "MISSING" : "VALUE", town: fact.town.pv.availability, heaven: fact.heaven.pageAccess.availability } };
}
