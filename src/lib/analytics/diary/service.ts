import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/date";
import { analyzeDiaryWeekdays, summarizeDiary, type DiaryInputRow } from "@/lib/analytics/engine/diary";
import type { StoreCode } from "@/generated/prisma/client";

const CODES: StoreCode[] = ["KASUKABE", "KOSHIGAYA", "NODA"];
export type DiaryRequest = { from: string; to: string; storeCodes?: StoreCode[]; castId?: string; groupBy?: "day" | "weekday" | "store" | "cast"; comparison?: string; sort?: string; order?: "asc" | "desc" };

function decimal(value: unknown) { return value === null || value === undefined ? null : Number(value); }
function key(date: Date, storeId: string, castId: string | null) { return `${date.toISOString().slice(0, 10)}|${storeId}|${castId ?? "store"}`; }

export async function getDiaryAnalytics(input: DiaryRequest) {
  const from = parseDateOnly(input.from); const to = parseDateOnly(input.to);
  const codes = input.storeCodes?.length ? input.storeCodes : CODES;
  const stores = await prisma.store.findMany({ where: { code: { in: codes }, isActive: true }, select: { id: true, code: true, name: true, shortName: true } });
  const storeIds = stores.map((store) => store.id);
  const dateWhere = { gte: from, lte: to };
  const [casts, cti, townCast, townStore, diaryUrls, heaven] = await Promise.all([
    prisma.cast.findMany({ where: { mergedIntoCastId: null, ...(input.castId ? { id: input.castId } : {}), OR: [{ startedOn: { lte: to }, endedOn: null }, { startedOn: { lte: to }, endedOn: { gte: from } }] }, select: { id: true, displayName: true, primaryStoreId: true } }),
    prisma.ctiCastDaily.findMany({ where: { businessDate: dateWhere, storeId: { in: storeIds }, ...(input.castId ? { castId: input.castId } : {}) }, select: { businessDate: true, storeId: true, castId: true, diaryCountCti: true, salesAmount: true, castRewardAmount: true, reservationCount: true, serviceCount: true, contractCount: true, attendanceCount: true, attendanceMinutes: true } }),
    prisma.townCastDaily.findMany({ where: { date: dateWhere, storeId: { in: storeIds }, ...(input.castId ? { castId: input.castId } : {}) }, select: { date: true, storeId: true, castId: true, pv: true, uu: true, telTapUu: true } }),
    prisma.townStoreDaily.findMany({ where: { date: dateWhere, storeId: { in: storeIds } }, select: { date: true, storeId: true, pv: true, uu: true, telTapUu: true } }),
    prisma.townUrlDaily.findMany({ where: { date: dateWhere, storeId: { in: storeIds }, pageType: "CAST_DIARY", ...(input.castId ? { castId: input.castId } : {}) }, select: { date: true, storeId: true, castId: true, normalizedUrl: true, pv: true, uu: true, telTapUu: true } }),
    prisma.heavenCastDaily.findMany({ where: { businessDate: dateWhere, storeId: { in: storeIds }, ...(input.castId ? { castId: input.castId } : {}), metricKey: "diary_posts", rawValueStatus: "VALUE" }, select: { businessDate: true, storeId: true, castId: true, rawValue: true } }),
  ]);
  const rows = new Map<string, DiaryInputRow>();
  const get = (date: Date, storeId: string, castId: string | null) => { const k = key(date, storeId, castId); const existing = rows.get(k); if (existing) return existing; const value: DiaryInputRow = { date: date.toISOString().slice(0, 10), storeId, castId, naturalKey: `diary:${k}` }; rows.set(k, value); return value; };
  for (const row of cti) { const x = get(row.businessDate, row.storeId, row.castId); x.ctiDiaryPostCount = (x.ctiDiaryPostCount ?? 0) + row.diaryCountCti; x.sales = (x.sales ?? 0) + row.salesAmount; x.compensation = (x.compensation ?? 0) + row.castRewardAmount; x.reservations = (x.reservations ?? 0) + row.reservationCount; x.receptions = (x.receptions ?? 0) + row.serviceCount; x.contracts = (x.contracts ?? 0) + row.contractCount; x.attendanceCount = (x.attendanceCount ?? 0) + row.attendanceCount; x.workHours = (x.workHours ?? 0) + row.attendanceMinutes / 60; }
  for (const row of townCast) { const x = get(row.date, row.storeId, row.castId); x.townCastPagePv = (x.townCastPagePv ?? 0) + row.pv; x.townCastPageUu = (x.townCastPageUu ?? 0) + row.uu; }
  for (const row of townStore) { const x = get(row.date, row.storeId, null); x.townStorePv = row.pv; x.townStoreUu = row.uu; }
  for (const row of diaryUrls) { const x = get(row.date, row.storeId, row.castId); x.townDiaryPv = (x.townDiaryPv ?? 0) + row.pv; x.townDiaryUu = (x.townDiaryUu ?? 0) + row.uu; x.townDiaryTel = (x.townDiaryTel ?? 0) + row.telTapUu; }
  for (const row of heaven) { const x = get(row.businessDate, row.storeId, row.castId); x.heavenDiaryPostCount = (x.heavenDiaryPostCount ?? 0) + (decimal(row.rawValue) ?? 0); }
  const allRows = [...rows.values()];
  const summary = summarizeDiary(allRows);
  const weekdays = analyzeDiaryWeekdays(allRows);
  const storeSummaries = stores.map((store) => ({ store, summary: summarizeDiary(allRows.filter((row) => row.storeId === store.id)) }));
  const castSummaries = casts.map((cast) => ({ cast, summary: summarizeDiary(allRows.filter((row) => row.castId === cast.id)) }));
  const daily = [...new Set(allRows.map((row) => row.date))].sort().map((date) => ({ date, summary: summarizeDiary(allRows.filter((row) => row.date === date)) }));
  return { meta: { from: input.from, to: input.to, groupBy: input.groupBy ?? "period", store: input.storeCodes ?? "ALL", castId: input.castId ?? null }, availability: summary.availability, confidence: summary.confidence, sample: { days: summary.sampleDays }, summary, postingActivity: { ctiDiaryPostCount: summary.ctiDiaryPostCount, heavenDiaryPostCount: summary.heavenDiaryPostCount, diaryPostActivityReference: summary.diaryPostActivityReference }, exposure: { townDiaryPv: summary.townDiaryPv, townDiaryUu: summary.townDiaryUu, townDiaryTel: summary.townDiaryTel, townCastPagePv: summary.townCastPagePv, townCastPageUu: summary.townCastPageUu, townStorePv: summary.townStorePv, townStoreUu: summary.townStoreUu, heavenDiaryPv: { value: null, availability: "UNAVAILABLE", reason: "Heaven写メ日記PVは取得元データに存在しません。" } }, conversion: { sales: summary.sales, compensation: summary.compensation, reservations: summary.reservations, contracts: summary.contracts, efficiencies: summary.efficiencies }, weekday: weekdays, daily, storeComparison: storeSummaries, castComparison: castSummaries, growth: weekdays.map((item) => ({ weekday: item.weekday, primaryCause: item.primaryCause, candidates: item.causeCandidates })), nextBestAction: null, dataNotes: ["Town写メ日記PVはTownUrlDailyのCAST_DIARYのみです。", "CTI・Heaven投稿数の合算は正式投稿数ではなく参考値です。", "媒体指標と予約・売上の関係は相関・比較であり因果を示しません。", "Heaven写メ日記PVはUnavailableです。"] };
}
