import { formatDateOnly } from "@/lib/date";
import type { AnalyticsRow } from "@/lib/analytics/engine";
import type { AnalyticsQuerySnapshot } from "./query";

const decimal = (value: unknown) => value === null || value === undefined ? null : Number(value);

export type CastMetadataDto = { id: string; displayName: string; normalizedName: string; startedOn: string; endedOn: string | null; primaryStoreId: string | null; status: string };

export function adaptSnapshot(snapshot: AnalyticsQuerySnapshot) {
  const ctiRows: AnalyticsRow[] = snapshot.cti.map((row) => ({ date: row.businessDate, storeId: row.storeId, castId: row.castId, media: "CTI", naturalKey: `cti:${row.importBatchId}:${formatDateOnly(row.businessDate)}:${row.storeId}:${row.castId}`, metrics: { sales: row.salesAmount, castReward: row.castRewardAmount, profit: row.ctiProfitAmount, reservations: row.reservationCount, services: row.serviceCount, regularNominations: row.regularNominationCount, free: row.freeCount, new: row.newCount, repeat: row.repeatCount, paidOptions: row.paidOptionCount, diaryPosts: row.diaryCountCti, attendancePeople: row.attendanceCount, attendanceMinutes: row.attendanceMinutes } }));
  const townRows: AnalyticsRow[] = snapshot.town.map((row) => ({ date: row.date, storeId: row.storeId, castId: row.castId, media: "TOWN", naturalKey: `town:${row.importBatchId}:${formatDateOnly(row.date)}:${row.storeId}:${row.castId}`, metrics: { townPv: row.pv, townUu: row.uu } }));
  const heavenRows: AnalyticsRow[] = snapshot.heaven.map((row) => {
    const isValue = row.rawValueStatus === "VALUE" && row.rawValue !== null;
    return { date: row.businessDate, storeId: row.storeId, castId: row.castId, media: "HEAVEN", naturalKey: `heaven:${row.importBatchId}:${formatDateOnly(row.businessDate)}:${row.storeId}:${row.resolutionKey}:${row.metricKey}`, metrics: { heavenAccess: row.metricKey === "page_access" && isValue ? decimal(row.rawValue) : null } };
  });
  const casts: CastMetadataDto[] = snapshot.casts.map((cast) => ({ id: cast.id, displayName: cast.displayName, normalizedName: cast.normalizedName, startedOn: formatDateOnly(cast.startedOn), endedOn: cast.endedOn ? formatDateOnly(cast.endedOn) : null, primaryStoreId: cast.primaryStoreId, status: cast.status }));
  return { rows: [...ctiRows, ...townRows, ...heavenRows], casts, stores: snapshot.stores.map((store) => ({ ...store })), from: formatDateOnly(snapshot.from), to: formatDateOnly(snapshot.to) };
}

export type AnalyticsInputDto = ReturnType<typeof adaptSnapshot>;
