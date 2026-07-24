# Performance Funnel 設計書（HPlus Analytics v1.1）

## 0. 位置付け

Performance Funnel は、PV→予約→売上を顧客単位でつなぐ一般的なマーケティングファネルではない。予約元（Town、Heaven、その他媒体）は現在のデータから判別できないため、媒体別予約率・媒体経由予約・媒体経由成約は算出しない。

本画面は、同一期間の CTI・Town・Heaven をキャスト単位で横断し、売上を構成する要素を次の5観点に分けて確認する意思決定画面である。全指標はVolume（量）・Efficiency（効率）・Sample（母数）の3軸を同時に評価し、共通ルールは `docs/ANALYTICS_DESIGN_PRINCIPLES.md` を正とする。

1. Exposure（露出）
2. Activity（活動量）
3. Performance（成果）
4. Efficiency（効率）
5. Growth Potential（成長余地）

出力は施策候補であり、原因・因果関係・将来売上を断定しない。今回の段階では設計のみとし、UI、API、DB、migration、実績更新は行わない。

## 1. 画面構成

想定URL：`/analytics/casts/funnel`

### 1.1 共通フィルタ

- 期間：開始日、終了日。初期値は当月。
- 店舗：全体、春日部、越谷、野田（CTI補助）。初期値は全体。
- 比較基準：店舗中央値、店舗平均、上位25%、本人過去3か月平均、本人過去6か月平均。
- 表示対象：`mergedIntoCastId IS NULL` の通常キャスト。
- 再計算・確定・再解析・Alias作成の操作は置かない。

全体の媒体範囲は明示する。

- CTI：春日部・越谷・野田
- Town：春日部・越谷
- Heaven：春日部のみ

媒体データが存在しない場合は0ではなく `—`（null）として表示する。店舗範囲外を欠損・問題として扱わない。

### 1.2 推奨レイアウト

上から、次の順で表示する。

1. ページ説明・期間・店舗・比較基準
2. データ健全性警告（DATA HEALTHへのリンク）
3. 5観点のサマリーカード
4. 制約条件カード
5. キャスト別 Performance Funnel 表
6. 選択キャストの詳細パネル
7. Growth Potential と「次に打つべき一手」
8. 算出根拠・指標ガイド

### 1.3 キャスト一覧

1行1キャストとし、横長表では以下のグループ列を切り替えられるようにする。

- 基本：表示名、主所属、掲載状態、状態タグ
- Exposure
- Activity
- Performance
- Efficiency
- Growth Potential

名前検索、店舗フィルタ、状態タグフィルタ、指標ソート、列表示切替、キャスト詳細へのリンクを用意する。

## 2. 表示カード

### 2.1 全体サマリー

- 対象キャスト数
- CTIアクティブ人数
- Town分析可能人数
- Heaven分析可能人数
- 3媒体すべて存在する人数
- Exposure要改善候補数
- Activity要改善候補数
- Efficiency要改善候補数
- Growth Potential候補数

人数と課題件数を分ける。同一キャストに複数の課題がある場合、人数1・課題複数として表示する。

### 2.2 Exposure カード

全体およびキャスト別に以下を表示する。

- Town PV、Town UU、Town TEL
- Heaven PAGE_ACCESS
- Heaven MY_GIRL最新値・期間増減
- Heavenお気に入り相当値（取得できる場合。未取得は—）
- Heavenランキング値（取得できる場合。未取得は—）
- TOWN/HEAVEN掲載状態
- 掲載媒体数
- 媒体データの最終日

Town と Heaven の値は「参考露出」であり、同一顧客の重複排除はできない。`Town PV + Heaven PAGE_ACCESS` は正式な合算ではなく「参考合計」と表示する。

### 2.3 Activity カード

- 出勤日数（同一日複数店舗は1日）
- 出勤時間
- 出勤日あたり時間
- CTI写メ日記数
- Heaven DIARY_POSTS
- Heaven ATTENDANCE_NOTICE
- Heaven DIARY_NOTICE
- 新人期間フラグ（startedOnからの経過日数）
- 掲載媒体数

新人期間の初期定義は `対象日または期間終了日 - Cast.startedOn < 30日` とする。将来、店舗設定で変更可能にする。

### 2.4 Performance カード

- 予約数
- 接客数
- 成約数
- 本指名数
- 売上（CTI料金）
- 女子報酬
- CTI利益（保存値がある場合）
- 平均単価
- 店舗別内訳

予約元は判別しない。予約、接客、成約はCTIの同一期間・同一キャスト実績として表示する。

### 2.5 Efficiency カード

- 売上／出勤日
- 売上／出勤時間
- 女子報酬／出勤日
- 女子報酬／出勤時間
- 予約／出勤日
- 予約／出勤時間
- 成約／出勤日
- 成約／出勤時間
- 売上／接客
- 女子報酬／接客
- Town PV／出勤日
- Town PV／出勤時間
- Heaven PAGE_ACCESS／出勤日
- Heaven PAGE_ACCESS／出勤時間
- 成約／Town UU（参考）
- 成約／Heaven PAGE_ACCESS（参考）

分母0、媒体未掲載、対象外、必要値欠損は0にせず `—`。母数が少ない場合は `LOW_SAMPLE` を付与する。

### 2.6 Growth Potential カード

次の3分類を基本とする。

- 露出不足候補
- 活動不足候補
- 効率不足候補

複数に該当する場合は「複合候補」とし、根拠指標を併記する。掲載なし・データなしは改善候補ではなく、状態タグと確認導線で表示する。

## 3. 指標定義・計算式

### 3.1 期間集計の基本

CTIとTownのDAILY値は期間内合計とする。Heavenは `valueKind` に従う。

- `DAILY_EVENT`：期間内rawValue合計
- `SNAPSHOT`：期間最終値、期間初値、最終値−初値
- `BLANK` / `NOT_APPLICABLE`：集計対象外

### 3.2 Exposure

| 指標 | 計算式・定義 | 注意 |
|---|---|---|
| Town PV | `TownCastDaily.pv` の期間合計 | 顧客単位の重複排除は不可 |
| Town UU | `TownCastDaily.uu` の期間値 | 日別UUを単純にユニーク再計算しない |
| Town TEL | `telTapUu` の期間値 | CTI予約・成約とは対応しない |
| Heavenアクセス | `metricKey=page_access` のDAILY_EVENT合計 | 予約元ではない |
| MyGirl | SNAPSHOT最終値・増減 | 日次合計しない |
| 参考露出合計 | `Town PV + Heaven PAGE_ACCESS` | 正式なPV合算ではない |
| 掲載媒体数 | `MediaListing.isListed=true` の媒体数 | 対象店舗範囲内 |

### 3.3 Activity

| 指標 | 計算式 |
|---|---|
| 出勤日数 | CTIの同一cast・同一businessDateを1日としてCOUNT DISTINCT |
| 出勤時間 | `attendanceMinutes` の合計 ÷ 60 |
| 出勤日あたり時間 | 出勤時間 ÷ 出勤日数 |
| 写メ日記数 | CTI `diaryCountCti` またはHeaven `diary_posts` の期間合計 |
| 通知数 | Heaven `attendance_notice` / `diary_notice` の定義に従う |
| 新人期間 | startedOnから対象期間末までの経過日数が30日未満 |

同日複数店舗出勤は、出勤日数のみ重複除外する。時間・売上・報酬・予約・接客・成約は実績店舗単位で合算する。

### 3.4 Performance

| 指標 | 計算式 |
|---|---|
| 予約 | `reservationCount` 合計 |
| 接客 | `serviceCount` 合計 |
| 成約 | `contractCount` 合計 |
| 本指名 | `regularNominationCount` 合計 |
| 売上 | `salesAmount` 合計 |
| 女子報酬 | `castRewardAmount` 合計 |
| CTI利益 | `ctiProfitAmount` 合計（存在時） |
| 平均単価 | 売上 ÷ 成約数 |

### 3.5 Efficiency

一般形は `分子 ÷ 分母` とし、分母0はnullとする。

- 売上／出勤日 = 売上 ÷ 出勤日数
- 売上／出勤時間 = 売上 ÷ 出勤時間
- 女子報酬／出勤時間 = 女子報酬 ÷ 出勤時間
- 予約／出勤日 = 予約 ÷ 出勤日数
- 成約／出勤日 = 成約 ÷ 出勤日数
- 売上／接客 = 売上 ÷ 接客数
- PV／出勤日 = Town PV ÷ 出勤日数
- 成約／Town UU = 成約 ÷ Town UU（参考）
- 成約／Heaven PAGE_ACCESS = 成約 ÷ Heavenアクセス（参考）

媒体露出とCTI成果の分母指標は「顧客単位で直接対応しない参考指標」と表示する。

## 4. 理論最大時給・制約条件

### 4.1 理論最大時給

理論最大時給は、キャストランクと料金体系から算出する上限参考値である。現在時給を上回る売上を保証するものではない。

初期の業務基準例（最終値は店舗管理者レビュー後に確定。料金体系をコードへ固定しない）：

| ランク | 理論最大時給 |
|---|---:|
| PLATINUM | 7,600円/時 |
| REGULAR | 約6,300円/時（運用表示は約6,000円前後の目安） |
| 未設定 | — |

基準理論最大時給、OP込み実績時給、現在実績時給、理論最大時給達成率を区別する。オプションは変動要素のため基準理論最大時給には原則含めない。将来はランク・料金マスタから取得し、未設定ランクをREGULARに自動補完しない。

### 4.2 現在時給・達成率

- 現在時給 = 女子報酬 ÷ 出勤時間
- 理論最大時給達成率 = 現在時給 ÷ 理論最大時給

理論最大時給が未設定、出勤時間0、女子報酬欠損の場合は `—`。達成率が100%を超える場合はデータ定義・ランク設定を要確認として表示し、勝手に丸めない。

### 4.3 稼働制約

「稼働率」は予約元が判別できないため、次の代理指標で定義する。

- 接客稼働率（参考） = 接客時間 ÷ 出勤時間（接客時間が保存される場合のみ）
- 予約負荷（参考） = 予約数 ÷ 出勤時間
- キャパシティ消化（参考） = 接客数 ÷ 推定最大接客数

推定最大接客数が存在しない場合、稼働率95%などの断定は行わない。表示は「高負荷の可能性」「出勤時間の制約を確認」とする。

## 5. Growth Potential 判定

### 5.1 判定の順序

1. `mergedIntoCastId IS NULL` を確認
2. 在籍期間が対象期間と重なるか確認
3. CTIアクティブ（出勤日数≥1、出勤時間>0、CTI実績あり）か確認
4. 媒体の掲載・データ存在を分離してタグ付与
5. 最低母数を確認
6. Exposure、Activity、Efficiencyを比較基準と比較
7. 制約条件を確認
8. 成長余地と次の一手を1件だけ選択

### 5.2 露出不足候補

以下をすべて満たす場合の参考候補。

- CTIアクティブ
- TownまたはHeavenの分析可能データが存在
- 媒体PV/アクセス ÷ 出勤日が対象媒体集団の下位25%
- ただし出勤・時間・接客母数が不足していない

媒体未掲載は「露出不足」と断定せず、「掲載状態を確認」とする。

### 5.3 活動不足候補

- CTIアクティブ
- 出勤日数または出勤時間が対象集団中央値未満
- 売上／出勤日、報酬／時間、成約／出勤日が上位側、または本人平均を上回る
- 退店・新人期間・本人の出勤可能日を確認できる

「出勤を増やせば売上が増える」とは書かず、「追加出勤の余地を確認」とする。

### 5.4 効率不足候補

- CTIアクティブ
- 最低母数を満たす
- 売上／出勤時間、報酬／時間、成約／出勤日などの複数指標が下位25%
- 稼働制約が高い場合は、露出施策ではなく接客・単価・本指名の確認を優先

### 5.5 制約優先ルール

施策は次の優先順で制約を考慮する。

1. 稼働・出勤時間が上限に近い可能性：露出拡大より出勤時間・枠の見直し
2. 活動量が少なく効率が高い：追加出勤、掲載強化、成功要因の確認
3. 露出が低く効率も低い：プロフィール、写真、日記、掲載状態の確認
4. 露出が高く予約・成約が低い：閲覧後転換の参考確認。ただし媒体経由とは断定しない
5. 成約はあるが本指名が低い：接客後の継続性改善候補

## 6. AIインサイトのロジック

初版は、再現可能なルールエンジンを正とし、AIは文章整形の補助に限定する。

### 6.1 入力

- キャストの5観点指標
- 店舗基準値（中央値、平均、上位25%、下位25%）
- 最低母数・状態タグ
- 在籍期間・新人期間
- 掲載状態
- 過去3/6か月本人平均（取得可能な場合）
- 制約フラグ

### 6.2 出力構造

```text
{
  type: "EXPOSURE" | "ACTIVITY" | "EFFICIENCY" | "CONSTRAINT",
  priority: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_DATA",
  evidence: [{ metric, value, basis, gap }],
  constraint: "CAPACITY" | "ATTENDANCE" | "NONE" | null,
  action: "確認用の定型施策コード",
  confidence: "HIGH" | "MEDIUM" | "LOW",
  disclaimer: "参考仮説であり因果関係を示さない"
}
```

AIに直接DBを読ませず、サーバー側で算出・検証した値だけを渡す。根拠指標、分母、比較母集団、欠損状態を必ず出力に含める。自由文章が数値や因果を変更した場合は採用しない。

### 6.3 信頼度

- HIGH：最低母数を満たし、2指標以上が同じ方向、媒体データも存在
- MEDIUM：最低母数を満たすが根拠が1〜2指標
- LOW：出勤1日、接客5件未満、媒体値が少ないなど
- INSUFFICIENT_DATA：必要分母・媒体値が欠損

## 7. 「次に打つべき一手」

各キャストにつき、最重要の施策候補を1件だけ表示する。候補を複数羅列せず、施策は実行せず、リンク先だけ提供する。

| 判定 | 次の一手 | 確認先 |
|---|---|---|
| 露出不足 | 掲載状態、プロフィール、写真、日記活動を確認 | Town/Heaven分析、キャスト詳細 |
| 活動不足 | 出勤可能日・追加枠・新人期間を確認 | CTI実績、シフト運用 |
| 効率不足 | 接客、成約、単価、本指名のどこが弱いか確認 | CTIキャスト詳細 |
| 高負荷の可能性 | 露出拡大より出勤時間・枠の制約を確認 | CTI出勤時間、店舗運用 |
| 閲覧後転換参考 | UU/PAGE_ACCESSと予約・成約を同期間で比較 | Town/Heaven＋CTI |
| データ不足 | Alias、掲載、未確定Batch、在籍期間を確認 | DATA HEALTH、取込詳細 |

推奨文は「〜の可能性」「〜を確認」「参考指標」とし、媒体経由予約・成約、原因、増収額を断定しない。

## 8. DBから取得するデータ

既存テーブルのみを利用し、初版ではスキーマ変更しない。

### Cast / CastAlias / MediaListing

- Cast：id、displayName、primaryStore、startedOn、endedOn、mergedIntoCastId、rank（存在する場合）
- CastAlias：mediaType、storeId、aliasName、validFrom、validTo
- MediaListing：mediaType、storeId、isListed、掲載期間

### CTI

`CtiCastDaily` から期間内の businessDate、storeId、attendanceCount、attendanceMinutes、reservationCount、serviceCount、contractCount、regularNominationCount、salesAmount、castRewardAmount、ctiProfitAmount、diaryCountCti を取得する。

### Town

`TownCastDaily`、必要に応じてTown URL/LPから date、storeId、castId、pv、uu、telTapUu、掲載状態を取得する。TownとCTIの顧客単位対応は保持しない。

### Heaven

`HeavenCastDaily` から businessDate、storeId、castId、metricKey、rawValue、valueKind、rawValueStatus、deltaValue を取得する。DAILY_EVENTとSNAPSHOTを分けて集計する。

### 取込健全性

`ImportBatch`、`ImportError`、previewはDATA HEALTHと同じ読み取りルールを再利用する。未確定・FAILED・未解決データがある場合、画面上部に警告を表示するが、分析を停止しない。

## 9. 比較基準・最低母数

### 9.1 比較基準

- 店舗中央値：外れ値に強い主要基準
- 店舗平均：全体水準を把握
- 上位25%／下位25%：候補境界
- 本人過去3/6か月平均：本人内の改善傾向

比較集団は指標ごとに分ける。CTI効率はCTIアクティブ集団、Town効率はTown分析可能集団、Heaven効率はPAGE_ACCESS存在集団を使う。媒体未掲載を0として母集団へ混ぜない。

### 9.2 最低母数

- 効率の標準判定：出勤日2日以上、出勤時間>0
- 1日実績：候補化可能だが `LOW_SAMPLE`
- 本指名率：接客5件以上
- 成約／予約：予約5件以上
- 閲覧後転換参考：Town UUまたはHeaven PAGE_ACCESSが対象集団の最低値以上（初期値10以上を検討）
- 理論最大時給達成率：出勤時間>0、ランク設定あり

## 10. 今後追加可能な指標

- 曜日・時間帯別の出勤効率
- 新人期間と通常期間の分離
- コース・オプション別単価
- 接客時間、待機時間、稼働率の正式値
- 掲載順位、プロフィール更新履歴、写真変更履歴
- Heavenランキング順位・お気に入り推移
- 予約キャンセル率・当日欠勤率
- 店舗別キャパシティと枠消化率
- 施策実施前後の差分・対照キャスト比較
- 施策仮説の採用・結果・検証履歴
- 因果推論ではなく、条件付き比較・傾向分析・実験設計

## 11. 既知の制約

- 予約元媒体は判別できないため、媒体別予約率・媒体経由成約は提供しない。
- Town UU、TEL、HeavenアクセスとCTI予約・成約は顧客単位で対応しない。
- 「稼働率」は正式な接客時間・枠情報がない限り推定しない。
- 理論最大時給はランク・料金体系の設定品質に依存する。
- データ不足、未確定Batch、Alias未解決がある場合、候補の信頼度を下げる。
- AI文章は算出値・根拠・免責を上書きできない。
- 自動通知、自動施策実行、DB更新、ImportBatch更新は本設計の対象外。

## 12. 実装前レビュー項目

1. 理論最大時給のランク・料金表を管理者が承認する。
2. 接客時間・枠情報なしで稼働率を表示しないことを確認する。
3. Heavenの各metricKeyの値種別を確認する。
4. Town UUの期間集計方法を既存分析と統一する。
5. 未確定Batch時の警告・スコア表示をDATA HEALTHと統一する。
6. AIを使う場合の入力JSON、出力schema、監査ログ、失敗時の定型文を定める。
7. UI実装前に匿名化フィクスチャで分母0、媒体欠損、同日複数店舗、merged Castを検証する。

## 13. v1.1 Phase B-1 共通原則の適用

### 13.1 Sampleと信頼度

キャスト別の標準判定は出勤回数・出勤時間・接客数など指標ごとの母数を併記する。基本ランクはHigh（20以上）、Medium（10〜19）、Low（5〜9）、Insufficient（4以下）とし、率・効率ごとに適切な母数へ置き換える。1日実績は候補化できてもLOW_SAMPLEとする。

### 13.2 Growth分類

既存のExposure不足、Activity不足、Efficiency改善余地に加え、Schedule制約、Capacity上限、Data不足、安定維持を定義する。正式な分類名と優先順位は共通原則（`docs/ANALYTICS_DESIGN_PRINCIPLES.md`）を参照する。複数条件時は、Data不足、Capacity上限、Schedule制約、Exposure不足、Activity不足、Efficiency改善余地、安定維持の順に1分類だけを採用する。媒体未掲載はExposure不足と断定しない。

### 13.3 Next Best Action

Growth分類の優先順位を原因選定へ適用し、Cause → Evidence → Actionの順で1キャストにつき提案は1件のみとする。Insufficientは提案なし、Low ConfidenceはREFERENCE、安定維持は原則提案なしとする。提案内容、判定理由、根拠指標、比較対象、Sample、信頼度、注意事項を必須出力とする。Town経由予約、Heaven経由予約、断った予約、機会損失額は算出しない。

### 13.4 共通実装境界

Phase B-2では、`MetricValue`、`Confidence`、`ComparisonBasis`、`Evidence`、`NextBestAction` を共通型として定義し、`calculateMetric`、`calculateSample`、`selectBaseline`、`comparePeriods`、`classifyGrowthPotential`、`selectNextBestAction` を純粋関数として分離する。Performance Funnelはこれらの共通サービスを利用し、取込・確定・Alias解決サービスを呼び出さない。
