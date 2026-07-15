import type { CtiCastDaily } from "@/generated/prisma/client";
import { formatDateOnly, parseDateOnly } from "@/lib/date";

export type CtiRecord = Pick<CtiCastDaily,
  "businessDate" | "storeId" | "castId" | "attendanceCount" | "attendanceMinutes" | "reservationCount" |
  "cancellationCount" | "contractCount" | "regularNominationCount" | "photoNominationCount" | "freeCount" |
  "salesAmount" | "castRewardAmount" | "ctiProfitAmount" | "payoutAfterRewardAmount"
>;

export function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

export function aggregateCti(records: CtiRecord[]) {
  const attendanceDays = new Set(records.filter((record) => record.attendanceCount > 0).map((record) => `${record.castId}:${formatDateOnly(record.businessDate)}`)).size;
  const actualAttendance = attendanceDays;
  const storeAttendance = records.filter((record) => record.attendanceCount > 0).length;
  const sum = <K extends keyof CtiRecord>(key: K) => records.reduce((total, record) => total + Number(record[key]), 0);
  const totals = {
    attendanceDays, actualAttendance, storeAttendance,
    attendanceMinutes: sum("attendanceMinutes"), reservationCount: sum("reservationCount"), cancellationCount: sum("cancellationCount"),
    contractCount: sum("contractCount"), regularNominationCount: sum("regularNominationCount"), photoNominationCount: sum("photoNominationCount"), freeCount: sum("freeCount"),
    salesAmount: sum("salesAmount"), castRewardAmount: sum("castRewardAmount"), ctiProfitAmount: sum("ctiProfitAmount"), payoutAfterRewardAmount: sum("payoutAfterRewardAmount"),
  };
  return {
    ...totals,
    regularNominationRate: ratio(totals.regularNominationCount, totals.contractCount),
    averageUnitPrice: ratio(totals.salesAmount, totals.contractCount),
    averageRewardUnitPrice: ratio(totals.castRewardAmount, totals.contractCount),
    averageRewardPerDay: ratio(totals.castRewardAmount, attendanceDays),
    averageRewardPerHour: ratio(totals.castRewardAmount, totals.attendanceMinutes / 60),
    averageSalesPerHour: ratio(totals.salesAmount, totals.attendanceMinutes / 60),
    averageAttendanceHours: ratio(totals.attendanceMinutes / 60, attendanceDays),
    averageContractsPerDay: ratio(totals.contractCount, attendanceDays),
  };
}

export function resolveDateRange(from?: string, to?: string) {
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = `${defaultTo.slice(0, 7)}-01`;
  const fromText = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : defaultFrom;
  const toText = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : defaultTo;
  const fromDate = parseDateOnly(fromText);
  const toDate = parseDateOnly(toText);
  if (fromDate > toDate) return { from: toDate, to: fromDate, fromText: toText, toText: fromText };
  return { from: fromDate, to: toDate, fromText, toText };
}
