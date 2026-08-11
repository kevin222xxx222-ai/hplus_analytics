# Management Dashboard Metric Definitions

| 指標 | 定義 |
|---|---|
| 店舗売上 | CTIに記録された料金合計。女子報酬控除前 |
| 成約数 | CtiCastDaily.contractCountの合計。予約数で代用しない |
| 予約数 | CtiCastDaily.reservationCountの合計 |
| 延べ出勤人数 | 各営業日のattendanceCountの合計 |
| 1日平均出勤人数 | 延べ出勤人数 ÷ 対象営業日数 |
| 期間内ユニーク出勤者 | 期間内に出勤実績があるユニークCast数 |
| 出勤時間 | attendanceMinutesの合計を時間表示 |
| 売上／時間 | 店舗売上 ÷ 総出勤時間 |
| 平均単価 | 売上 ÷ 接客数。分母0は算出不能 |
| 本指名数 | regularNominationCountの合計 |
| 本指名率 | 本指名数 ÷ 接客数。分母0は算出不能 |
| Town PV / UU | Town店舗またはキャストページの正式値 |
| Heaven PAGE_ACCESS | Heaven女子ページアクセスの正式値 |
| Heaven DIARY_POSTS | Heaven写メ日記投稿数。PVではない |
| Heaven MITENE_SENT | Heavenミテネ送信数 |

比較期間は前月同期間など既存comparisonRangeの定義を使用します。`対象外`、`未取得`、`データ不足`、`0件`は区別して表示し、欠測を0補完しません。内部のAvailabilityやConfidenceはUIで日本語化します。

## 日次推移

- 日次値：既存SnapshotのbusinessDate単位で生成
- 前日比較：直前の日付値との差
- 前週同日比較：7日前の値との差
- 店舗全体系列：対象店舗の正式集計をIntegrationで生成
- Town全体系列：春日部＋越谷。野田は対象外
- Heaven日次変換：既存valueKindと保存済み日次値を使用し、累積値を勝手に日次値へ変換しない
- 日次出勤人数：各営業日の延べ出勤人数
- 日次本指名率：本指名数 ÷ 接客数。分母0は算出不能
- 欠測点：nullで保持し、グラフ線で接続しない
- 対象外系列：系列自体を作成せず、対象外として説明する
# Phase F-1D Story Metric Scope

- Town全体は春日部＋越谷のTown指標、および同じ店舗範囲のCTI売上・成約を使用し、野田を含めない。
- Heavenの活動・閲覧・成果は春日部のDIARY_POSTS、PAGE_ACCESS、春日部CTI成約・売上を使用する。
- DIARY_POSTSは正式な投稿イベント、PAGE_ACCESSは正式な女子ページアクセスであり、Heaven日記PVは生成しない。
- 越谷・野田の勤務時間は店舗帰属が完全でない可能性があるため参考値。時間の補完・按分はしない。
- MITENE_SENTとOKINI_TALK_SENTは母集団が異なるためManagement Dashboardの主要Storyでは評価しない。
- Story内の同時変化は因果を意味せず、詳細分析への確認導線として扱う。

## Relationship Metrics

売上×成約、売上×出勤人数、売上×出勤時間、売上×Town PV、売上×Town UU、売上×本指名数を主要関係性とする。HeavenはPAGE_ACCESS×DIARY_POSTS、売上×PAGE_ACCESS、成約数×PAGE_ACCESSを表示する。

「同方向」「逆方向」「前日差の方向一致率」は前日差方向の比較であり、相関係数・因果・媒体経路を表さない。いずれかの値が欠測の日は判定不能とし、0補完しない。
# Dashboard v2 story metrics

Story Cardは、既存の売上・成約・出勤・Town・Heaven・本指名の正式指標を再利用する。Headline Metricは最大3件、値の集計とAvailabilityはIntegrationで確定する。

| Story | Scope | 主な構成 |
|---|---|---|
| Sales Outcome | 全体・春日部・越谷・野田 | 売上 Bar × 成約数 Line |
| Sales Operations | 全体・春日部・越谷・野田 | 売上 Bar × 出勤人数/時間 Line |
| Town Performance | Town全体・春日部・越谷 | 売上 × UU、成約数 Bar × PV Line |
| Heaven Performance | 春日部 | 売上 × PAGE_ACCESS、PAGE_ACCESS × DIARY_POSTS |
| Sales Nomination | 全体・春日部・越谷・野田 | 売上 Bar × 本指名数 Line、本指名率は補助値 |

Town全体は春日部＋越谷のみ、野田は対象外。Heavenは春日部のみ。出勤時間は越谷・野田で参考値となる場合があり、時間コピー・按分・推定を行わない。

## F-2B 店舗別正式利用範囲

- 春日部：売上、成約、予約、出勤、Town、Heaven、指名。
- 越谷：売上、成約、予約、Town、正式値がある場合の指名。店舗別稼働は表示しない。
- 野田：売上と正式値がある場合の成果・指名。媒体・稼働は表示しない。
- `MITENE_SENT` はPAGE_ACCESSとの活動比較に限定する。`OKINI_TALK_SENT` は現行正式入力DTOに存在しないため、未接続のまま推測表示しない。
- Town・Heaven媒体推移は春日部Scopeに固定し、別媒体の生値を同一Y軸へ重ねない。
# F-2C Comparison and Media Scope

- `前月同期間比` compares the current range with the same elapsed-day range in the previous month.
- Percentage metrics keep both rate difference and point difference; 本指名率 is shown with point difference where applicable.
- Store Overview uses absolute values for Town PV, Town UU, Heaven PAGE_ACCESS, and DIARY_POSTS.
- The official cross-media relationship is Town PV × Heaven PAGE_ACCESS (Kasukabe only), with no index or normalization.
- OKINI_TALK_SENT is not connected to the formal DTO and must not create a zero or empty chart.

### OKINI investigation (F-2D)

`HeavenCastDaily`には`metricKey = okini_talk_sent`を保存でき、Queryも`metricKey`を含む行を取得します。一方、Management Dashboard Adapterの正式な`AnalyticsRow.metrics`変換は`page_access`、`diary_posts`、`mitene_sent`のみで、OKINIをEngine入力へ変換していません。したがって現状は「DB保存可能・Query取得済み・Adapter未変換・Engine入力未接続・Dashboard DTO未接続」です。次PhaseでAdapterの正式metric追加とテストを行えば、PAGE_ACCESS × OKINI_TALK_SENTを追加できます。
