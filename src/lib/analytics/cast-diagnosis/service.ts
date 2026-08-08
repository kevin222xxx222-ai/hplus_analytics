import { prisma } from "@/lib/prisma";
import { buildCastDiagnosis, buildMonthlyFacts, type CastRawInput } from "./engine";
import type { CastComparisonProviderMode } from "@/lib/analytics/cast-comparison/types";

const stores = ["KASUKABE", "KOSHIGAYA", "NODA"] as const;
const confirmed = { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] as ("COMPLETED" | "COMPLETED_WITH_WARNINGS")[] } };
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const clampEnd = (to: string) => { const today = new Date(); const end = new Date(`${to}T23:59:59.999Z`); return end > today ? today : end; };
type CtiRow = { castId: string; storeId: string; businessDate: Date; attendanceCount: number; attendanceMinutes: number; reservationCount: number; contractCount: number; regularNominationCount: number; photoNominationCount: number; freeCount: number; newCount: number | null; repeatCount: number | null; cancellationCount: number; castRewardAmount: number; salesAmount: number; ctiProfitAmount: number; paidOptionCount: number; cast: { displayName: string }; store: { shortName: string } };
const toRaw = (row: CtiRow, mediaKey: (storeId: string, castId: string, date: string) => string, townMap?: Map<string, { pv: number; uu: number }>, heavenMap?: Map<string, { page: number; diary: number; hasPage: boolean; hasDiary: boolean; pageRows: number; diaryRows: number }>): CastRawInput => { const date = isoDate(row.businessDate); const t = townMap?.get(mediaKey(row.storeId, row.castId, date)); const h = heavenMap?.get(mediaKey(row.storeId, row.castId, date)); return { castId: row.castId, castName: row.cast.displayName, storeId: row.storeId, storeLabel: row.store.shortName, date, attendanceCount: row.attendanceCount, attendanceMinutes: row.attendanceMinutes, reservations: row.reservationCount, contracts: row.contractCount, mainNominations: row.regularNominationCount, photoNominations: row.photoNominationCount, freeCount: row.freeCount, newCount: row.newCount, repeatCount: row.repeatCount, cancelCount: row.cancellationCount, femaleReward: row.castRewardAmount, chargeAmount: row.salesAmount, profit: row.ctiProfitAmount, paidOptionCount: row.paidOptionCount, townPv: t?.pv, townUu: t?.uu, heavenPageAccess: h?.pageRows ? h.hasPage ? h.page : null : undefined, heavenDiaryPosts: h?.diaryRows ? h.hasDiary ? h.diary : null : undefined }; };

export async function getCastDiagnosis(input: { from: string; to: string; comparisonMode?: CastComparisonProviderMode }) {
  const from = new Date(`${input.from}T00:00:00Z`); const end = clampEnd(input.to); const endDate = isoDate(end);
  const storeRows = await prisma.store.findMany({ where: { code: { in: [...stores] }, isActive: true }, select: { id: true, code: true, shortName: true } });
  const storeIds = storeRows.map((s) => s.id);
  const [cti, town, heaven] = await Promise.all([
    prisma.ctiCastDaily.findMany({ where: { businessDate: { gte: from, lte: end }, storeId: { in: storeIds }, cast: { mergedIntoCastId: null }, importBatch: confirmed }, select: { castId: true, storeId: true, businessDate: true, attendanceCount: true, attendanceMinutes: true, reservationCount: true, contractCount: true, regularNominationCount: true, photoNominationCount: true, freeCount: true, newCount: true, repeatCount: true, cancellationCount: true, castRewardAmount: true, salesAmount: true, ctiProfitAmount: true, paidOptionCount: true, cast: { select: { displayName: true } }, store: { select: { shortName: true } } } }),
    prisma.townCastDaily.findMany({ where: { date: { gte: from, lte: end }, storeId: { in: storeIds }, cast: { mergedIntoCastId: null }, importBatch: confirmed }, select: { castId: true, storeId: true, date: true, pv: true, uu: true, isListed: true } }),
    prisma.heavenCastDaily.findMany({ where: { businessDate: { gte: from, lte: end }, storeId: { in: storeIds }, metricKey: { in: ["page_access", "diary_posts"] }, cast: { mergedIntoCastId: null }, importBatch: confirmed }, select: { castId: true, storeId: true, businessDate: true, metricKey: true, rawValue: true, rawValueStatus: true } }),
  ]);
  const mediaKey = (storeId: string, castId: string, date: string) => `${storeId}:${castId}:${date}`;
  const townMap = new Map<string, { pv: number; uu: number }>(); for (const row of town) { const k = mediaKey(row.storeId, row.castId, isoDate(row.date)); const x = townMap.get(k) ?? { pv: 0, uu: 0 }; x.pv += row.pv; x.uu += row.uu; townMap.set(k, x); }
  const heavenMap = new Map<string, { page: number; diary: number; hasPage: boolean; hasDiary: boolean; pageRows: number; diaryRows: number }>(); for (const row of heaven) { if (!row.castId) continue; const k = mediaKey(row.storeId, row.castId, isoDate(row.businessDate)); const x = heavenMap.get(k) ?? { page: 0, diary: 0, hasPage: false, hasDiary: false, pageRows: 0, diaryRows: 0 }; const valid = row.rawValueStatus === "VALUE" && row.rawValue !== null; if (row.metricKey === "page_access") { x.pageRows++; if (valid) { x.page += Number(row.rawValue); x.hasPage = true; } } else { x.diaryRows++; if (valid) { x.diary += Number(row.rawValue); x.hasDiary = true; } } heavenMap.set(k, x); }
  const rows: CastRawInput[] = cti.map((row) => toRaw(row, mediaKey, townMap, heavenMap));
  const facts = buildMonthlyFacts(rows);
  let rollingFacts;
  const monthlyEligible = facts.filter((fact) => ((fact.attendanceDays.value ?? 0) >= 4 || (fact.workingHours.value ?? 0) >= 20) && (fact.contracts.value ?? 0) >= 5 && fact.hourlyReward.value !== null).length;
  if (monthlyEligible <= 4) {
    const rollingFrom = new Date(from); rollingFrom.setUTCMonth(rollingFrom.getUTCMonth() - 2);
    const rollingRows = await prisma.ctiCastDaily.findMany({ where: { businessDate: { gte: rollingFrom, lte: end }, storeId: { in: storeIds }, cast: { mergedIntoCastId: null }, importBatch: confirmed }, select: { castId: true, storeId: true, businessDate: true, attendanceCount: true, attendanceMinutes: true, reservationCount: true, contractCount: true, regularNominationCount: true, photoNominationCount: true, freeCount: true, newCount: true, repeatCount: true, cancellationCount: true, castRewardAmount: true, salesAmount: true, ctiProfitAmount: true, paidOptionCount: true, cast: { select: { displayName: true } }, store: { select: { shortName: true } } } });
    rollingFacts = buildMonthlyFacts((rollingRows as CtiRow[]).map((row) => toRaw(row, mediaKey)));
  }
  const result = buildCastDiagnosis({ period: { from: input.from, to: endDate }, facts, rollingFacts, comparisonMode: input.comparisonMode });
  return { ...result, dataNotes: { futureDateClamped: endDate !== input.to, ctiRows: cti.length, townRows: town.length, heavenRows: heaven.length, source: "確定済みBatchのみ。媒体値はcastId単位で同日を合算し、未取得を0補完しません。" } };
}
