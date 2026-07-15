export type CtiColumnClassification = "ADOPTED" | "FUTURE_CANDIDATE" | "INTENTIONALLY_UNUSED";
export type CtiColumnDataType = "TEXT" | "INTEGER_COUNT" | "DECIMAL_HOURS" | "MONEY";

export type CtiColumnCatalogEntry = {
  sourceName: string | null;
  internalName: string;
  classification: CtiColumnClassification;
  destination: string | null;
  dataType: CtiColumnDataType;
  negativeAllowed: boolean;
  currentlyUsed: boolean;
  futureUse: string | null;
  note: string;
};

const adopted = (sourceName: string | null, internalName: string, destination: string, dataType: CtiColumnDataType, negativeAllowed: boolean, note: string): CtiColumnCatalogEntry => ({
  sourceName, internalName, classification: "ADOPTED", destination, dataType, negativeAllowed, currentlyUsed: true, futureUse: null, note,
});

const future = (sourceName: string, internalName: string, dataType: CtiColumnDataType, negativeAllowed: boolean, futureUse: string, note = "既知列として検証するが、Phase 2では保存しない。") : CtiColumnCatalogEntry => ({
  sourceName, internalName, classification: "FUTURE_CANDIDATE", destination: null, dataType, negativeAllowed, currentlyUsed: false, futureUse, note,
});

const unused = (sourceName: string, internalName: string, dataType: CtiColumnDataType, negativeAllowed: boolean, note: string): CtiColumnCatalogEntry => ({
  sourceName, internalName, classification: "INTENTIONALLY_UNUSED", destination: null, dataType, negativeAllowed, currentlyUsed: false, futureUse: null, note,
});

export const CTI_COLUMN_CATALOG: readonly CtiColumnCatalogEntry[] = [
  adopted(null, "cast_name", "CastAlias/Cast解決", "TEXT", false, "A1空欄。安全推定成立時だけ仮想CAST_NAMEとして使用。"),
  adopted("出勤数", "attendance_count", "CtiCastDaily.attendanceCount", "INTEGER_COUNT", false, "出勤日数エイリアスも同じ保存先。"),
  adopted("本指名数", "regular_nomination_count", "CtiCastDaily.regularNominationCount", "INTEGER_COUNT", false, "正式集計対象。"),
  adopted("写真指名数", "photo_nomination_count", "CtiCastDaily.photoNominationCount", "INTEGER_COUNT", false, "正式集計対象。"),
  adopted("フリー数", "free_count", "CtiCastDaily.freeCount", "INTEGER_COUNT", false, "正式集計対象。"),
  adopted("予約数", "reservation_count", "CtiCastDaily.reservationCount", "INTEGER_COUNT", false, "接客数再計算の構成値。"),
  future("事前予約数", "advance_reservation_count", "INTEGER_COUNT", false, "予約リードタイム分析"),
  future("当日予約数", "same_day_reservation_count", "INTEGER_COUNT", false, "当日予約比率分析"),
  future("新規予約数", "new_reservation_count", "INTEGER_COUNT", false, "新規予約転換分析"),
  unused("リピート数", "repeat_reservation_count_unverified", "INTEGER_COUNT", false, "意味が成約内訳と異なるためrepeat_countへ流用しない。"),
  adopted("成約数", "source_contract_count", "CtiCastDaily.sourceContractCount", "INTEGER_COUNT", false, "CTI元値。再計算値とは分離。"),
  future("事前成約数", "advance_contract_count", "INTEGER_COUNT", false, "事前予約成約分析"),
  future("当日成約数", "same_day_contract_count", "INTEGER_COUNT", false, "当日成約分析"),
  adopted("新規成約数", "new_count", "CtiCastDaily.newCount", "INTEGER_COUNT", false, "正式な新規成約内訳。"),
  adopted("リピート成約数", "repeat_count", "CtiCastDaily.repeatCount", "INTEGER_COUNT", false, "正式なリピート成約内訳。"),
  future("カード数", "card_count", "INTEGER_COUNT", false, "カード利用件数分析"),
  adopted("キャンセル数", "cancellation_count", "CtiCastDaily.cancellationCount", "INTEGER_COUNT", false, "接客数再計算の構成値。"),
  future("事前予約のキャンセル数", "advance_reservation_cancellation_count", "INTEGER_COUNT", false, "予約区分別キャンセル分析"),
  future("当日予約のキャンセル数", "same_day_reservation_cancellation_count", "INTEGER_COUNT", false, "予約区分別キャンセル分析"),
  future("新規予約のキャンセル数", "new_reservation_cancellation_count", "INTEGER_COUNT", false, "新規予約キャンセル分析"),
  future("リピート予約のキャンセル数", "repeat_reservation_cancellation_count", "INTEGER_COUNT", false, "リピート予約キャンセル分析"),
  future("悪質キャンセル数", "malicious_cancellation_count", "INTEGER_COUNT", false, "悪質キャンセル分析"),
  future("事前予約の悪質キャンセル数", "advance_malicious_cancellation_count", "INTEGER_COUNT", false, "予約区分別悪質キャンセル分析"),
  future("当日予約の悪質キャンセル数", "same_day_malicious_cancellation_count", "INTEGER_COUNT", false, "予約区分別悪質キャンセル分析"),
  future("新規予約の悪質キャンセル数", "new_malicious_cancellation_count", "INTEGER_COUNT", false, "新規区分の悪質キャンセル分析"),
  future("リピート予約の悪質キャンセル数", "repeat_malicious_cancellation_count", "INTEGER_COUNT", false, "リピート区分の悪質キャンセル分析"),
  future("キャンセル数(店事由)", "store_reason_cancellation_count", "INTEGER_COUNT", false, "キャンセル事由分析"),
  future("事前予約のキャンセル数(店事由)", "advance_store_reason_cancellation_count", "INTEGER_COUNT", false, "予約区分・事由分析"),
  future("当日予約のキャンセル数(店事由)", "same_day_store_reason_cancellation_count", "INTEGER_COUNT", false, "予約区分・事由分析"),
  future("新規予約のキャンセル数(店事由)", "new_store_reason_cancellation_count", "INTEGER_COUNT", false, "予約区分・事由分析"),
  future("リピート予約のキャンセル数(店事由)", "repeat_store_reason_cancellation_count", "INTEGER_COUNT", false, "予約区分・事由分析"),
  future("キャンセル数(女子事由)", "cast_reason_cancellation_count", "INTEGER_COUNT", false, "キャンセル事由分析"),
  future("事前予約のキャンセル数(女子事由)", "advance_cast_reason_cancellation_count", "INTEGER_COUNT", false, "予約区分・事由分析"),
  future("当日予約のキャンセル数(女子事由)", "same_day_cast_reason_cancellation_count", "INTEGER_COUNT", false, "予約区分・事由分析"),
  future("新規予約のキャンセル数(女子事由)", "new_cast_reason_cancellation_count", "INTEGER_COUNT", false, "予約区分・事由分析"),
  future("リピート予約のキャンセル数(女子事由)", "repeat_cast_reason_cancellation_count", "INTEGER_COUNT", false, "予約区分・事由分析"),
  adopted("女子報酬", "cast_reward_amount", "CtiCastDaily.castRewardAmount", "MONEY", true, "CTI元値。報酬系負数を許容。"),
  future("報酬補正", "reward_adjustment_amount", "MONEY", true, "報酬補正分析"),
  future("送り代", "transport_fee_amount", "MONEY", true, "費用内訳分析"),
  future("寮費", "dormitory_fee_amount", "MONEY", true, "費用内訳分析"),
  future("自走費", "self_transport_fee_amount", "MONEY", true, "費用内訳分析"),
  future("託児所代", "childcare_fee_amount", "MONEY", true, "費用内訳分析"),
  future("雑費", "miscellaneous_fee_amount", "MONEY", true, "費用内訳分析"),
  adopted("有料オプション数", "paid_option_count", "CtiCastDaily.paidOptionCount", "INTEGER_COUNT", false, "正式集計対象。"),
  future("有料オプション料金", "paid_option_sales_amount", "MONEY", true, "オプション売上分析"),
  future("有料オプション報酬", "paid_option_reward_amount", "MONEY", true, "オプション報酬分析"),
  adopted("利益", "cti_profit_amount", "CtiCastDaily.ctiProfitAmount", "MONEY", true, "CTI元値。利益の負数を正常値として許容。"),
  future("求人広告費", "recruitment_advertising_amount", "MONEY", true, "求人費用分析"),
  adopted("出勤時間", "attendance_minutes", "CtiCastDaily.attendanceMinutes", "DECIMAL_HOURS", false, "10進時間またはExcel時刻を分換算。"),
  future("ネット指名数", "online_nomination_count", "INTEGER_COUNT", false, "指名経路分析"),
  future("姫予約数", "direct_cast_reservation_count", "INTEGER_COUNT", false, "姫予約分析"),
  future("その他指名数", "other_nomination_count", "INTEGER_COUNT", false, "指名区分分析"),
  future("その他2指名数", "other_2_nomination_count", "INTEGER_COUNT", false, "指名区分分析"),
  adopted("料金", "sales_amount", "CtiCastDaily.salesAmount", "MONEY", true, "CTI売上元値。料金系負数を許容。"),
  future("料金補正", "sales_adjustment_amount", "MONEY", true, "売上補正分析"),
  future("料金(カード)", "card_sales_amount", "MONEY", true, "カード売上分析"),
  future("手数料", "commission_amount", "MONEY", true, "手数料分析"),
  future("新規予約料金", "new_reservation_sales_amount", "MONEY", true, "新規予約売上分析"),
  future("割引額", "discount_amount", "MONEY", true, "割引分析"),
  future("お店負担", "store_burden_amount", "MONEY", true, "店舗負担分析"),
  future("60(本数)", "course_60_count", "INTEGER_COUNT", false, "コース構成分析"),
  future("60(料金)", "course_60_sales_amount", "MONEY", true, "コース売上分析"),
  future("60(報酬)", "course_60_reward_amount", "MONEY", true, "コース報酬分析"),
  future("90(本数)", "course_90_count", "INTEGER_COUNT", false, "コース構成分析"),
  future("90(料金)", "course_90_sales_amount", "MONEY", true, "コース売上分析"),
  future("90(報酬)", "course_90_reward_amount", "MONEY", true, "コース報酬分析"),
  future("120(本数)", "course_120_count", "INTEGER_COUNT", false, "コース構成分析"),
  future("120(料金)", "course_120_sales_amount", "MONEY", true, "コース売上分析"),
  future("120(報酬)", "course_120_reward_amount", "MONEY", true, "コース報酬分析"),
  future("150(本数)", "course_150_count", "INTEGER_COUNT", false, "コース構成分析"),
  future("150(料金)", "course_150_sales_amount", "MONEY", true, "コース売上分析"),
  future("150(報酬)", "course_150_reward_amount", "MONEY", true, "コース報酬分析"),
  adopted("写メ日記数", "diary_count_cti", "CtiCastDaily.diaryCountCti", "INTEGER_COUNT", false, "正式集計対象。"),
  adopted("当日欠勤数", "same_day_absence_count", "CtiCastDaily.sameDayAbsenceCount", "INTEGER_COUNT", false, "正式集計対象。"),
] as const;

export const CTI_NAMED_COLUMN_CATALOG = new Map(
  CTI_COLUMN_CATALOG.flatMap((definition) => definition.sourceName ? [[definition.sourceName, definition] as const] : []),
);
