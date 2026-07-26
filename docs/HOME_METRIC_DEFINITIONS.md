# HOME Metric Definitions

**HOME v1.0**  
最終更新：2026-07-26

## CTI指標

| 表示名 | 内部ID | 式／意味 | 単位 | Scope・注意 |
|---|---|---|---|---|
| 売上 | `sales` / `salesAmount` | CTI日次売上合計 | 円 | CTI対象店舗 |
| 女子報酬 | `castReward` / `castRewardAmount` | 女子報酬合計 | 円 | 補助実績 |
| 利益 | `profit` / `ctiProfitAmount` | CTI利益合計 | 円 | 補助実績 |
| 予約数 | `reservations` / `reservationCount` | 予約受付実績 | 件 | 成約とは別。詳細分析で使用 |
| 成約数 | `contracts` / `contractCount` | `regularNominationCount + photoNominationCount + freeCount` | 件 | HOME主要運営指標 |
| 接客数 | `services` / `serviceCount` | CTI取込で検証された接客数 | 件 | 成約とは別 |
| 出勤人数 | `attendance` | 同日・同キャストを重複除外した人数 | 人 | 全体では同日複数店舗を1人扱い |
| 出勤時間 | `hours` / `attendanceMinutes` | `attendanceMinutes ÷ 60` | 時間 | 0除算なし |
| 本指名数 | `regularNominations` | 本指名数 | 件 | 補助実績 |
| 本指名率 | `nominationRate` | 正式な分母が利用できる場合のみ | % | 定義不明時は算出しない |

## Town / Heaven

| 表示名 | 内部ID | ソース | 単位 | Scope |
|---|---|---|---|---|
| 店舗PV | `townPv` / `pv` | TownStoreDaily | PV | 春日部・越谷 |
| 店舗UU | `townUu` / `uu` | TownStoreDaily | UU | 春日部・越谷 |
| Heaven女子ページアクセス | `heavenAccess` / `page_access` | HeavenCastDaily | 件 | 春日部のみ |
| Heaven写メ日記投稿数 | `heavenDiaryPosts` / `diary_posts` | HeavenCastDaily | 件 | 春日部のみ |

CTI写メ日記投稿数は取得可能な補助指標として表示できますが、前日実績比較の主比較軸からは除外します。Heaven写メ日記PVは正式データが存在しないため生成しません。未取得値を0に補完しません。

## 目標指標

- 月目標：`MonthlyGoal.salesTarget`
- 達成率：現在売上 ÷ 月目標
- 着地予測：現在売上 ÷ 経過日数 × 対象日数
- 残り差額：月目標 − 現在売上（負値は0）
- 現在日平均：現在売上 ÷ 経過日数
- 必要日平均：残り差額 ÷ 残り日数
- 必要出勤人数：必要日平均 ÷ 現在の売上／出勤人数を切り上げ
- 必要成約数：必要日平均 ÷ 現在の売上／成約数を切り上げ
- 必要出勤時間：必要日平均 ÷ 現在の売上／時間を切り上げ相当で表示
- 必要水準との差：現在の当月日平均 − 必要日次目安。正値は必要水準超過、負値は不足
- 必要水準カードの状態：現在の当月日平均が必要日次目安以上なら「十分」、未満なら「不足」

分母0、欠測、Insufficientでは算出不能とし、予約数や接客数を成約数へ流用しません。

前日値は補足表示のみで、必要水準との差や状態判定の基準には使用しません。

## 日次Benchmark

- Threshold：残額・残日数がある場合は必要日平均。達成済み／月末は月目標÷暦日数
- Qualified Day Count：Threshold以上だった評価対象日前の確定日数
- Median：昇順の中央値。偶数件は中央2件の平均
- P25 / P75：既存`percentile`の線形補間方式
- 参考レンジ：P25〜P75
- Status：参考レンジより高い／内／下回る／サンプル不足／データ不足
- HOME表示では達成日中央値を主表示し、当月平均をP25〜P75と比較した`monthlyStatus`を主要な状態表示に使用します。評価対象日の値を用いる旧`status`はDTO互換の補助値として保持します。
- Confidence：既存閾値（20以上High、10以上Medium、5以上Low、4以下Insufficient）

## 月間媒体見込み

`MonthlyMediaBenchmark`が、月累計、有効データ日数、日平均、月末着地参考値、過去完了月中央値、P25/P75、Sample月数、Statusを保持します。

`currentCumulative ÷ validDataDays × 暦日数`による単純延長であり、将来の露出・投稿数の予測ではありません。

## Availability

`VALUE`（値あり）、`ZERO`（実績0）、`MISSING`（正式値なし）、`UNAVAILABLE`（対象外・利用不能）、`UNCOMPUTABLE`（分母等により算出不能）、`INSUFFICIENT_SAMPLE`（母数不足）を区別します。
