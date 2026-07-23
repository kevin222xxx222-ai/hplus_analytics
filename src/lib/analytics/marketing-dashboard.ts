import { formatDateOnly } from "@/lib/date";

export type DashboardCast = { id: string; name: string; primaryStore: string | null; startedOn?: Date | null; endedOn?: Date | null };
export type DashboardCtiRow = { castId: string; storeId: string; date: Date; attendanceCount: number; attendanceMinutes: number; sales: number; reward: number; reservations: number; services: number; contracts: number; regular: number; diaryCount?: number };
export type DashboardTownRow = { castId: string; storeId: string; date: Date; pv: number; uu: number; tel: number };
export type DashboardHeavenRow = { castId: string; storeId: string; date: Date; metricKey: string; value: number | null; status: string; kind: string };

export const ratio = (a: number, b: number) => b === 0 ? null : a / b;
export const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
export const percentile = (values: number[], p: number) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
};

export function rangeMonths(from: Date, months: number) {
  const start = new Date(from); start.setUTCMonth(start.getUTCMonth() - months); start.setUTCDate(1);
  return start;
}

export function aggregateDashboardCast(cast: DashboardCast, cti: DashboardCtiRow[], town: DashboardTownRow[], heaven: DashboardHeavenRow[]) {
  const attendanceDates = new Set(cti.filter((r) => r.attendanceCount > 0).map((r) => formatDateOnly(r.date)));
  const sum = (rows: DashboardCtiRow[], key: keyof DashboardCtiRow) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const sales = sum(cti, "sales"); const reward = sum(cti, "reward"); const reservations = sum(cti, "reservations"); const services = sum(cti, "services"); const contracts = sum(cti, "contracts"); const regular = sum(cti, "regular");
  const townPv = town.reduce((n, r) => n + r.pv, 0); const townUu = town.reduce((n, r) => n + r.uu, 0); const townTel = town.reduce((n, r) => n + r.tel, 0);
  const metrics = new Map<string, { kind: string; value: number }>();
  for (const row of heaven.filter((r) => r.status === "VALUE" && r.value !== null)) {
    const current = metrics.get(row.metricKey); metrics.set(row.metricKey, { kind: row.kind, value: (current?.value ?? 0) + row.value! });
  }
  const heavenValue = (key: string) => { const rows = heaven.filter((r) => r.metricKey === key && r.status === "VALUE" && r.value !== null).sort((a, b) => a.date.getTime() - b.date.getTime()); if (!rows.length) return null; return rows[0].kind === "SNAPSHOT" ? rows.at(-1)!.value : rows.reduce((n, r) => n + r.value!, 0); };
  const heavenChange = (key: string) => { const rows = heaven.filter((r) => r.metricKey === key && r.status === "VALUE" && r.value !== null).sort((a, b) => a.date.getTime() - b.date.getTime()); if (!rows.length || rows[0].kind !== "SNAPSHOT") return null; return rows.at(-1)!.value! - rows[0].value!; };
  return {
    cast, attendanceDays: attendanceDates.size, attendanceMinutes: sum(cti, "attendanceMinutes"), sales, reward, reservations, services, contracts, regular,
    townPv, townUu, townTel, heavenPageAccess: heavenValue("page_access"), heavenDiaryPosts: heavenValue("diary_posts"), myGirl: heavenValue("my_girl"), myGirlChange: heavenChange("my_girl"), mitene: heavenValue("mitene_sent"), okini: heavenValue("okini_talk_sent"), attendanceNotice: heavenValue("attendance_notice"), diaryNotice: heavenValue("diary_notice"),
    salesPerDay: ratio(sales, attendanceDates.size), salesPerHour: ratio(sales, sum(cti, "attendanceMinutes") / 60), rewardPerDay: ratio(reward, attendanceDates.size), rewardPerHour: ratio(reward, sum(cti, "attendanceMinutes") / 60), contractsPerDay: ratio(contracts, attendanceDates.size), pvPerDay: ratio(townPv, attendanceDates.size), pvPerHour: ratio(townPv, sum(cti, "attendanceMinutes") / 60), regularRate: ratio(regular, contracts), contractsPerReservation: ratio(contracts, reservations), contractsPerTownUu: ratio(contracts, townUu), contractsPerHeavenAccess: ratio(contracts, heavenValue("page_access") ?? 0), regularPerService: ratio(regular, services), rewardPerService: ratio(reward, services), salesPerService: ratio(sales, services),
    diaryCountCti: cti.length ? sum(cti, "diaryCount") : null,
    miteneSent: heavenValue("mitene_sent"), okiniTalkSent: heavenValue("okini_talk_sent"), attendanceNoticeTotal: heavenValue("attendance_notice"),
    source: { cti: cti.length > 0, town: town.length > 0, heaven: heaven.length > 0 }, metrics,
  };
}

export function classifyDashboardRows(rows: ReturnType<typeof aggregateDashboardCast>[]) {
  const active = rows.filter((r) => r.attendanceDays > 0);
  const salesDay = active.map((r) => r.salesPerDay).filter((v): v is number => v !== null);
  const rewardHour = active.map((r) => r.rewardPerHour).filter((v): v is number => v !== null);
  const regularRate = active.map((r) => r.regularRate).filter((v): v is number => v !== null);
  const pvDay = active.map((r) => r.pvPerDay).filter((v): v is number => v !== null);
  const medDays = median(active.map((r) => r.attendanceDays)); const medSales = median(salesDay); const medPv = median(pvDay); const topSales = percentile(salesDay, .75); const topReward = percentile(rewardHour, .75); const avgRegular = regularRate.length ? regularRate.reduce((a, b) => a + b, 0) / regularRate.length : null; const avgPv = pvDay.length ? pvDay.reduce((a, b) => a + b, 0) / pvDay.length : null;
  const hidden = rows.filter((r) => medDays !== null && topSales !== null && topReward !== null && r.attendanceDays <= medDays && (r.salesPerDay ?? -1) >= topSales && (r.rewardPerHour ?? -1) >= topReward && (avgRegular === null || (r.regularRate ?? -1) >= avgRegular) && (avgPv === null || (r.pvPerDay ?? -1) >= avgPv)).slice(0, 5);
  const buried = rows.filter((r) => medDays !== null && medSales !== null && r.attendanceDays >= medDays && (r.salesPerDay ?? Infinity) < medSales && (avgPv === null || (r.pvPerDay ?? Infinity) < avgPv)).slice(0, 5);
  const bottlenecks = rows.flatMap((r) => { const result: { row: typeof r; label: string; reason: string }[] = []; if (avgPv !== null && r.pvPerDay !== null && r.pvPerDay < avgPv) result.push({ row: r, label: "集客不足候補", reason: `PV/出勤日 ${r.pvPerDay.toFixed(1)}（店舗平均 ${avgPv.toFixed(1)}）` }); if (r.townPv > 0 && r.contractsPerTownUu !== null && r.contractsPerTownUu < .05) result.push({ row: r, label: "閲覧後の予約転換不足候補", reason: `成約/Town UU ${(r.contractsPerTownUu * 100).toFixed(1)}%` }); if (r.reservations > 0 && r.contractsPerReservation !== null && r.contractsPerReservation < .7) result.push({ row: r, label: "成約不足候補", reason: `成約/予約 ${(r.contractsPerReservation * 100).toFixed(1)}%` }); if (r.services > 0 && avgRegular !== null && r.regularRate !== null && r.regularRate < avgRegular) result.push({ row: r, label: "再指名不足候補", reason: `本指名率 ${(r.regularRate * 100).toFixed(1)}%（平均 ${(avgRegular * 100).toFixed(1)}%）` }); return result; }).slice(0, 5);
  return { medDays, medSales, medPv, topSales, topReward, avgRegular, avgPv, hidden, buried, bottlenecks };
}

export type DiscoveryStateTag = "ACTIVE_ANALYZABLE" | "NO_ATTENDANCE" | "INSUFFICIENT_CTI_DATA" | "TOWN_NOT_LISTED" | "TOWN_DATA_MISSING" | "HEAVEN_NOT_LISTED" | "HEAVEN_DATA_MISSING" | "OUTSIDE_ENROLLMENT" | "LOW_SAMPLE";
export type DiscoveryIssue = { row: ReturnType<typeof aggregateDashboardCast>; label: string; reason: string };

/** Builds marketing cohorts without treating missing media data as zero performance. */
export function classifyDiscoveryRows(rows: ReturnType<typeof aggregateDashboardCast>[], from?: Date, to?: Date) {
  const inRange = (row: ReturnType<typeof aggregateDashboardCast>) => {
    const started = row.cast.startedOn; const ended = row.cast.endedOn;
    return (!started || !to || started <= to) && (!ended || !from || ended >= from);
  };
  const tagMap = new Map<string, DiscoveryStateTag[]>();
  const add = (id: string, tag: DiscoveryStateTag) => tagMap.set(id, [...(tagMap.get(id) ?? []), tag]);
  for (const row of rows) {
    const active = row.source.cti && row.attendanceDays >= 1 && row.attendanceMinutes > 0;
    if (active) add(row.cast.id, "ACTIVE_ANALYZABLE");
    if (!inRange(row)) add(row.cast.id, "OUTSIDE_ENROLLMENT");
    if (row.attendanceDays === 0) add(row.cast.id, "NO_ATTENDANCE");
    else if (!active) add(row.cast.id, "INSUFFICIENT_CTI_DATA");
    if (!row.source.town) add(row.cast.id, "TOWN_NOT_LISTED");
    else if (row.townPv <= 0 && row.townUu <= 0) add(row.cast.id, "TOWN_DATA_MISSING");
    if (!row.source.heaven) add(row.cast.id, "HEAVEN_NOT_LISTED");
    else if (row.heavenPageAccess === null || row.heavenPageAccess <= 0) add(row.cast.id, "HEAVEN_DATA_MISSING");
    if (active && row.attendanceDays < 2) add(row.cast.id, "LOW_SAMPLE");
  }
  const activeRows = rows.filter((row) => (tagMap.get(row.cast.id) ?? []).includes("ACTIVE_ANALYZABLE") || (row.source.cti && row.attendanceDays >= 1 && row.attendanceMinutes > 0));
  const townRows = activeRows.filter((row) => row.source.town && (row.townPv > 0 || row.townUu > 0));
  const heavenRows = activeRows.filter((row) => row.source.heaven && row.heavenPageAccess !== null && row.heavenPageAccess > 0);
  const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const activeMedianDays = median(activeRows.map((row) => row.attendanceDays));
  const salesTop25 = percentile(activeRows.map((row) => row.salesPerDay ?? NaN), .75);
  const rewardTop25 = percentile(activeRows.map((row) => row.rewardPerHour ?? NaN), .75);
  const avgContractsDay = avg(activeRows.map((row) => row.contractsPerDay ?? 0));
  const avgRegular = avg(activeRows.map((row) => row.regularRate ?? 0));
  const townPvTop25 = percentile(townRows.map((row) => row.pvPerDay ?? NaN), .25);
  const heavenAccessTop25 = percentile(heavenRows.map((row) => ratio(row.heavenPageAccess ?? 0, row.attendanceDays) ?? NaN), .25);
  const reservationRows = activeRows.filter((row) => row.reservations >= 5 && row.contractsPerReservation !== null);
  const serviceRows = activeRows.filter((row) => row.services >= 5 && row.regularRate !== null);
  const reservationQ25 = percentile(reservationRows.map((row) => row.contractsPerReservation ?? NaN), .25);
  const regularQ25 = percentile(serviceRows.map((row) => row.regularRate ?? NaN), .25);
  const diaryAvg = avg(activeRows.map((row) => row.heavenDiaryPosts ?? 0));
  const addScore = (row: ReturnType<typeof aggregateDashboardCast>) => {
    const reasons: string[] = []; let score = 0;
    if (avgContractsDay !== null && row.contractsPerDay !== null && row.contractsPerDay >= avgContractsDay) { score++; reasons.push("成約/出勤日が平均以上"); }
    if (avgRegular !== null && row.regularRate !== null && row.regularRate >= avgRegular) { score++; reasons.push("本指名率が平均以上"); }
    if (row.source.town && row.townPv > 0 && townRows.length && avg(townRows.map((x) => x.pvPerDay ?? 0)) !== null && (row.pvPerDay ?? -1) >= avg(townRows.map((x) => x.pvPerDay ?? 0))!) { score++; reasons.push("Town PV/出勤日が平均以上"); }
    if (row.source.heaven && row.heavenPageAccess !== null && heavenRows.length && avg(heavenRows.map((x) => ratio(x.heavenPageAccess ?? 0, x.attendanceDays) ?? 0)) !== null && (ratio(row.heavenPageAccess ?? 0, row.attendanceDays) ?? -1) >= avg(heavenRows.map((x) => ratio(x.heavenPageAccess ?? 0, x.attendanceDays) ?? 0))!) { score++; reasons.push("Heavenアクセス/出勤日が平均以上"); }
    return { score, reasons };
  };
  const hidden = activeRows.filter((row) => activeMedianDays !== null && row.attendanceDays <= activeMedianDays && ((salesTop25 !== null && (row.salesPerDay ?? -1) >= salesTop25) || (rewardTop25 !== null && (row.rewardPerHour ?? -1) >= rewardTop25))).map((row) => ({ row, ...addScore(row), confidence: row.attendanceDays < 2 ? "LOW_SAMPLE" : "STANDARD" })).filter((x) => x.score >= 1);
  const attendance = activeRows.filter((row) => activeMedianDays !== null && row.attendanceDays <= activeMedianDays && salesTop25 !== null && (row.salesPerDay ?? -1) >= salesTop25 && ((avgContractsDay !== null && (row.contractsPerDay ?? -1) >= avgContractsDay) || (avgRegular !== null && (row.regularRate ?? -1) >= avgRegular) || (rewardTop25 !== null && (row.rewardPerHour ?? -1) >= rewardTop25))).map((row) => ({ row, confidence: row.attendanceDays < 2 ? "LOW_SAMPLE" : "STANDARD" }));
  const buried: DiscoveryIssue[] = [];
  for (const row of activeRows) {
    const exposureLow = (row.source.town && row.townPv > 0 && townPvTop25 !== null && (row.pvPerDay ?? Infinity) <= townPvTop25) || (row.source.heaven && row.heavenPageAccess !== null && heavenAccessTop25 !== null && (ratio(row.heavenPageAccess ?? 0, row.attendanceDays) ?? Infinity) <= heavenAccessTop25);
    if ((row.source.town || row.source.heaven) && exposureLow) buried.push({ row, label: "露出効率低下", reason: "媒体閲覧/出勤日の下位25%" });
    if (reservationQ25 !== null && row.reservations >= 5 && (row.contractsPerReservation ?? Infinity) <= reservationQ25) buried.push({ row, label: "接客転換低下", reason: "予約5件以上・成約/予約が下位25%" });
    if (regularQ25 !== null && row.services >= 5 && (row.regularRate ?? Infinity) <= regularQ25) buried.push({ row, label: "再指名課題", reason: "接客5件以上・本指名率が下位25%" });
    if (diaryAvg !== null && (row.heavenDiaryPosts ?? 0) >= diaryAvg && (row.source.town || row.source.heaven) && exposureLow) buried.push({ row, label: "活動効率低下", reason: "日記投稿が平均以上・媒体閲覧/出勤日が低位" });
  }
  const bottlenecks: DiscoveryIssue[] = [];
  for (const row of activeRows) {
    if ((row.source.town && row.townPv > 0 && townPvTop25 !== null && (row.pvPerDay ?? Infinity) <= townPvTop25) || (row.source.heaven && row.heavenPageAccess !== null && heavenAccessTop25 !== null && (ratio(row.heavenPageAccess ?? 0, row.attendanceDays) ?? Infinity) <= heavenAccessTop25)) bottlenecks.push({ row, label: "集客不足候補", reason: "媒体閲覧/出勤日の下位25%（参考指標）" });
    if (reservationQ25 !== null && row.reservations >= 5 && (row.contractsPerReservation ?? Infinity) <= reservationQ25) bottlenecks.push({ row, label: "予約後の成約不足候補", reason: "予約5件以上・成約/予約が下位25%" });
    if (regularQ25 !== null && row.services >= 5 && (row.regularRate ?? Infinity) <= regularQ25) bottlenecks.push({ row, label: "接客後の本指名不足候補", reason: "接客5件以上・本指名率が下位25%" });
    if (activeMedianDays !== null && row.attendanceDays <= activeMedianDays) bottlenecks.push({ row, label: "出勤不足候補", reason: "CTIアクティブ集団の中央値以下" });
  }
  const tags = rows.map((row) => ({ row, tags: tagMap.get(row.cast.id) ?? ["ACTIVE_ANALYZABLE"] }));
  return { tags, activeRows, townRows, heavenRows, hidden, attendance, buried, bottlenecks, thresholds: { activeMedianDays, salesTop25, rewardTop25, avgContractsDay, avgRegular, townPvTop25, heavenAccessTop25, reservationQ25, regularQ25, diaryAvg }, allCount: rows.length };
}

export type MarketingLabHypothesis = { row: ReturnType<typeof aggregateDashboardCast>; type: string; evidence: string; priority: "HIGH" | "MEDIUM" | "LOW"; priorityScore?: number; priorityLabel?: "最優先" | "優先" | "経過観察" | "データ不足"; recommendation: string };
export type MarketingEfficiencyClass = { row: ReturnType<typeof aggregateDashboardCast>; classification: "HIGH_ONLY" | "LOW_ONLY" | "MIXED" | "NEUTRAL"; strong: string[]; weak: string[] };

const quartile = (values: number[], p: number) => percentile(values, p);

function averageRows(rows: ReturnType<typeof aggregateDashboardCast>[]) {
  const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const avgNullable = (values: (number | null)[]) => { const valid = values.filter((value): value is number => value !== null && Number.isFinite(value)); return valid.length ? avg(valid) : null; };
  const perDay = (value: number | null, days: number) => value === null ? null : ratio(value, days);
  return {
    people: rows.length,
    attendanceDays: avg(rows.map((x) => x.attendanceDays)),
    attendanceHours: avg(rows.map((x) => x.attendanceMinutes / 60)),
    townPvPerDay: avgNullable(rows.map((x) => x.source.town ? perDay(x.townPv, x.attendanceDays) : null)),
    townUuPerDay: avgNullable(rows.map((x) => x.source.town ? perDay(x.townUu, x.attendanceDays) : null)),
    townTelPerDay: avgNullable(rows.map((x) => x.source.town ? perDay(x.townTel, x.attendanceDays) : null)),
    heavenAccessPerDay: avgNullable(rows.map((x) => x.source.heaven ? perDay(x.heavenPageAccess, x.attendanceDays) : null)),
    reservationsPerDay: avg(rows.map((x) => perDay(x.reservations, x.attendanceDays) ?? 0)),
    contractsPerDay: avg(rows.map((x) => x.contractsPerDay ?? 0)),
    salesPerDay: avg(rows.map((x) => x.salesPerDay ?? 0)),
    rewardPerDay: avg(rows.map((x) => x.rewardPerDay ?? 0)),
    regularRate: avg(rows.map((x) => x.regularRate ?? 0)),
    diaryPerDay: avgNullable(rows.map((x) => x.diaryCountCti === null ? null : perDay(x.diaryCountCti, x.attendanceDays))),
    heavenDiaryPerDay: avgNullable(rows.map((x) => x.source.heaven && x.heavenDiaryPosts !== null ? perDay(x.heavenDiaryPosts, x.attendanceDays) : null)),
    mitenePerDay: avgNullable(rows.map((x) => x.source.heaven && x.miteneSent !== null ? perDay(x.miteneSent, x.attendanceDays) : null)),
    okiniPerDay: avgNullable(rows.map((x) => x.source.heaven && x.okiniTalkSent !== null ? perDay(x.okiniTalkSent, x.attendanceDays) : null)),
    myGirlChange: avgNullable(rows.map((x) => x.myGirlChange)),
  };
}

export function analyzeMarketingLab(rows: ReturnType<typeof aggregateDashboardCast>[]) {
  const active = rows.filter((x) => x.source.cti && x.attendanceDays >= 2 && x.attendanceMinutes > 0);
  const highBase = active.filter((x) => x.attendanceDays >= 2);
  const salesTop = quartile(highBase.map((x) => x.salesPerDay ?? NaN), .75);
  const rewardTop = quartile(highBase.map((x) => x.rewardPerHour ?? NaN), .75);
  const contractTop = quartile(highBase.map((x) => x.contractsPerDay ?? NaN), .75);
  const regularTop = quartile(highBase.map((x) => x.regularRate ?? NaN), .75);
  const salesLow = quartile(highBase.map((x) => x.salesPerDay ?? NaN), .25);
  const rewardLow = quartile(highBase.map((x) => x.rewardPerHour ?? NaN), .25);
  const contractLow = quartile(highBase.map((x) => x.contractsPerDay ?? NaN), .25);
  const regularLow = quartile(highBase.map((x) => x.regularRate ?? NaN), .25);
  const medianDays = median(highBase.map((x) => x.attendanceDays));
  const townActive = active.filter((x) => x.source.town && (x.townPv > 0 || x.townUu > 0));
  const heavenActive = active.filter((x) => x.source.heaven && x.heavenPageAccess !== null && x.heavenPageAccess > 0);
  const townPvLow = quartile(townActive.map((x) => x.pvPerDay ?? NaN), .25);
  const heavenAccessLow = quartile(heavenActive.map((x) => ratio(x.heavenPageAccess ?? 0, x.attendanceDays) ?? NaN), .25);
  const diaryValue = (x: ReturnType<typeof aggregateDashboardCast>) => x.diaryCountCti === null && x.heavenDiaryPosts === null ? null : (x.diaryCountCti ?? 0) + (x.heavenDiaryPosts ?? 0);
  const activityValue = (x: ReturnType<typeof aggregateDashboardCast>) => x.miteneSent === null && x.okiniTalkSent === null && x.heavenDiaryPosts === null ? null : (x.miteneSent ?? 0) + (x.okiniTalkSent ?? 0) + (x.heavenDiaryPosts ?? 0);
  const diaryValues = active.map(diaryValue).filter((value): value is number => value !== null);
  const diaryHigh = quartile(diaryValues, .75) ?? 0;
  const diaryLow = quartile(diaryValues, .25) ?? 0;
  const diaryGroups = [
    { key: "0", label: "0件", rows: active.filter((x) => diaryValue(x) === 0) },
    { key: "1_5", label: "1〜5件", rows: active.filter((x) => { const n = diaryValue(x); return n !== null && n >= 1 && n <= 5; }) },
    { key: "6_10", label: "6〜10件", rows: active.filter((x) => { const n = diaryValue(x); return n !== null && n >= 6 && n <= 10; }) },
    { key: "11_20", label: "11〜20件", rows: active.filter((x) => { const n = diaryValue(x); return n !== null && n >= 11 && n <= 20; }) },
    { key: "21_plus", label: "21件以上", rows: active.filter((x) => { const n = diaryValue(x); return n !== null && n >= 21; }) },
  ].map((group) => ({ ...group, stats: averageRows(group.rows), warning: group.rows.length < 5 }));
  const activityGroups = [
    { key: "low", label: "活動量低", rows: active.filter((x) => { const n = activityValue(x); return n !== null && n < diaryLow; }) },
    { key: "high", label: "活動量高", rows: active.filter((x) => { const n = activityValue(x); return n !== null && n >= diaryHigh; }) },
    { key: "other", label: "中間", rows: active.filter((x) => { const n = activityValue(x); return n !== null && n >= diaryLow && n < diaryHigh; }) },
  ].map((group) => ({ ...group, stats: averageRows(group.rows), warning: group.rows.length < 5 }));
  const high = highBase.filter((x) => (salesTop !== null && (x.salesPerDay ?? -1) >= salesTop) || (rewardTop !== null && (x.rewardPerHour ?? -1) >= rewardTop) || (contractTop !== null && (x.contractsPerDay ?? -1) >= contractTop) || (regularTop !== null && (x.regularRate ?? -1) >= regularTop));
  const low = highBase.filter((x) => (salesLow !== null && (x.salesPerDay ?? Infinity) <= salesLow) || (rewardLow !== null && (x.rewardPerHour ?? Infinity) <= rewardLow) || (contractLow !== null && (x.contractsPerDay ?? Infinity) <= contractLow) || (regularLow !== null && (x.regularRate ?? Infinity) <= regularLow));
  const hypotheses: MarketingLabHypothesis[] = [];
  const activeAverage = averageRows(active);
  for (const row of active) {
    const diaryCount = diaryValue(row);
    const diaryPerDay = diaryCount === null ? null : ratio(diaryCount, row.attendanceDays);
    const pvPerDay = row.pvPerDay;
    if (diaryPerDay !== null && pvPerDay !== null && diaryPerDay <= diaryLow && townPvLow !== null && pvPerDay <= townPvLow) hypotheses.push({ row, type: "日記量不足候補", evidence: `日記/出勤日 ${diaryPerDay.toFixed(1)}、PV/出勤日 ${pvPerDay.toFixed(1)}`, priority: "MEDIUM", recommendation: "日記更新頻度の強化を検討" });
    if (diaryPerDay !== null && pvPerDay !== null && diaryPerDay >= (activeAverage.diaryPerDay ?? 0) && townPvLow !== null && pvPerDay <= townPvLow) hypotheses.push({ row, type: "日記内容見直し候補", evidence: `日記/出勤日 ${diaryPerDay.toFixed(1)}、PV/出勤日 ${pvPerDay.toFixed(1)}`, priority: "MEDIUM", recommendation: "内容・タイトル・更新時間の見直し余地" });
    const mitenePerDay = row.miteneSent === null ? null : ratio(row.miteneSent, row.attendanceDays); const accessPerDay = row.heavenPageAccess === null ? null : ratio(row.heavenPageAccess, row.attendanceDays);
    if (mitenePerDay !== null && accessPerDay !== null && heavenAccessLow !== null && mitenePerDay <= diaryLow && accessPerDay <= heavenAccessLow) hypotheses.push({ row, type: "Heaven接触強化候補", evidence: `ミテネ/出勤日 ${mitenePerDay.toFixed(1)}、アクセス/出勤日 ${accessPerDay.toFixed(1)}`, priority: "MEDIUM", recommendation: "ミテネ活用強化を検討" });
    if ((row.myGirl ?? 0) > 0 && (row.okiniTalkSent ?? 0) === 0 && (row.contractsPerDay ?? 0) <= (contractLow ?? 0)) hypotheses.push({ row, type: "オキニトーク活用候補", evidence: `マイガール ${row.myGirl}、オキニトーク 0、成約/日 ${numberValue(row.contractsPerDay)}`, priority: "LOW", recommendation: "オキニトーク活用の可能性を確認" });
    if (salesTop !== null && townPvLow !== null && (row.salesPerDay ?? 0) >= salesTop && row.pvPerDay !== null && row.pvPerDay <= townPvLow) hypotheses.push({ row, type: "露出強化候補", evidence: `売上/日 ${numberValue(row.salesPerDay)}、PV/日 ${numberValue(row.pvPerDay)}`, priority: "HIGH", recommendation: "特集掲載・露出強化の余地" });
    if (medianDays !== null && row.attendanceDays <= medianDays && salesTop !== null && (row.salesPerDay ?? -1) >= salesTop) hypotheses.push({ row, type: "出勤増加候補", evidence: `出勤日 ${row.attendanceDays}、売上/日 ${numberValue(row.salesPerDay)}`, priority: "HIGH", recommendation: "出勤増加を相談" });
  }
  const average = averageRows(active); const comparison = { high: averageRows(high), median: averageRows(highBase.filter((x) => medianDays !== null && x.attendanceDays <= medianDays)), low: averageRows(low) };
  const correlations = { diaryPv: pearson(active.map((x) => { const value = diaryValue(x); return value === null ? null : ratio(value, x.attendanceDays); }), active.map((x) => x.pvPerDay)), miteneAccess: pearson(active.map((x) => x.miteneSent === null ? null : ratio(x.miteneSent, x.attendanceDays)), active.map((x) => x.heavenPageAccess === null ? null : ratio(x.heavenPageAccess, x.attendanceDays))), pvSales: pearson(active.map((x) => x.pvPerDay), active.map((x) => x.salesPerDay)), attendanceSales: pearson(active.map((x) => x.attendanceDays), active.map((x) => x.sales)), regularReward: pearson(active.map((x) => x.regularRate), active.map((x) => x.rewardPerHour)) };
  const efficiencyClasses: MarketingEfficiencyClass[] = highBase.map((row) => {
    const strong = [(salesTop !== null && (row.salesPerDay ?? -1) >= salesTop) ? "売上/出勤日" : null, (rewardTop !== null && (row.rewardPerHour ?? -1) >= rewardTop) ? "女子報酬/出勤時間" : null, (contractTop !== null && (row.contractsPerDay ?? -1) >= contractTop) ? "成約/出勤日" : null, (regularTop !== null && (row.regularRate ?? -1) >= regularTop) ? "本指名率" : null].filter((x): x is string => Boolean(x));
    const weak = [(salesLow !== null && (row.salesPerDay ?? Infinity) <= salesLow) ? "売上/出勤日" : null, (rewardLow !== null && (row.rewardPerHour ?? Infinity) <= rewardLow) ? "女子報酬/出勤時間" : null, (contractLow !== null && (row.contractsPerDay ?? Infinity) <= contractLow) ? "成約/出勤日" : null, (regularLow !== null && (row.regularRate ?? Infinity) <= regularLow) ? "本指名率" : null].filter((x): x is string => Boolean(x));
    const classification = strong.length && weak.length ? "MIXED" : strong.length ? "HIGH_ONLY" : weak.length ? "LOW_ONLY" : "NEUTRAL";
    return { row, classification, strong, weak };
  });
  const scoredHypotheses = hypotheses.map((hypothesis) => {
    const metrics = efficiencyClasses.find((entry) => entry.row.cast.id === hypothesis.row.cast.id);
    const score = Math.min(100, (hypothesis.priority === "HIGH" ? 35 : hypothesis.priority === "MEDIUM" ? 20 : 10) + (metrics?.strong.length ?? 0) * 10 + (hypothesis.evidence.includes("/出勤日") ? 10 : 0) + (hypothesis.row.attendanceDays >= 5 ? 10 : 0));
    const priorityLabel = score >= 70 ? "最優先" : score >= 45 ? "優先" : score >= 25 ? "経過観察" : "データ不足";
    return { ...hypothesis, priorityScore: score, priorityLabel };
  });
  const grouped = new Map<string, MarketingLabHypothesis>();
  for (const hypothesis of scoredHypotheses) {
    const groupedType = hypothesis.type.startsWith("日記") ? "日記活動改善候補" : hypothesis.type;
    const key = `${hypothesis.row.cast.id}:${groupedType}`;
    const existing = grouped.get(key);
    const merged: MarketingLabHypothesis = existing ? { ...existing, evidence: [...new Set(`${existing.evidence} / ${hypothesis.evidence}`.split(" / "))].join(" / "), priorityScore: Math.max(existing.priorityScore ?? 0, hypothesis.priorityScore ?? 0), priorityLabel: ((existing.priorityScore ?? 0) >= (hypothesis.priorityScore ?? 0) ? existing.priorityLabel : hypothesis.priorityLabel) as MarketingLabHypothesis["priorityLabel"] } : { ...hypothesis, type: groupedType, priorityLabel: hypothesis.priorityLabel as MarketingLabHypothesis["priorityLabel"] };
    grouped.set(key, merged);
  }
  const groupedHypotheses = [...grouped.values()];
  return { active, high, low, efficiencyClasses, diaryGroups, activityGroups, comparison, hypotheses: groupedHypotheses, rawHypotheses: scoredHypotheses, correlations, thresholds: { medianDays, salesTop, rewardTop, contractTop, regularTop, salesLow, rewardLow, contractLow, regularLow, townPvLow, heavenAccessLow }, average };
}

function numberValue(value: number | null) { return value === null ? "—" : value.toFixed(2); }
function pearson(a: (number | null)[], b: (number | null)[]) {
  const pairs = a.map((value, i) => [value, b[i]] as const).filter((pair): pair is readonly [number, number] => pair[0] !== null && pair[1] !== null && Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
  if (pairs.length < 5) return { value: null, n: pairs.length };
  const ax = pairs.reduce((s, p) => s + p[0], 0) / pairs.length; const bx = pairs.reduce((s, p) => s + p[1], 0) / pairs.length; const numerator = pairs.reduce((s, p) => s + (p[0] - ax) * (p[1] - bx), 0); const da = Math.sqrt(pairs.reduce((s, p) => s + (p[0] - ax) ** 2, 0)); const db = Math.sqrt(pairs.reduce((s, p) => s + (p[1] - bx) ** 2, 0)); return { value: da && db ? numerator / (da * db) : null, n: pairs.length };
}
