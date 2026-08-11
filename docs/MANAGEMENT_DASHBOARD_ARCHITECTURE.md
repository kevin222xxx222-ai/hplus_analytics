# Management Dashboard Architecture

## 役割

Management Dashboardは、当月・全店舗の実績、店舗間差異、データ状態を観察し、次に詳細確認する画面を選ぶための画面です。目標・着地予測・施策判断はHOMEが担当します。

## レイヤー

`Query / Repository → Adapter → Analytics Engine / Integration → DTO → UI`

UIは集計・比較・比率・状態判定を行わず、DTOを表示します。

## 固定表示

対象は現在の営業月と全店舗です。期間・店舗・日次/週次切替は持たせません。営業月の境界は既存のdate utilityとAnalytics基盤を使用します。

## Store State

店舗を単一スコアで評価せず、データ状態、上昇指標、低下指標、横ばい指標、母数を個別に表示します。因果関係は示しません。

## DATA HEALTH

未確定Batch、FAILED、OPEN Error/Warning、最新反映日、店舗別状態を要約し、詳細はDATA HEALTHへ委譲します。

## 将来拡張

日次、週次、媒体、本指名のTrend DTOを追加できます。新しい永続化は不要とし、既存Snapshotから生成します。

## Chart DTO

日次Chart DTOは、`chartId`、指標、単位、営業日ラベル、店舗系列、Tooltip設定、Data Health、Empty Stateを持ちます。週次DTOも同じ系列構造を再利用します。

## 日次推移生成フロー

`fetchAnalyticsSnapshot → adaptSnapshot → buildDailyCharts → ManagementDashboardCharts` の順で生成します。各指標の集計、店舗全体系列、比率、欠測判定はIntegration側で行い、UIは描画だけを担当します。

## Store Series

CTIは全体・春日部・越谷・野田、Townは全体・春日部・越谷、Heavenは春日部のみです。対象外店舗の0系列は作成しません。

## Missing Data Policy

欠測はnullのまま保持し、線を接続しません。0件、未取得、一部欠測、対象外を別状態としてDTOに保持します。

## Client / Server Component境界

データ取得とDTO生成はServer側、SVGの描画・Tooltip・凡例だけを`ManagementDashboardCharts` Client Componentで行います。
# Phase F-1D Story Section Architecture

Management Dashboardは、既存SnapshotをIntegrationで一括取得し、`DashboardStorySectionDto`へ再構成してから表示する。UIはStoryの順序・対象範囲・欠測状態を解釈せず、そのまま縦に描画する。

## Story / Scope Block

`売上と成約数`、`稼働と成果`、`Town集客と成果`、`Heaven活動・閲覧・成果`、`本指名の状態`の順に、全体または店舗単位のScope Blockを返す。CTIは全体・春日部・越谷・野田、TownはTown対象全体・春日部・越谷、Heavenは春日部のみとする。対象外のグラフは生成しない。

## Synchronized Date Axis

各Block内のChartは同じbusiness-date labels、plot幅、欠測日位置を共有する。異なる単位は別Chartとし、二重軸や重ね描画を行わない。UIでの再集計・分類は行わない。

## Business Data Quality Note

越谷・野田では、春日部所属キャストの売上が店舗計上されても勤務時間が春日部側にのみ記録される場合がある。勤務時間のコピー・売上比率による按分・推定時間生成は行わず、Dashboardでは参考値として注記する。

店舗別売上／時間はこの制約を含むため主要Storyから除外する。Engine・DTOの効率計算と他画面の責務は変更しない。

## Dual-Axis Relationship Chart

F-1EではIntegrationが`DashboardRelationshipChartDto`を一括生成する。1カード1Scopeとし、左軸は原則売上の棒、右軸は比較指標の線、X軸はbusinessDateで固定する。UIは値・方向・関係性サマリーを再計算しない。

前日差の方向一致率は相関係数ではなく、同方向日 ÷（同方向日＋逆方向日）である。変化なし・欠測日は分母から除外する。HeavenのPAGE_ACCESS×DIARY_POSTS、成約数×PAGE_ACCESSは明示された補助グラフとして例外扱いする。
# Dashboard v2: Story Card Architecture

Management Dashboard v2は、既存のRelationship DTOをIntegration層でStory Card DTOへ再構成し、UIは完成済みカードを描画する。1カードは1つのStoryと1つのScopeだけを持ち、Scopeをグラフ内で重ねない。カード順、Scope順、見出し指標、グラフ順、データ状態、注記、導線はIntegrationで固定する。

## F-2B Trusted Data Scope

店舗ごとに正式に信頼できる指標範囲を異なるものとして扱う。春日部はCTI・Town・Heavenの主要分析、越谷は売上とTown、野田は売上推移と正式な成果値を中心とする。勤務時間の店舗帰属に業務上の制約がある越谷・野田の稼働RelationshipはStory Cardへ生成しない。対象外・欠測・業務データ制約は区別し、UIではなくIntegrationのdisplayPolicyとdataReliabilityで確定する。

店舗比較は横スクロール表ではなく、店舗実績カードを使用する。デスクトップ2列、狭い幅では1列へ縮退し、ページ全体に横スクロールを発生させない。

Storyは「売上と成約数」「売上と稼働」「Town集客と成果」「Heaven活動・閲覧・成果」「売上と本指名」の5種類とし、カード数は16枚（4+4+3+1+4）を基準とする。Town全体は春日部＋越谷、Heavenは春日部のみである。

同一カード内のRelationship Chartは同一business-date domain、営業日順、plot margin、日付ラベル規則、欠測位置を共有する。UIで日次集計、Story分類、Scope判定、方向一致率、Headline Metric、Data Healthを計算しない。

Card-level Data Healthはグラフ単位のBadgeを重ねず、最新反映日・欠測日・参考値注記をカードFooterへ集約する。越谷・野田の出勤時間は計上制約を明示した参考値であり、補完・按分しない。

Chart描画だけをClient Componentとし、Query / Adapter / Engine / Integration / DTOはServer側で維持する。旧Relationship配列は他画面・互換テストのため保持できるが、Management Dashboardの表示はStory Card DTOのみを利用する。
# F-2C Final Polish

## Store Overview Integration

`storeOverview` は Store State と Store Performance を店舗単位で統合した表示用DTOです。UIは前月同期間比を再計算せず、Integrationで完成した比較値を表示します。比較不能はデータ不足・算出不能として保持します。

## Media Scope and Duplicate Removal

媒体横断の正式な比較は春日部1件のみで、Town PV（棒）と Heaven PAGE_ACCESS（線）を絶対値で返します。Town UU × Heaven PAGE_ACCESSは廃止し、Town PV × Town UUは各Town Storyに限定します。OKINI_TALK_SENTは正式DTO未接続のため空系列を生成しません。

## Final page structure

Header / DATA HEALTH → 全店舗サマリー → 店舗概要 → STORY 1〜8 → 詳細分析導線の順序とします。店舗概要はカード型で、横スクロールテーブルを使用しません。
