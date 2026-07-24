import { prisma } from "@/lib/prisma";
import type { StoreCode } from "@/generated/prisma/client";

export type AnalyticsQuery = { from: Date; to: Date; storeCodes?: StoreCode[] };

const ANALYTICS_STORE_CODES: StoreCode[] = ["KASUKABE", "KOSHIGAYA", "NODA"];

export type AnalyticsQuerySnapshot = Awaited<ReturnType<typeof fetchAnalyticsSnapshot>>;

/** Prisma-only query layer. It intentionally returns rows, not Engine DTOs. */
export async function fetchAnalyticsSnapshot(input: AnalyticsQuery) {
  const codes = input.storeCodes?.length ? input.storeCodes : ANALYTICS_STORE_CODES;
  const stores = await prisma.store.findMany({ where: { code: { in: codes }, isActive: true }, select: { id: true, code: true, name: true, shortName: true } });
  const storeIds = stores.map((store) => store.id);
  const dateWhere = { gte: input.from, lte: input.to };
  const [casts, cti, town, heaven] = await Promise.all([
    prisma.cast.findMany({
      where: { mergedIntoCastId: null, OR: [{ startedOn: { lte: input.to }, endedOn: null }, { startedOn: { lte: input.to }, endedOn: { gte: input.from } }] },
      select: { id: true, displayName: true, normalizedName: true, startedOn: true, endedOn: true, primaryStoreId: true, status: true },
    }),
    storeIds.length ? prisma.ctiCastDaily.findMany({ where: { businessDate: dateWhere, storeId: { in: storeIds }, cast: { mergedIntoCastId: null } }, select: { businessDate: true, storeId: true, castId: true, attendanceCount: true, attendanceMinutes: true, reservationCount: true, serviceCount: true, regularNominationCount: true, freeCount: true, newCount: true, repeatCount: true, salesAmount: true, castRewardAmount: true, ctiProfitAmount: true, contractCount: true, paidOptionCount: true, diaryCountCti: true, importBatchId: true } }) : [],
    storeIds.length ? prisma.townCastDaily.findMany({ where: { date: dateWhere, storeId: { in: storeIds }, cast: { mergedIntoCastId: null } }, select: { date: true, storeId: true, castId: true, pv: true, uu: true, importBatchId: true } }) : [],
    storeIds.length ? prisma.heavenCastDaily.findMany({ where: { businessDate: dateWhere, storeId: { in: storeIds }, OR: [{ cast: { mergedIntoCastId: null } }, { castId: null }] }, select: { businessDate: true, storeId: true, castId: true, metricKey: true, rawValue: true, valueKind: true, rawValueStatus: true, importBatchId: true, resolutionKey: true } }) : [],
  ]);
  return { stores, casts, cti, town, heaven, from: input.from, to: input.to };
}

export { ANALYTICS_STORE_CODES };
