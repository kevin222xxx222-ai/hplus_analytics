import type { MetricDefinition } from "./metric-types";

const d = (metricKey: string, label: string, source: string, dbModel: string, dbColumn: string, unit: string, valueKind: MetricDefinition["valueKind"], aggregation: MetricDefinition["aggregation"], notes = ""): MetricDefinition => ({ metricKey, label, shortLabel: label, description: `${label}の分析指標です。`, source, dbModel, dbColumn, grain: ["day", "store", "cast", "weekday", "period"], unit, valueKind, availability: ["VALUE", "ZERO", "MISSING", "UNAVAILABLE", "UNCOMPUTABLE", "INSUFFICIENT_SAMPLE"], aggregation, additive: aggregation === "sum", crossMediaAdditive: false, display: unit === "円" ? "currency" : unit === "%" ? "percent" : "integer", notes });

export const METRIC_REGISTRY: Record<string, MetricDefinition> = {
  ctiDiaryPostCount: d("ctiDiaryPostCount", "CTI写メ日記投稿数", "CTI女子別レポート", "CtiCastDaily", "diaryCountCti", "件", "DAILY_EVENT", "sum"),
  ctiSales: d("ctiSales", "CTI売上", "CTI女子別レポート", "CtiCastDaily", "salesAmount", "円", "DAILY_EVENT", "sum"),
  ctiCompensation: d("ctiCompensation", "CTI女子報酬", "CTI女子別レポート", "CtiCastDaily", "castRewardAmount", "円", "DAILY_EVENT", "sum"),
  ctiReservations: d("ctiReservations", "CTI予約数", "CTI女子別レポート", "CtiCastDaily", "reservationCount", "件", "DAILY_EVENT", "sum"),
  ctiReceptions: d("ctiReceptions", "CTI接客数", "CTI女子別レポート", "CtiCastDaily", "serviceCount", "件", "DAILY_EVENT", "sum"),
  ctiNominationCount: d("ctiNominationCount", "CTI本指名数", "CTI女子別レポート", "CtiCastDaily", "regularNominationCount", "件", "DAILY_EVENT", "sum"),
  ctiAttendanceCount: d("ctiAttendanceCount", "CTI出勤人数", "CTI女子別レポート", "CtiCastDaily", "attendanceCount", "人", "DAILY_EVENT", "sum"),
  ctiWorkHours: d("ctiWorkHours", "CTI出勤時間", "CTI女子別レポート", "CtiCastDaily", "attendanceMinutes", "時間", "DAILY_EVENT", "sum"),
  townStorePv: d("townStorePv", "Town店舗PV", "Town店舗CSV", "TownStoreDaily", "pv", "PV", "DAILY_EVENT", "sum"),
  townStoreUu: d("townStoreUu", "Town店舗UU", "Town店舗CSV", "TownStoreDaily", "uu", "UU", "DAILY_EVENT", "sum"),
  townStoreTel: d("townStoreTel", "Town店舗TEL", "Town店舗CSV", "TownStoreDaily", "telTapUu", "件", "DAILY_EVENT", "sum"),
  townCastPagePv: d("townCastPagePv", "TownキャストページPV", "Town女子別CSV", "TownCastDaily", "pv", "PV", "DAILY_EVENT", "sum"),
  townCastPageUu: d("townCastPageUu", "TownキャストページUU", "Town女子別CSV", "TownCastDaily", "uu", "UU", "DAILY_EVENT", "sum"),
  townCastPageTel: d("townCastPageTel", "TownキャストページTEL", "Town女子別CSV", "TownCastDaily", "telTapUu", "件", "DAILY_EVENT", "sum"),
  townDiaryPv: d("townDiaryPv", "Town写メ日記PV", "Town URL CSV", "TownUrlDaily", "pv", "PV", "DAILY_EVENT", "sum", "CAST_DIARYのみ。castIdなしはキャスト別に推測紐付けしない。"),
  townDiaryUu: d("townDiaryUu", "Town写メ日記ページUU", "Town URL CSV", "TownUrlDaily", "uu", "UU", "DAILY_EVENT", "sum"),
  townDiaryTel: d("townDiaryTel", "Town写メ日記ページTEL", "Town URL CSV", "TownUrlDaily", "telTapUu", "件", "DAILY_EVENT", "sum"),
  townUrlTotalPv: d("townUrlTotalPv", "Town URL全体PV", "Town URL CSV", "TownUrlDaily", "pv", "PV", "DAILY_EVENT", "sum", "ページ種別を混在させるため用途を明示する。"),
  heavenGirlPageAccess: d("heavenGirlPageAccess", "Heaven女の子ページアクセス", "Heaven女子アクセスCSV", "HeavenCastDaily", "rawValue(page_access)", "件", "DAILY_EVENT", "sum"),
  heavenDiaryPostCount: d("heavenDiaryPostCount", "Heaven写メ日記投稿数", "Heaven女子日記CSV", "HeavenCastDaily", "rawValue(diary_posts)", "件", "DAILY_EVENT", "sum"),
  heavenMiteneSent: d("heavenMiteneSent", "Heavenミテネ送信数", "Heaven女子ミテネCSV", "HeavenCastDaily", "rawValue(mitene_sent)", "件", "DAILY_EVENT", "sum"),
  heavenMyGirlCount: d("heavenMyGirlCount", "Heavenマイガール数", "Heaven女子マイガールCSV", "HeavenCastDaily", "rawValue(my_girl)", "人", "SNAPSHOT", "snapshot"),
  heavenDiaryNoticeCount: d("heavenDiaryNoticeCount", "Heaven写メ日記通知数", "Heaven女子日記通知CSV", "HeavenCastDaily", "rawValue(diary_notice)", "件", "SNAPSHOT", "snapshot"),
  heavenAttendanceNoticeCount: d("heavenAttendanceNoticeCount", "Heaven出勤通知数", "Heaven女子出勤通知CSV", "HeavenCastDaily", "rawValue(attendance_notice)", "件", "SNAPSHOT", "snapshot"),
  mediaExposureReference: d("mediaExposureReference", "媒体露出参考値", "Town／Heaven", "Derived", "townCastPagePv + heavenGirlPageAccess", "参考値", "DERIVED", "reference", "媒体定義が異なるため正式な合計PVではない。"),
  salesPerWorkHour: d("salesPerWorkHour", "売上／出勤時間", "CTI", "Derived", "sales / workHours", "円/時間", "DERIVED", "ratio"),
  compensationPerWorkHour: d("compensationPerWorkHour", "女子報酬／出勤時間", "CTI", "Derived", "compensation / workHours", "円/時間", "DERIVED", "ratio"),
  reservationPerWorkHour: d("reservationPerWorkHour", "予約／出勤時間", "CTI", "Derived", "reservations / workHours", "件/時間", "DERIVED", "ratio"),
  salesPerTownUu: d("salesPerTownUu", "売上／Town UU", "CTI／Town", "Derived", "sales / townUu", "円/UU", "DERIVED", "ratio", "相関・比較指標であり因果を示さない。"),
  salesPerTownDiaryPv: d("salesPerTownDiaryPv", "売上／Town写メ日記PV", "CTI／Town URL", "Derived", "sales / townDiaryPv", "円/PV", "DERIVED", "ratio", "相関・比較指標であり因果を示さない。"),
  reservationPerTownUu: d("reservationPerTownUu", "予約／Town UU", "CTI／Town", "Derived", "reservations / townUu", "件/UU", "DERIVED", "ratio"),
  reservationPerTownDiaryPv: d("reservationPerTownDiaryPv", "予約／Town写メ日記PV", "CTI／Town URL", "Derived", "reservations / townDiaryPv", "件/PV", "DERIVED", "ratio"),
  diaryPvPerPost: d("diaryPvPerPost", "Town写メ日記PV／投稿活動", "Town／CTI・Heaven", "Derived", "townDiaryPv / diaryPostActivityReference", "PV/投稿", "DERIVED", "ratio"),
  castPagePvPerDiaryPv: d("castPagePvPerDiaryPv", "TownキャストページPV／Town写メ日記PV", "Town URL", "Derived", "townCastPagePv / townDiaryPv", "比率", "DERIVED", "ratio"),
};

export const getMetricDefinition = (key: string) => METRIC_REGISTRY[key];
