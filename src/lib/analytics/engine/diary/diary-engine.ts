import { confidenceForSample } from "../constants";
import type { Availability } from "../types";
import type { DiaryCause, DiaryCauseCandidate, DiaryInputRow, DiaryMetric, DiaryRecommendedAction, DiarySummary, DiaryWeekdaySummary } from "./diary-types";

const LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const sum = (rows: DiaryInputRow[], key: keyof DiaryInputRow): DiaryMetric => {
  const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return { value: null, availability: "MISSING" };
  const value = values.reduce((total, item) => total + item, 0);
  return { value, availability: value === 0 ? "ZERO" : "VALUE" };
};
const ratio = (a: DiaryMetric, b: DiaryMetric): DiaryMetric => {
  if (a.value === null || b.value === null) return { value: null, availability: "MISSING" };
  if (b.value === 0) return { value: null, availability: "UNCOMPUTABLE" };
  const value = a.value / b.value;
  return { value, availability: value === 0 ? "ZERO" : "VALUE" };
};
const dayOf = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`).getUTCDay();
const confidence = (days: number) => confidenceForSample(days);

export function summarizeDiary(rows: DiaryInputRow[]): DiarySummary {
  const unique = [...new Map(rows.map((row) => [row.naturalKey, row])).values()];
  const days = new Set(unique.map((row) => row.date.slice(0, 10))).size;
  const cti = sum(unique, "ctiDiaryPostCount");
  const heaven = sum(unique, "heavenDiaryPostCount");
  const posts = cti.value === null && heaven.value === null ? { value: null, availability: "MISSING" as Availability } : { value: (cti.value ?? 0) + (heaven.value ?? 0), availability: cti.availability === "ZERO" && heaven.availability === "ZERO" ? "ZERO" as Availability : "VALUE" as Availability };
  const diaryPv = sum(unique, "townDiaryPv");
  const diaryUu = sum(unique, "townDiaryUu");
  const diaryTel = sum(unique, "townDiaryTel");
  const castPv = sum(unique, "townCastPagePv");
  const castUu = sum(unique, "townCastPageUu");
  const storePv = sum(unique, "townStorePv");
  const storeUu = sum(unique, "townStoreUu");
  const sales = sum(unique, "sales");
  const compensation = sum(unique, "compensation");
  const reservations = sum(unique, "reservations");
  const contracts = sum(unique, "contracts");
  const attendance = sum(unique, "attendanceCount");
  const hours = sum(unique, "workHours");
  const efficiencies = {
    townDiaryPvPerPost: ratio(diaryPv, posts),
    townDiaryUuPerPost: ratio(diaryUu, posts),
    townCastPagePvPerDiaryPv: ratio(castPv, diaryPv),
    reservationsPerDiaryPv: ratio(reservations, diaryPv),
    salesPerDiaryPv: ratio(sales, diaryPv),
    salesPerTownUu: ratio(sales, storeUu),
    reservationsPerTownUu: ratio(reservations, storeUu),
    salesPerWorkHour: ratio(sales, hours),
  };
  const availability = unique.length === 0 ? "MISSING" : "VALUE";
  return { sampleDays: days, ctiDiaryPostCount: cti, heavenDiaryPostCount: heaven, diaryPostActivityReference: posts, townDiaryPv: diaryPv, townDiaryUu: diaryUu, townDiaryTel: diaryTel, townCastPagePv: castPv, townCastPageUu: castUu, townStorePv: storePv, townStoreUu: storeUu, sales, compensation, reservations, contracts, attendanceCount: attendance, workHours: hours, efficiencies, availability, confidence: confidence(days) };
}

const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); if (!sorted.length) return null; const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const metricMedian = (items: DiarySummary[], key: keyof DiarySummary): DiaryMetric => { const values = items.map((item) => item[key] as DiaryMetric).map((item) => item.value).filter((value): value is number => value !== null && Number.isFinite(value)); const value = median(values); return { value, availability: value === null ? "MISSING" : value === 0 ? "ZERO" : "VALUE" }; };
const CAUSE_LABELS: Record<DiaryCause, string> = { STORE_TRAFFIC_LOW: "店舗ページ流入が少ない", STORE_UU_LOW: "店舗訪問者数が少ない", DIARY_POST_ACTIVITY_LOW: "写メ日記投稿活動が少ない", DIARY_EXPOSURE_LOW: "写メ日記閲覧が少ない", DIARY_UU_LOW: "写メ日記訪問者数が少ない", CAST_PAGE_EXPOSURE_LOW: "キャストページ閲覧が少ない", PROFILE_TRANSITION_LOW: "写メ日記からプロフィールへの接続が弱い", UU_LOW: "訪問者数が少ない", ATTENDANCE_LOW: "出勤人数が少ない", WORK_HOURS_LOW: "出勤時間が少ない", RESERVATION_CONVERSION_LOW: "閲覧から予約への転換が弱い", RECEPTION_CONVERSION_LOW: "予約から成約への転換が弱い", SALES_PER_RESERVATION_LOW: "予約あたり売上が低い", UNIT_PRICE_LOW: "平均単価が低い", DATA_INSUFFICIENT: "データ不足", STABLE: "安定" };
const ACTIONS: Record<DiaryCause, DiaryRecommendedAction["code"]> = { STORE_TRAFFIC_LOW: "REVIEW_STORE_EXPOSURE", STORE_UU_LOW: "REVIEW_STORE_EXPOSURE", DIARY_POST_ACTIVITY_LOW: "INCREASE_DIARY_POSTING", DIARY_EXPOSURE_LOW: "REVIEW_DIARY_CONTENT", DIARY_UU_LOW: "REVIEW_DIARY_CONTENT", CAST_PAGE_EXPOSURE_LOW: "REVIEW_PROFILE_CONTENT", PROFILE_TRANSITION_LOW: "REVIEW_PROFILE_CONTENT", UU_LOW: "REVIEW_STORE_EXPOSURE", ATTENDANCE_LOW: "REQUEST_ADDITIONAL_ATTENDANCE", WORK_HOURS_LOW: "EXTEND_WORK_HOURS", RESERVATION_CONVERSION_LOW: "REVIEW_RESERVATION_ROUTE", RECEPTION_CONVERSION_LOW: "REVIEW_RESERVATION_ROUTE", SALES_PER_RESERVATION_LOW: "REVIEW_PRICING_OR_COURSE_MIX", UNIT_PRICE_LOW: "REVIEW_PRICING_OR_COURSE_MIX", DATA_INSUFFICIENT: "CHECK_DATA_IMPORT", STABLE: "CHECK_DATA_IMPORT" };
const ACTION_TITLES: Record<DiaryRecommendedAction["code"], string> = { REVIEW_STORE_EXPOSURE: "店舗ページの露出状況を確認", INCREASE_DIARY_POSTING: "写メ日記更新を増やす", REVIEW_DIARY_CONTENT: "写メ日記の内容・投稿時間を見直す", REVIEW_PROFILE_CONTENT: "プロフィール内容を見直す", REQUEST_ADDITIONAL_ATTENDANCE: "追加出勤を相談する", EXTEND_WORK_HOURS: "出勤時間の延長を相談する", REVIEW_RESERVATION_ROUTE: "予約導線を確認する", REVIEW_PRICING_OR_COURSE_MIX: "料金・コース構成を確認する", CHECK_DATA_IMPORT: "取込状況を確認" };
export function analyzeDiaryWeekdays(rows: DiaryInputRow[]): DiaryWeekdaySummary[] {
  const summaries = Array.from({ length: 7 }, (_, weekday) => ({ weekday, label: LABELS[weekday], ...summarizeDiary(rows.filter((row) => dayOf(row.date) === weekday)) }));
  const summaryOnly = summaries as Array<DiaryWeekdaySummary & DiarySummary>;
  const salesMedian = metricMedian(summaryOnly, "sales"); const storeUuMedian = metricMedian(summaryOnly, "townStoreUu"); const diaryPvMedian = metricMedian(summaryOnly, "townDiaryPv"); const castPagePvMedian = metricMedian(summaryOnly, "townCastPagePv");
  const makeCandidate = (code: DiaryCause, priority: number, evidence: string[], item: DiarySummary): DiaryCauseCandidate => ({ code, label: CAUSE_LABELS[code], description: "因果を断定せず、確認優先度を示す参考候補です。", priority, score: Math.min(100, priority), severity: priority >= 80 ? "HIGH" : priority >= 50 ? "MEDIUM" : "LOW", evidence, relatedMetricKeys: evidence.map(() => code === "DIARY_EXPOSURE_LOW" ? "townDiaryPv" : code === "STORE_UU_LOW" ? "townStoreUu" : code === "CAST_PAGE_EXPOSURE_LOW" ? "townCastPagePv" : code === "ATTENDANCE_LOW" ? "attendanceCount" : "sales"), availability: item.availability, confidence: item.confidence, isPrimary: false });
  const actionFor = (candidate: DiaryCauseCandidate): DiaryRecommendedAction => { const code = ACTIONS[candidate.code]; return { code, title: ACTION_TITLES[code], description: "根拠指標を確認したうえで、改善余地を検討してください。", priority: candidate.priority, score: candidate.score, evidence: candidate.evidence, relatedCauseCodes: [candidate.code], relatedMetricKeys: candidate.relatedMetricKeys, availability: candidate.availability, confidence: candidate.confidence }; };
  return summaries.map((item) => {
    const candidates: DiaryCauseCandidate[] = [];
    if (item.confidence === "Insufficient" || item.sales.value === null) candidates.push(makeCandidate("DATA_INSUFFICIENT", 100, ["曜日サンプルまたは売上データが不足しています"], item));
    else if (salesMedian.value !== null && item.sales.value < salesMedian.value) {
      if (storeUuMedian.value !== null && item.townStoreUu.value !== null && item.townStoreUu.value < storeUuMedian.value) candidates.push(makeCandidate("STORE_UU_LOW", 90, ["売上が曜日中央値未満", "Town店舗UUも中央値未満"], item));
      if (diaryPvMedian.value !== null && item.townDiaryPv.value !== null && item.townDiaryPv.value < diaryPvMedian.value) candidates.push(makeCandidate("DIARY_EXPOSURE_LOW", 80, ["売上が曜日中央値未満", "Town写メ日記PVも中央値未満"], item));
      if (castPagePvMedian.value !== null && item.townCastPagePv.value !== null && item.townCastPagePv.value < castPagePvMedian.value) candidates.push(makeCandidate("CAST_PAGE_EXPOSURE_LOW", 70, ["売上が曜日中央値未満", "TownキャストページPVも中央値未満"], item));
      if (item.attendanceCount.value === 0) candidates.push(makeCandidate("ATTENDANCE_LOW", 60, ["対象曜日の出勤人数が0です"], item));
      if (item.workHours.value === 0) candidates.push(makeCandidate("WORK_HOURS_LOW", 55, ["対象曜日の出勤時間が0です"], item));
      if (item.reservations.value !== null && item.townStoreUu.value && item.reservations.value / item.townStoreUu.value < 0.01) candidates.push(makeCandidate("RESERVATION_CONVERSION_LOW", 40, ["閲覧から予約への転換は参考指標です"], item));
    }
    if (!candidates.length) candidates.push(makeCandidate("STABLE", 0, ["重大な低下候補は確認されませんでした"], item));
    candidates.sort((a, b) => b.priority - a.priority); candidates[0].isPrimary = true;
    const actions = candidates.filter((candidate) => candidate.code !== "STABLE").map(actionFor);
    return { ...item, causeCandidates: candidates, primaryCause: candidates[0].code, recommendedActions: actions, primaryAction: actions[0] ?? null, comparisonContext: { salesMedian, storeUuMedian, diaryPvMedian, castPagePvMedian } };
  });
}

export { ratio as safeDiaryRatio };
