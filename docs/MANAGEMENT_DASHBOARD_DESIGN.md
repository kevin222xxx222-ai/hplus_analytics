# HPlus Analytics Phase D-2A

# Management Dashboard 設計書

> 本書は設計のみを定義する。Phase D-2Bで承認後に実装する。DB、Prisma、Migration、既存実績、取込、Alias、Cast、Store、Goalは変更しない。

## 1. エグゼクティブサマリー

Management Dashboardは、複数店舗を管轄する管理者が5〜10分で「どの店舗を、なぜ、次に確認するか」を判断する比較画面である。HOME/Daily Briefの今日の入口や、詳細Analyticsの原因分析を複製せず、共通DTOを使った店舗比較・優先順位・データ状態に集中する。

分析評価順は共通原則どおり **Sample → Efficiency → Volume** とする。値がない、対象外、比較不能、母数不足を0に置き換えない。

## 2. Management Dashboardの一文定義

複数店舗の母数・効率・量・データ状態を同じ基準で比較し、次に確認すべき店舗と詳細画面を示す管理者向け画面。

## 3. 正式な日本語名称

正式名称は **全店舗ダッシュボード** とする。英語名はコード・URL・設計上の識別子として`Management Dashboard`を使用する。

## 4. Primary User

### 主利用者

- 複数店舗管轄責任者、エリアマネージャー、全体管理者
- ADMIN：全体・許可された店舗を閲覧
- VIEWER：付与された範囲を閲覧。編集操作は持たない

### 利用者別方針

|利用者|頻度|範囲|必要情報|不要・誤解しやすい情報|
|---|---|---|---|---|
|複数店舗責任者|毎日・週次|全体＋店舗|比較、目標、効率、DATA HEALTH|キャスト個別の細部|
|店長|毎日|自店舗|自店舗比較、前期間、要確認|権限外店舗の比較|
|経営者|週次・月次|全体|目標、構造差、継続傾向|行動レベルの細かい候補|
|VIEWER|必要時|許可範囲|読み取り専用の比較|権限外データ|

単一店舗権限の場合は、同じ画面を自店舗モードで表示し、複数店舗比較を「比較可能店舗なし」とする。自動的に全体権限を付与しない。

## 5. 利用頻度・利用時間

- 営業前・夕方：5〜10分
- 週次会議：10〜20分
- 月次レビュー：20〜30分
- Daily Briefの代替ではなく、店舗間の優先順位確認に限定する

## 6. Dashboardが答える問い

1. 全体売上は目標・前期間に対してどうか
2. どの店舗が全体の達成を支えているか
3. どの店舗を最優先で確認すべきか
4. 差は出勤量・時間・効率・予約・媒体のどこに現れているか
5. 店舗差は一時的か、比較期間でも継続しているか
6. どの店舗・媒体のデータ品質に問題があるか
7. 次にどのAnalyticsへ移動すれば根拠を確認できるか

## 7. Dashboardが答えない問い

- 特定キャストの詳細な改善方法
- 特定曜日・時間帯の詳細傾向
- URL単位の媒体分析
- Town/Heaven経由の予約・成約
- 媒体施策の因果効果
- 機会損失、断った予約、将来売上の断定
- AIによる根拠のない総合スコア

## 8. HOMEとの役割比較

|項目|HOME / Daily Brief|全店舗ダッシュボード|
|---|---|---|
|主目的|今日何を確認・対応するか|どの店舗を優先して見るか|
|利用時間|朝3分・営業中1分|5〜10分|
|期間|当月・任意期間|当月を主期間、比較期間付き|
|店舗範囲|全体または選択範囲|全体・複数店舗比較|
|最上部|優先アクション、前日KPI|全体KPI、比較条件、データ状態|
|比較|限定的|店舗間・前期間|
|グラフ|簡易トレンド|店舗構造比較、最大3個|
|キャスト情報|要確認キャストへの入口|人数・寄与の要約のみ|
|媒体情報|活動要約|対象範囲・店舗差の要約|
|DATA HEALTH|全体の警告|店舗・媒体別の問題箇所|
|詳細表|原則なし|店舗比較1表＋要確認1表|
|遷移|Dashboard、Analytics|Store/Trend/Time/Data Health|

Daily Briefの優先アクション、前日KPI、月目標カードはそのまま複製しない。Dashboardでは共通DTOから店舗比較に変換し、必要な場合だけ「Daily Briefを見る」リンクを出す。

## 9. 各Analyticsとの役割比較

|画面|Dashboardに要約するもの|Dashboardに置かないもの|遷移|
|---|---|---|---|
|Store Analytics|店舗別Volume/Efficiencyの要点|日別全系列、指標詳細|店舗・期間・比較条件|
|Trend Analytics|継続/変化の要約|全比較軸の詳細|from/to/comparison/store|
|Time Analytics|曜日差が疑われる注記|曜日適性の詳細|from/to/store|
|Performance Analytics|成果・効率の要約|キャスト単位のFunnel詳細|from/to/store|
|Cast Analytics|対象人数・寄与の要約|個人の原因・行動提案|from/to/store/cast|
|Diary Analytics|投稿活動の要約|日別・キャスト別詳細|from/to/store/metric|

DashboardはEngine結果を再計算しない。Analytics側と同じ自然キー、期間、Availability、Confidence、Sampleで一致する場合だけ表示する。

## 10. Definition of Purpose一覧

|画面|一文目的|Primary User|頻度|その画面だけで決めること|
|---|---|---|---|---|
|HOME|今日の確認・対応事項を知る|全管理者|毎日|今日の入口|
|全店舗ダッシュボード|店舗間の優先確認先を決める|複数店舗責任者|毎日/週次|確認店舗と遷移先|
|Store Analytics|店舗の構造と詳細原因を確認する|店長/責任者|週次|店舗指標の解釈|
|Cast Analytics|キャスト単位の状態を確認する|店長|毎日/週次|個人の確認候補|
|Trend Analytics|変化の継続性と要因候補を見る|責任者|週次|期間比較の解釈|
|Time Analytics|曜日別の量・効率・母数を見る|店長|週次|曜日の確認候補|
|Diary Analytics|写メ日記活動と露出の関係を参考確認する|店長|週次|活動確認|
|Performance Analytics|成果をVolume/Efficiency/Sampleで分解する|責任者|週次|効率の確認先|
|DATA HEALTH|分析データを信頼できるか確認する|全管理者|毎日|再確認・取込確認|
|目標管理|目標を入力・変更する|ADMIN|月次|目標設定|

## 11. 標準期間

- 初期表示：当月1日〜当日または最新確定日（未来日は含めない）
- 主期間：当月累計
- 比較期間：前週同曜日、前月同期間のうち一つを選択
- 任意期間：許可するが最大92日
- 前日比は補助表示のみ
- 月途中に前月全月と比較しない
- 営業日未確定は「営業日未確定」と表示し、0補完しない

## 12. 比較期間

初期比較は`previousWeekday`とする。選択肢は以下に限定する。

- 前週同曜日
- 前月同期間
- 前日
- 比較なし

同一画面で複数の比較基準を同時に主判定へ使わない。比較不能は`UNAVAILABLE`または`INSUFFICIENT_SAMPLE`と理由を返す。

## 13. 店舗範囲

- 全体：CTIは春日部・越谷・野田、Townは春日部・越谷、Heavenは春日部のみ
- 春日部：CTI、Town、Heaven
- 越谷：CTI、Town、Heavenは対象外
- 野田：CTIのみ。Town/Heavenは対象外
- 複数店舗：CTIは選択店舗を合算、媒体は各媒体の対象店舗だけを比較

対象外と欠測を区別する。越谷Heavenを0、野田Townを0として扱わない。

## 14. ALLの定義

ALLは「管轄全体」を意味し、媒体ごとの母集団は同じではない。

- CTI：3店舗合計
- Town：春日部＋越谷
- Heaven：春日部のみ
- 店舗比較：対応する店舗だけを表示
- キャスト全体人数：`mergedIntoCastId IS NULL`、期間重複または実績あり

## 15. 画面情報構造

常時表示は6セクション以内とする。

1. タイトル、期間、比較条件、店舗範囲
2. データ更新状態
3. 全体サマリーKPI
4. 店舗比較（Sample → Efficiency → Volume）
5. 店舗別要確認
6. 最大3グラフと詳細リンク

媒体詳細・DATA HEALTHの正常行・キャスト詳細は折りたたみまたはリンク先へ移す。

## 16. 最上部KPI

最大6個。

1. 全体売上（当月累計）
2. 月目標（未設定は「未設定」）
3. 目標達成率
4. 着地予測（単純ペース、参考値）
5. 売上／出勤時間
6. データ状態（未確定Batch/FAILEDの要約）

予約・成約・出勤人数は店舗比較へ移す。各KPIは`value / availability / confidence / sample / period / comparison`を保持する。

## 17. 店舗比較設計

### 最初に見る順序

1. Sample：対象日数、出勤時間、取得日数
2. Efficiency：売上/時間、予約/時間、成約率、本指名率
3. Volume：売上、予約、成約、出勤人数

### 比較ブロック

- Volume：売上、予約、成約、出勤人数
- Efficiency：売上/時間、予約/時間、本指名率
- Media：Town PV/UU、Heavenアクセス、写メ日記
- Data Health：最終確定日、未確定、FAILED、OPENエラー

店舗数が増えても行単位で拡張し、指標列を無制限に増やさない。詳細指標はStore Analyticsへ遷移する。

## 18. 店舗優先順位設計

ランキングではなく「要確認順」とする。総合点や「最悪店舗」は表示しない。

優先順：

1. データ確認が必要（FAILED、OPEN ERROR、影響額あり）
2. 比較可能なSampleがあり、Efficiencyに大きな変化
3. Volumeの大きな変化
4. 大きな変化なし

Sample不足・目標未設定・媒体対象外はペナルティにせず、理由付きの状態として表示する。

## 19. 原因カテゴリ

「原因」と断定せず、以下を「現在の状況」「確認候補」「判断根拠」として表示する。

- データ不足
- 出勤量・出勤時間
- 予約・成約
- 稼働効率・平均単価
- 本指名
- 店舗流入・キャストページ閲覧
- 写メ日記活動
- 掲載状態
- 目標進捗

媒体閲覧から予約・成約への直接因果は表示しない。

## 20. グラフ設計

最大3つ。

1. 店舗別目標達成状況（棒またはカード）：目標設定済み店舗のみ。未設定は別状態。
2. 店舗別売上/時間（棒）：SampleとConfidenceを併記。
3. 店舗別売上推移（折れ線）：全体と店舗を同じ期間で比較。

HOMEの累積売上グラフは再利用せず、Dashboardは店舗比較に限定する。媒体PVと予約の散布図、Town＋Heaven合算グラフ、因果を想起させるFunnelは作らない。

## 21. 表設計

### 店舗サマリー比較表

列：店舗、Sample、Confidence、売上/時間、売上、予約、成約、データ状態、詳細リンク。

- 初期ソート：要確認状態、次に店舗表示順
- 固定列：店舗
- Availabilityは値と状態を別表示
- モバイルではカード化または横スクロール

### 店舗別要確認表

列：店舗、現在の状況、判断根拠、比較基準、推奨確認先。

推奨確認先は一件に絞り、Store/Trend/Time/DATA HEALTHへのリンクを持つ。CSV出力は初版対象外。

## 22. 媒体比較

Dashboardでは以下だけを要約する。

- Town店舗PV
- Town店舗UU
- Heaven店舗アクセス
- Heaven写メ日記投稿数

TownキャストPV、Town写メ日記PV/UU、Heaven女の子ページアクセス、CTI写メ日記は詳細Analyticsへ移す。すべての値に媒体名・単位・対象店舗を付ける。HeavenアクセスをPVと呼ばず、TownとHeavenを合算しない。

## 23. DATA HEALTH

HOMEは全体警告、Dashboardは店舗・媒体別の差分を表示する。

表示：店舗別最終確定日、媒体別最終更新、PREVIEW_READY、WAITING、FAILED、OPEN ERROR、Coverage、影響指標、DATA HEALTH詳細リンク。

正常行はコンパクトにし、問題店舗のみ強調する。対象外店舗は欠測として減点しない。

## 24. 目標設計

現状で確実に取得できるもの：全体月目標、全体実績、達成率、単純ペース着地、残り差額。

店舗別目標が未設定の場合、全体目標を按分・推定しない。店舗カードは「店舗目標未設定」と表示し、店舗達成率を作らない。店舗別目標はGoal Managementの既存モデルで保存されている場合のみ表示する。

## 25. DTO設計

```ts
type ManagementDashboardDto = {
  meta: { from: string; to: string; comparison: ComparisonKind; scope: Scope; generatedAt: string };
  summary: { sales: MetricValue; goal: MetricValue; achievementRate: MetricValue; projectedSales: MetricValue; salesPerHour: MetricValue; dataStatus: DataStatus };
  stores: StoreDashboardItem[];
  priorities: StorePriorityItem[];
  media: DashboardMediaSummary;
  trends: DashboardTrend[];
  dataHealth: DashboardDataHealth;
  quickLinks: DashboardQuickLink[];
};
```

既存の`MetricValue`、`Comparison`、`Availability`、`Confidence`、`Sample`を再利用する。`DailyBriefDto`を丸ごと複製せず、Daily Briefへのリンク情報だけを持つ。将来のMeeting Modeでも`stores`、`priorities`、`trends`を再利用できる形にする。

## 26. Architecture設計

```text
Query / Repository
  ↓
Adapter（Prisma Model → Analytics Input DTO）
  ↓
既存Analytics Engine
  ↓
Management Dashboard Integration
  ↓
ManagementDashboardDto
  ↓
Server Component または GET API
```

新しい計算をAPI・UIへ置かない。共通Snapshotをリクエスト内で一度生成し、Store/Trend/Data Health DTOをそこから派生させる。初版はServer ComponentからIntegrationを呼び、将来Meeting Modeや共有URLが必要になった段階でGET APIを追加する。

## 27. Query・性能設計

- 初回表示は主要Queryの一括取得を1回にまとめる
- 店舗ごとのN+1は禁止
- 必要列・期間・店舗を限定
- `mergedIntoCastId IS NULL`を共通条件化
- 最大期間92日
- グラフ系列は日次最大93点×対象店舗
- 店舗表は最大50行を想定し、超過時はページングまたは詳細画面へ移す
- Payloadは詳細キャスト行・日別媒体行を含めず、集約DTOに限定
- Query回数、行数、処理時間を開発環境で計測する。架空のms目標は設定しない

## 28. URL・フィルタ設計

Canonical URL：

```text
/analytics/management?period=current&from=YYYY-MM-DD&to=YYYY-MM-DD&stores=ALL&comparison=previousWeekday&primaryMetric=salesPerHour&view=summary
```

- 初期：`period=current&stores=ALL&comparison=previousWeekday&view=summary`
- `stores`はALLまたはカンマ区切りの許可店舗コード
- 不正店舗・期間は安全な既定値へ正規化
- リロード、共有URL、Browser Backで維持
- HOMEの`scope`、既存Analyticsの`store`は入力として受け付けるが、Dashboard URLは`stores`へ正規化
- Analyticsへ遷移時はfrom/to、比較、店舗範囲を引き継ぐ

単一店舗選択時もDashboardは店舗責務・DATA HEALTH・遷移の入口として残し、詳細指標はStore Analyticsへ誘導する。

## 29. Navigation設計

正式表示は「全店舗ダッシュボード」。配置はHOME直下の「日常運営」グループを推奨する。

- ADMIN：許可範囲のDashboard
- VIEWER：許可範囲の読み取り専用Dashboard
- 単一店舗権限：自店舗モード
- アイコン：既存Analyticsと同じデザイン体系
- モバイルナビにも同じ導線

Sidebar変更はD-2Bの実装対象とし、D-2Aでは変更しない。

## 30. 日本語・用語設計

|内部語|正式表示|短縮/Tooltip|
|---|---|---|
|Summary|全体サマリー|期間全体の要約|
|Priority|要確認順|次に確認する順序|
|Performance|成果|予約・成約・売上|
|Volume|実績データ|総量|
|Efficiency|効率|分母あたりの成果|
|Exposure|媒体露出|閲覧・掲載状況|
|Activity|活動状況|出勤・投稿|
|Data Health|データ状態|取込・欠測・Coverage|
|Comparison|比較結果|基準との差|
|Sample|サンプル数|母数・対象日数|
|Confidence|信頼度|母数に基づく信頼度|
|Availability|データ状態|利用可能/0/不足/対象外|
|Store Contribution|店舗別寄与|全体への構成|
|Goal Progress|目標進捗|実績と目標|
|Projected Sales|着地予測|単純ペースの参考値|

## 31. Loading / Empty / Error

### Loading

ページSkeleton、KPI Skeleton、店舗表Skeleton、グラフSkeletonを使用し、レイアウトシフトを抑える。

### Empty

営業データなし、店舗なし、比較不可、目標未設定、媒体対象外、媒体データ不足、Sample不足、Import未実施を別状態で表示する。

### Error

全体取得失敗はページエラー、媒体・店舗単位の失敗は該当セクションを`UNAVAILABLE`として残りを表示する。DATA HEALTH取得失敗を正常扱いしない。

## 32. Responsive

- 1920/1440/1280px：KPI 4〜6列、比較表とグラフ2列
- 1024px：KPI 3列、グラフ1〜2列
- 768px：KPI 2列、店舗表は横スクロールまたはカード
- 390px：サマリー→要確認→店舗カード→グラフの順。詳細指標は折りたたみ
- タップ領域44px以上、内部コード非表示

## 33. Desktopワイヤーフレーム

```text
[全店舗ダッシュボード] [期間] [店舗] [比較条件]
[最終更新 / データ状態]
[全体売上] [目標] [達成率] [着地予測] [売上/時間] [データ状態]
[店舗比較：Sample → Efficiency → Volume]
[店舗別要確認順]       [目標達成状況グラフ]
[売上/時間グラフ]       [店舗別売上推移]
[媒体対象範囲・注記] [詳細Analyticsリンク]
```

## 34. Mobileワイヤーフレーム

```text
[全店舗ダッシュボード]
[期間・店舗・比較条件]
[データ状態]
[全体売上 / 達成率]
[要確認順]
[店舗カード：Sample / Efficiency / Volume]
[グラフ（折りたたみ）]
[詳細Analyticsへ]
```

## 35. Accessibility

- `main`、`nav`、`section`のランドマーク
- h1→h2→h3の見出し階層
- 表に`caption`、`scope="col"`、固定列の読み上げ順
- ソート操作はbuttonとaria-sort
- 色だけで状態を表現せず、ラベル・アイコン・文言を併記
- グラフには要約テキストまたは代替表
- DATA HEALTH警告は`role="status"`または`role="alert"`を状態に応じて使用
- Tooltipはhoverだけでなくfocus/keyboardで表示

## 36. Security・権限

- 認証必須、既存`requireUser`を使用
- URLの店舗指定は必ずサーバー側で許可範囲を再検証
- 権限外店舗は404または対象外表示とし、存在を推測できる詳細を返さない
- APIを追加する場合も同じAdapter/Integrationを使用
- 期間は最大92日。異常な日付は400相当の入力エラーまたは安全な既定値
- SQL/Prismaエラー詳細を利用者へ露出しない

## 37. Performance Budget

- 初回表示：主要Queryは共通Snapshot 1回、補助Queryは必要最小限
- API：初版はServer Component 1回。API化時も1リクエストで集約DTOを返す
- N+1：0件
- グラフ：最大93日×店舗数
- 表：初期表示最大50行
- Client Component：フィルタ、ソート、グラフなど必要箇所のみ
- Hydration：ページ全体ではなく操作部とグラフに限定
- 実測項目：Query数、DB返却行数、Payload bytes、サーバー処理時間、初回表示までの時間

## 38. テスト設計

### Unit

- DTO変換
- 店舗比較
- 優先順位
- Availability / Confidence / Sample
- 目標未設定
- 対象外と欠測
- 比較期間
- URL正規化

### Integration

- ALL、春日部、越谷、野田、複数店舗、単一店舗
- Town/Heaven対象外
- PREVIEW_READY、FAILED、OPEN Error
- 目標なし、期間境界、Cast merge、店舗追加
- N+1が発生しないQuery監査

### API / Server

- 認証、VIEWER、ADMIN
- 不正店舗、権限外店舗、不正期間、最大期間
- 部分媒体失敗、全体失敗、Availability保持

### UI / Browser

- HOMEからの遷移と条件引き継ぎ
- 比較、詳細リンク、Back、Reload
- Loading/Empty/Error
- 390px/768px、キーボード、ARIA、Console Errorなし

## 39. Definition of Done

### Purpose

- HOMEと役割が重複しない
- Analyticsの代替にならない
- 店舗比較の意思決定に集中する

### Data / Architecture

- ZEROとMISSING、対象外と欠測を区別
- Availability、Confidence、Sampleを保持
- TownとHeavenを合算しない
- 媒体から予約への因果を断定しない
- UI/APIで再計算しない
- Integration/Engineを再利用
- N+1なし、同一データの重複取得なし

### UX / Quality

- 5〜10分で優先店舗を判断できる
- KPI 6個以内、グラフ3個以内、表2種類以内
- 日本語中心、詳細Analytics導線、条件引き継ぎ
- Mobile対応、Accessibility確認、Loading/Empty/Error確認
- lint、typecheck、test、build、Docker、Browser/E2E、Console確認
- DB変更なし（変更する場合は別承認）

## 40. 実装分割

### D-2B-1 DTO / Integration / Query

共通Snapshot、Query、Adapter、DTOを実装。完了条件はAvailability/Confidence/Sampleと店舗範囲の単体・Integrationテスト。

### D-2B-2 Shell / Filter / Summary

ページ、Canonical URL、権限、上部KPI、Loading/Empty/Errorを実装。

### D-2B-3 Store Comparison / Priority

店舗比較表と要確認順を実装。根拠・比較基準・詳細リンクを確認。

### D-2B-4 Graph / Media / Data Health

最大3グラフ、媒体対象範囲、店舗別DATA HEALTHを実装。媒体因果推定なしをテスト。

### D-2B-5 Responsive / Accessibility / E2E

390〜1920px、キーボード、ARIA、Back/Reload、Console、Regressionを確認。

### D-2B-6 Navigation / Rollout

Sidebar導線、VIEWER/ADMIN、段階リリース、実測性能を確認。

## 41. リスク

- 店舗別Goalが未設定で、達成率比較が作れない
- 媒体対象範囲の違いを利用者が単純比較する可能性
- Sample不足でもVolumeが目立つ可能性
- Daily Briefと同じ指標の表示重複
- 店舗数増加時の表・Payload肥大
- Data Healthと実績の更新時刻差
- 既存`scope`/`store`パラメータ互換

## 42. 未決定事項

- 店舗別Goalの運用開始時期
- Dashboardを全VIEWERへ公開するか
- 店舗優先順位のThresholdをどの程度にするか
- 目標未設定時に表示する店舗比較項目
- Dashboard APIを初版から公開するか
- 92日を超える比較の要否

## 43. 実装前にユーザー確認が必要な事項

1. 正式名称「全店舗ダッシュボード」でよいか
2. VIEWERの全体閲覧範囲
3. 初期比較基準を前週同曜日でよいか
4. 店舗別Goal未設定時の表示方針
5. Dashboard APIをD-2B-1で同時公開するか
6. Sidebar配置をHOME直下でよいか

## 44. 推奨実装順

まずD-2B-1で共通SnapshotとDTOを確定し、D-2B-2〜D-2B-4を小さくレビュー可能な単位で進める。最後にD-2B-5で実ブラウザ検証を行い、承認後にNavigationを有効化する。

## 45. 最終判定

# DASHBOARD DESIGN READY WITH DECISIONS REQUIRED

役割、店舗範囲、Sample → Efficiency → Volume、DTO境界、Query方針、状態表現、Responsive、Accessibility、DoD、実装分割まで設計済みであり、D-2Bへ進める状態である。

ただし、正式名称、VIEWERの全体範囲、店舗別Goalの運用、初版API公開、Sidebar配置についてユーザー確認が必要である。
