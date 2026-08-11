import { prisma } from "@/lib/prisma";
import { formatDateOnly, parseDateOnly } from "@/lib/date";

export type WeekdayScope = "ALL" | "KASUKABE" | "KOSHIGAYA";
export type WeekdayMetricKey = "sales" | "contracts" | "newCount" | "repeatCount" | "mainNominations" | "photoNominations" | "freeCount" | "attendanceTotal" | "workingHours" | "townPv" | "townUu" | "telTapUu" | "heavenAccess" | "heavenDiaryPosts";
type Availability = "VALUE" | "ZERO" | "MISSING" | "UNAVAILABLE" | "UNCOMPUTABLE";
type Metric = { value: number | null; availability: Availability };
type Day = { date: string; weekday: number; weekOfMonth: number; isHoliday: boolean; metrics: Record<WeekdayMetricKey, Metric> };
const metricKeys: WeekdayMetricKey[] = ["sales", "contracts", "newCount", "repeatCount", "mainNominations", "photoNominations", "freeCount", "attendanceTotal", "workingHours", "townPv", "townUu", "telTapUu", "heavenAccess", "heavenDiaryPosts"];
const weekdayLabels = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];
const holidays = new Set(["2026-04-29", "2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06", "2026-07-20", "2026-08-11"]);
const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const daysBetween = (from: Date, to: Date) => { const result: string[] = []; for (let cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) result.push(iso(cursor)); return result; };
const metric = (values: number[], applicable = true): Metric => !applicable ? { value: null, availability: "UNAVAILABLE" } : !values.length ? { value: null, availability: "MISSING" } : { value: values.reduce((a, b) => a + b, 0), availability: values.every((v) => v === 0) ? "ZERO" : "VALUE" };
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const sumMetric = (days: Day[], key: WeekdayMetricKey): Metric => { const values = days.map((day) => day.metrics[key]).filter((item) => item.value !== null).map((item) => item.value as number); return metric(values, days.some((day) => day.metrics[key].availability !== "UNAVAILABLE")); };
const fmtDate = (value: string) => value;

function aggregateDays(days: Day[]) {
  const metrics = Object.fromEntries(metricKeys.map((key) => [key, sumMetric(days, key)])) as Record<WeekdayMetricKey, Metric>;
  const sales = days.map((day) => day.metrics.sales.value).filter((v): v is number => v !== null);
  const contracts = days.map((day) => day.metrics.contracts.value).filter((v): v is number => v !== null);
  const hours = days.map((day) => day.metrics.workingHours.value).filter((v): v is number => v !== null);
  return { sampleDays: days.length, holidayDays: days.filter((day) => day.isHoliday).length, metrics, averageDailySales: average(sales), averageDailyContracts: average(contracts), averageDailyAttendance: average(days.map((day) => day.metrics.attendanceTotal.value).filter((v): v is number => v !== null)), averageDailyHours: average(hours), averageUnitPrice: metrics.contracts.value ? (metrics.sales.value ?? 0) / metrics.contracts.value : null, contractsPerHour: metrics.workingHours.value ? (metrics.contracts.value ?? 0) / metrics.workingHours.value : null, mainNominationRate: metrics.contracts.value ? (metrics.mainNominations.value ?? 0) / metrics.contracts.value : null };
}

type Aggregate = ReturnType<typeof aggregateDays>;
export type SalesMemo = { key: string; text: string };
export type StrategyCandidate = { code: string; label: string; explanation: string };
type Signals = { memos: SalesMemo[]; candidates: StrategyCandidate[] };
type WeekdayRow = { weekday: number; label: string; } & Aggregate & { weekBreakdown: Array<{ weekOfMonth: number } & Aggregate>; signals: Signals };
export type WeekdayStrategyDto = { period: { from: string; to: string; dayCount: number; partialMonths: string[] }; scope: { key: WeekdayScope; label: string }; overall: Aggregate; salesMemos: SalesMemo[]; weekdays: WeekdayRow[]; weekOfMonthMatrix: Array<{ weekOfMonth: number; weekdays: Array<{ weekday: number; label: string } & Aggregate & { signals: Signals }> }>; comparison: { left: number; right: number; weekdays: WeekdayRow[] }; availability: { heaven: Availability; town: Availability }; days: Day[] };

export type WeekdayDataRange = { from: string; to: string } | null;

export async function getWeekdayDataRange(scope: WeekdayScope = "ALL"): Promise<WeekdayDataRange> {
  const stores = await prisma.store.findMany({ where: { code: { in: ["KASUKABE", "KOSHIGAYA"] }, isActive: true }, select: { id: true, code: true } });
  const allowed = stores.filter((store) => scope === "ALL" || store.code === scope).map((store) => store.id);
  if (!allowed.length) return null;
  const [cti, town, heaven] = await Promise.all([
    prisma.ctiCastDaily.aggregate({ where: { storeId: { in: allowed }, cast: { mergedIntoCastId: null } }, _min: { businessDate: true }, _max: { businessDate: true } }),
    prisma.townStoreDaily.aggregate({ where: { storeId: { in: allowed } }, _min: { date: true }, _max: { date: true } }),
    prisma.heavenCastDaily.aggregate({ where: { storeId: { in: allowed }, rawValueStatus: "VALUE" }, _min: { businessDate: true }, _max: { businessDate: true } }),
  ]);
  const dates = [cti._min.businessDate, cti._max.businessDate, town._min.date, town._max.date, heaven._min.businessDate, heaven._max.businessDate].filter((value): value is Date => value instanceof Date).map((value) => formatDateOnly(value)).sort();
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
}

const percentile = (values: number[], fraction: number) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] : null; };
function signalsFor(row: Aggregate & { label?: string }, thresholds: { lowSales: number | null; highSales: number | null; lowNew: number | null; highNew: number | null; lowRepeat: number | null; highRepeat: number | null; lowUu: number | null; highUu: number | null; lowAttendance: number | null; lowMain: number | null }): Signals {
  const sales = row.averageDailySales; const newCount = row.metrics.newCount.value; const repeat = row.metrics.repeatCount.value; const uu = row.metrics.townUu.value; const attendance = row.averageDailyAttendance; const candidates: StrategyCandidate[] = [];
  const low = (value: number | null, threshold: number | null) => value !== null && threshold !== null && value <= threshold;
  const high = (value: number | null, threshold: number | null) => value !== null && threshold !== null && value >= threshold;
  if (low(newCount, thresholds.lowNew) && low(uu, thresholds.lowUu)) candidates.push({ code: "ADVERTISING_REVIEW", label: "広告施策候補", explanation: `新規${newCount?.toLocaleString("ja-JP")}件とTown UU${uu?.toLocaleString("ja-JP")}が少ない状態のため、媒体流入を確認してください。` });
  if (high(newCount, thresholds.highNew) && low(row.metrics.mainNominations.value, thresholds.lowMain)) candidates.push({ code: "NOMINATION_EVENT_REVIEW", label: "本指名イベント候補", explanation: `新規${newCount?.toLocaleString("ja-JP")}件に対して本指名${row.metrics.mainNominations.value?.toLocaleString("ja-JP")}件です。接客後の確認を行ってください。` });
  if (!low(newCount, thresholds.lowNew) && low(repeat, thresholds.lowRepeat)) candidates.push({ code: "FOLLOW_UP_REVIEW", label: "接客フォロー確認候補", explanation: `新規${newCount?.toLocaleString("ja-JP")}件に対してリピート${repeat?.toLocaleString("ja-JP")}件です。再来状況を確認してください。` });
  if (low(attendance, thresholds.lowAttendance) && low(sales, thresholds.lowSales)) candidates.push({ code: "STAFFING_REVIEW", label: "出勤配置候補", explanation: `平均出勤${attendance?.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}人、平均売上¥${sales?.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}です。配置を確認してください。` });
  if (high(sales, thresholds.highSales) && high(newCount, thresholds.highNew) && high(repeat, thresholds.highRepeat)) candidates.push({ code: "MAINTAIN_REVIEW", label: "現状維持候補", explanation: `平均売上¥${sales?.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}、新規${newCount?.toLocaleString("ja-JP")}件、リピート${repeat?.toLocaleString("ja-JP")}件です。現在の運用を確認してください。` });
  const memos: SalesMemo[] = [];
  if (low(newCount, thresholds.lowNew)) memos.push({ key: "NEW_LOW", text: `新規${newCount?.toLocaleString("ja-JP")}件で、少ない状態です。` });
  if (low(repeat, thresholds.lowRepeat)) memos.push({ key: "REPEAT_LOW", text: `リピート${repeat?.toLocaleString("ja-JP")}件で、少ない状態です。` });
  if (high(repeat, thresholds.highRepeat)) memos.push({ key: "REPEAT_HIGH", text: `リピート${repeat?.toLocaleString("ja-JP")}件で、比較的多い状態です。` });
  if (low(uu, thresholds.lowUu)) memos.push({ key: "UU_LOW", text: `Town UU${uu?.toLocaleString("ja-JP")}で、少ない状態です。媒体流入を確認してください。` });
  return { memos: memos.slice(0, 2), candidates: candidates.slice(0, 2) };
}

export async function getWeekdayStrategy(input: { from: string; to: string; scope?: WeekdayScope; left?: number; right?: number }): Promise<WeekdayStrategyDto> {
  const from = parseDateOnly(input.from); const to = parseDateOnly(input.to); const days = daysBetween(from, to); const scope = input.scope ?? "ALL";
  const stores = await prisma.store.findMany({ where: { code: { in: ["KASUKABE", "KOSHIGAYA"] }, isActive: true }, select: { id: true, code: true } });
  const allowed = new Set(stores.filter((store) => scope === "ALL" || store.code === scope).map((store) => store.id));
  const [cti, town, heaven] = await Promise.all([
    prisma.ctiCastDaily.findMany({ where: { businessDate: { gte: from, lte: to }, storeId: { in: [...allowed] }, cast: { mergedIntoCastId: null } }, select: { businessDate: true, storeId: true, attendanceMinutes: true, salesAmount: true, contractCount: true, newCount: true, repeatCount: true, regularNominationCount: true, photoNominationCount: true, freeCount: true, attendanceCount: true } }),
    prisma.townStoreDaily.findMany({ where: { date: { gte: from, lte: to }, storeId: { in: [...allowed] } }, select: { date: true, storeId: true, pv: true, uu: true, telTapUu: true } }),
    prisma.heavenCastDaily.findMany({ where: { businessDate: { gte: from, lte: to }, storeId: { in: [...allowed] }, metricKey: { in: ["page_access", "diary_posts"] }, rawValueStatus: "VALUE" }, select: { businessDate: true, storeId: true, metricKey: true, rawValue: true } }),
  ]);
  const build = (date: string): Day => { const ctiRows = cti.filter((row) => iso(row.businessDate) === date); const townRows = town.filter((row) => iso(row.date) === date); const heavenRows = heaven.filter((row) => iso(row.businessDate) === date); const sums = (values: Array<number | null | undefined>) => values.filter((v): v is number => typeof v === "number"); const heavenApplicable = stores.some((store) => allowed.has(store.id) && store.code === "KASUKABE"); const values: Record<WeekdayMetricKey, Metric> = {
      sales: metric(sums(ctiRows.map((r) => r.salesAmount))), contracts: metric(sums(ctiRows.map((r) => r.contractCount))), newCount: metric(sums(ctiRows.map((r) => r.newCount))), repeatCount: metric(sums(ctiRows.map((r) => r.repeatCount))), mainNominations: metric(sums(ctiRows.map((r) => r.regularNominationCount))), photoNominations: metric(sums(ctiRows.map((r) => r.photoNominationCount))), freeCount: metric(sums(ctiRows.map((r) => r.freeCount))), attendanceTotal: metric(sums(ctiRows.map((r) => r.attendanceCount))), workingHours: (() => { const item = metric(sums(ctiRows.map((r) => r.attendanceMinutes))); return item.value === null ? item : { value: item.value / 60, availability: item.availability }; })(), townPv: metric(sums(townRows.map((r) => r.pv))), townUu: metric(sums(townRows.map((r) => r.uu))), telTapUu: metric(sums(townRows.map((r) => r.telTapUu))), heavenAccess: metric(sums(heavenRows.filter((r) => r.metricKey === "page_access").map((r) => r.rawValue === null ? null : Number(r.rawValue))), heavenApplicable), heavenDiaryPosts: metric(sums(heavenRows.filter((r) => r.metricKey === "diary_posts").map((r) => r.rawValue === null ? null : Number(r.rawValue))), heavenApplicable),
    }; const dateValue = toDate(date); return { date, weekday: dateValue.getUTCDay(), weekOfMonth: Math.floor((dateValue.getUTCDate() - 1) / 7) + 1, isHoliday: holidays.has(date), metrics: values }; };
  const dayRows = days.map(build); const rawWeekdays = [1, 2, 3, 4, 5, 6, 0].map((weekday) => { const selected = dayRows.filter((day) => day.weekday === weekday); return { weekday, label: weekdayLabels[weekday], ...aggregateDays(selected), weekBreakdown: [1, 2, 3, 4, 5].map((weekOfMonth) => ({ weekOfMonth, ...aggregateDays(selected.filter((day) => day.weekOfMonth === weekOfMonth)) })) }; });
  const thresholds = { lowSales: percentile(rawWeekdays.map((row) => row.averageDailySales).filter((v): v is number => v !== null), .25), highSales: percentile(rawWeekdays.map((row) => row.averageDailySales).filter((v): v is number => v !== null), .75), lowNew: percentile(rawWeekdays.map((row) => row.metrics.newCount.value).filter((v): v is number => v !== null), .25), highNew: percentile(rawWeekdays.map((row) => row.metrics.newCount.value).filter((v): v is number => v !== null), .75), lowRepeat: percentile(rawWeekdays.map((row) => row.metrics.repeatCount.value).filter((v): v is number => v !== null), .25), highRepeat: percentile(rawWeekdays.map((row) => row.metrics.repeatCount.value).filter((v): v is number => v !== null), .75), lowUu: percentile(rawWeekdays.map((row) => row.metrics.townUu.value).filter((v): v is number => v !== null), .25), highUu: percentile(rawWeekdays.map((row) => row.metrics.townUu.value).filter((v): v is number => v !== null), .75), lowAttendance: percentile(rawWeekdays.map((row) => row.averageDailyAttendance).filter((v): v is number => v !== null), .25), lowMain: percentile(rawWeekdays.map((row) => row.metrics.mainNominations.value).filter((v): v is number => v !== null), .25) };
  const weekdayRows = rawWeekdays.map((row) => ({ ...row, signals: signalsFor(row, thresholds) }));
  const matrix = [1, 2, 3, 4, 5].map((weekOfMonth) => ({ weekOfMonth, weekdays: weekdayRows.map((row) => { const cell = aggregateDays(dayRows.filter((day) => day.weekOfMonth === weekOfMonth && day.weekday === row.weekday)); return { weekday: row.weekday, label: row.label, ...cell, signals: signalsFor(cell, thresholds) }; }) }));
  const overall = aggregateDays(dayRows); const salesMemos: SalesMemo[] = [...weekdayRows.flatMap((row) => row.signals.memos.map((memo) => ({ key: `${row.weekday}-${memo.key}`, text: `${row.label}は${memo.text}` })) ), ...matrix.flatMap((row) => row.weekdays.filter((cell) => cell.sampleDays > 0 && cell.sampleDays <= 2).map((cell) => ({ key: `week-${row.weekOfMonth}-${cell.weekday}`, text: `第${row.weekOfMonth}週の${cell.label}は対象${cell.sampleDays}日です。実数を確認してください。` })))].slice(0, 5);
  const left = input.left ?? 2; const right = input.right ?? 0; const lastDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0)).getUTCDate(); const partialMonths = to.getUTCDate() < lastDay ? [to.toISOString().slice(0, 7)] : [];
  return { period: { from: fmtDate(input.from), to: fmtDate(input.to), dayCount: dayRows.length, partialMonths }, scope: { key: scope, label: scope === "ALL" ? "全体" : scope === "KASUKABE" ? "春日部" : "越谷" }, overall, salesMemos, weekdays: weekdayRows, weekOfMonthMatrix: matrix, comparison: { left, right, weekdays: [weekdayRows.find((row) => row.weekday === left)!, weekdayRows.find((row) => row.weekday === right)!] }, availability: { heaven: scope === "KOSHIGAYA" ? "UNAVAILABLE" : overall.metrics.heavenAccess.availability, town: overall.metrics.townUu.availability }, days: dayRows };
}
