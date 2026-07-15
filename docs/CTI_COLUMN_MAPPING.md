# CTI列マッピング

更新日: 2026-07-14

実運用 `女子別レポート_20260713.xlsx` の全74列を列カタログとして管理します。分類はADOPTED 17列、FUTURE_CANDIDATE 56列、INTENTIONALLY_UNUSED 1列です。FUTURE_CANDIDATEとINTENTIONALLY_UNUSEDも既知列として型・負数を検証しますが、CtiCastDailyへは保存しません。

| 元列名 | 内部識別名 | 分類 | 現在の保存先 | データ型 | 負数 | 利用中 | 将来用途 | 備考 |
|---|---|---|---|---|---|---|---|---|
| A列（A1空欄） | cast_name | ADOPTED | CastAlias/Cast解決 | TEXT | 不可 | はい | — | 安全推定時だけCAST_NAME化 |
| 出勤数 | attendance_count | ADOPTED | CtiCastDaily.attendanceCount | INTEGER_COUNT | 不可 | はい | — | 出勤日数も同じ保存先 |
| 本指名数 | regular_nomination_count | ADOPTED | CtiCastDaily.regularNominationCount | INTEGER_COUNT | 不可 | はい | — | 正式集計 |
| 写真指名数 | photo_nomination_count | ADOPTED | CtiCastDaily.photoNominationCount | INTEGER_COUNT | 不可 | はい | — | 正式集計 |
| フリー数 | free_count | ADOPTED | CtiCastDaily.freeCount | INTEGER_COUNT | 不可 | はい | — | 正式集計 |
| 予約数 | reservation_count | ADOPTED | CtiCastDaily.reservationCount | INTEGER_COUNT | 不可 | はい | — | 接客数再計算の構成値 |
| 事前予約数 | advance_reservation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 予約リードタイム | 検証のみ |
| 当日予約数 | same_day_reservation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 当日予約比率 | 検証のみ |
| 新規予約数 | new_reservation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 新規予約転換 | 検証のみ |
| リピート数 | repeat_reservation_count_unverified | INTENTIONALLY_UNUSED | — | INTEGER_COUNT | 不可 | いいえ | — | repeat_countへ流用しない |
| 成約数 | source_contract_count | ADOPTED | CtiCastDaily.sourceContractCount | INTEGER_COUNT | 不可 | はい | — | CTI元値 |
| 事前成約数 | advance_contract_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 事前成約分析 | 検証のみ |
| 当日成約数 | same_day_contract_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 当日成約分析 | 検証のみ |
| 新規成約数 | new_count | ADOPTED | CtiCastDaily.newCount | INTEGER_COUNT | 不可 | はい | — | 正式成約内訳 |
| リピート成約数 | repeat_count | ADOPTED | CtiCastDaily.repeatCount | INTEGER_COUNT | 不可 | はい | — | 正式成約内訳 |
| カード数 | card_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | カード利用分析 | 検証のみ |
| キャンセル数 | cancellation_count | ADOPTED | CtiCastDaily.cancellationCount | INTEGER_COUNT | 不可 | はい | — | 接客数再計算の構成値 |
| 事前予約のキャンセル数 | advance_reservation_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分別キャンセル | 検証のみ |
| 当日予約のキャンセル数 | same_day_reservation_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分別キャンセル | 検証のみ |
| 新規予約のキャンセル数 | new_reservation_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 新規キャンセル | 検証のみ |
| リピート予約のキャンセル数 | repeat_reservation_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | リピートキャンセル | 検証のみ |
| 悪質キャンセル数 | malicious_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 悪質キャンセル | 検証のみ |
| 事前予約の悪質キャンセル数 | advance_malicious_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分別悪質キャンセル | 検証のみ |
| 当日予約の悪質キャンセル数 | same_day_malicious_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分別悪質キャンセル | 検証のみ |
| 新規予約の悪質キャンセル数 | new_malicious_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分別悪質キャンセル | 検証のみ |
| リピート予約の悪質キャンセル数 | repeat_malicious_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分別悪質キャンセル | 検証のみ |
| キャンセル数(店事由) | store_reason_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 店事由分析 | 検証のみ |
| 事前予約のキャンセル数(店事由) | advance_store_reason_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分・事由分析 | 検証のみ |
| 当日予約のキャンセル数(店事由) | same_day_store_reason_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分・事由分析 | 検証のみ |
| 新規予約のキャンセル数(店事由) | new_store_reason_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分・事由分析 | 検証のみ |
| リピート予約のキャンセル数(店事由) | repeat_store_reason_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分・事由分析 | 検証のみ |
| キャンセル数(女子事由) | cast_reason_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 女子事由分析 | 検証のみ |
| 事前予約のキャンセル数(女子事由) | advance_cast_reason_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分・事由分析 | 検証のみ |
| 当日予約のキャンセル数(女子事由) | same_day_cast_reason_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分・事由分析 | 検証のみ |
| 新規予約のキャンセル数(女子事由) | new_cast_reason_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分・事由分析 | 検証のみ |
| リピート予約のキャンセル数(女子事由) | repeat_cast_reason_cancellation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 区分・事由分析 | 検証のみ |
| 女子報酬 | cast_reward_amount | ADOPTED | CtiCastDaily.castRewardAmount | MONEY | 可 | はい | — | 報酬系負数を許容 |
| 報酬補正 | reward_adjustment_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | 報酬補正分析 | 検証のみ |
| 送り代 | transport_fee_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | 費用分析 | 検証のみ |
| 寮費 | dormitory_fee_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | 費用分析 | 検証のみ |
| 自走費 | self_transport_fee_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | 費用分析 | 検証のみ |
| 託児所代 | childcare_fee_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | 費用分析 | 検証のみ |
| 雑費 | miscellaneous_fee_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | 費用分析 | 検証のみ |
| 有料オプション数 | paid_option_count | ADOPTED | CtiCastDaily.paidOptionCount | INTEGER_COUNT | 不可 | はい | — | 正式集計 |
| 有料オプション料金 | paid_option_sales_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | OP売上分析 | 検証のみ |
| 有料オプション報酬 | paid_option_reward_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | OP報酬分析 | 検証のみ |
| 利益 | cti_profit_amount | ADOPTED | CtiCastDaily.ctiProfitAmount | MONEY | 可 | はい | — | 負利益を正常値として許容 |
| 求人広告費 | recruitment_advertising_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | 求人費分析 | 検証のみ |
| 出勤時間 | attendance_minutes | ADOPTED | CtiCastDaily.attendanceMinutes | DECIMAL_HOURS | 不可 | はい | — | 分へ換算 |
| ネット指名数 | online_nomination_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 指名経路分析 | 検証のみ |
| 姫予約数 | direct_cast_reservation_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 姫予約分析 | 検証のみ |
| その他指名数 | other_nomination_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 指名区分分析 | 検証のみ |
| その他2指名数 | other_2_nomination_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | 指名区分分析 | 検証のみ |
| 料金 | sales_amount | ADOPTED | CtiCastDaily.salesAmount | MONEY | 可 | はい | — | 料金系負数を許容 |
| 料金補正 | sales_adjustment_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | 売上補正分析 | 検証のみ |
| 料金(カード) | card_sales_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | カード売上分析 | 検証のみ |
| 手数料 | commission_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | 手数料分析 | 検証のみ |
| 新規予約料金 | new_reservation_sales_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | 新規売上分析 | 検証のみ |
| 割引額 | discount_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | 割引分析 | 検証のみ |
| お店負担 | store_burden_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | 店舗負担分析 | 検証のみ |
| 60(本数) | course_60_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | コース構成 | 検証のみ |
| 60(料金) | course_60_sales_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | コース売上 | 検証のみ |
| 60(報酬) | course_60_reward_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | コース報酬 | 検証のみ |
| 90(本数) | course_90_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | コース構成 | 検証のみ |
| 90(料金) | course_90_sales_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | コース売上 | 検証のみ |
| 90(報酬) | course_90_reward_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | コース報酬 | 検証のみ |
| 120(本数) | course_120_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | コース構成 | 検証のみ |
| 120(料金) | course_120_sales_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | コース売上 | 検証のみ |
| 120(報酬) | course_120_reward_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | コース報酬 | 検証のみ |
| 150(本数) | course_150_count | FUTURE_CANDIDATE | — | INTEGER_COUNT | 不可 | いいえ | コース構成 | 検証のみ |
| 150(料金) | course_150_sales_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | コース売上 | 検証のみ |
| 150(報酬) | course_150_reward_amount | FUTURE_CANDIDATE | — | MONEY | 可 | いいえ | コース報酬 | 検証のみ |
| 写メ日記数 | diary_count_cti | ADOPTED | CtiCastDaily.diaryCountCti | INTEGER_COUNT | 不可 | はい | — | 正式集計 |
| 当日欠勤数 | same_day_absence_count | ADOPTED | CtiCastDaily.sameDayAbsenceCount | INTEGER_COUNT | 不可 | はい | — | 正式集計 |

## 判定ルール

- UNKNOWN_COLUMNSはこの74列、または正式エイリアスに存在しない列だけに発生します。
- 未定義列警告は店舗、シート、元列名、列番号、ヘッダー行番号を保持します。
- INTEGER_COUNTとDECIMAL_HOURSの負数はNEGATIVE_VALUE（ERROR）です。
- MONEYは負数を許容し、未採用列は型・負数検証だけ行って保存しません。
- `service_count = 予約数 - キャンセル数`、`contract_count = 本指名数 + 写真指名数 + フリー数`を正式集計値とします。
