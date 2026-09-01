# Phase J0-H Membership Source-of-Truth Migration Design

## Status and scope

これはJ0-Hの設計記録である。J0-Gは `COMPLETE / Production VERIFIED` であり、現在のMembership状態は移行設計の前提として扱う。

本フェーズではLegacy判定を削除・置換しない。Resolver、Analytics、DB、Prisma schema、Migration、Production設定は変更せず、Shadow Read、Feature Flag、段階切替の契約だけを定義する。

Productionの既知の残件は、【退店】あずさ × 越谷の明示Human Review 1件である。これは自動Membership作成の根拠にせず、移行設計のblockerとはしない。

## 1. Legacy参照棚卸し

|領域|ファイル / 主な関数|現在のLegacy利用|Store / 日付|Membership移行可否・リスク|
|---|---|---|---|---|
|Town Resolver|`src/lib/imports/town/resolver.ts` `findCandidates`|`startedOn <= businessDate` かつ `endedOn` 範囲でCast候補を取得|Storeは行側の対象、businessDateあり|Membershipへ移行可能。ただし過去Alias解決と現在Listing再openを分離しないと退店Castを再current化するリスク|
|Town Resolution|`src/lib/imports/town/resolution-service.ts` `listCastCandidates` / `resolveTownCast`|新規Castの開始日検証、既存Castの期間判定、`primaryStoreId`入力|対象Batchの店舗、targetDateあり|新規Cast作成はLegacy互換を維持し、既存Castの在籍判定だけMembership shadowへ。joinedAt=NULLをstartedOnで補完しない|
|Town media state|`src/lib/imports/town/media-state-policy.ts`|`Cast.status`/`endedOn`、対象StoreのMembership状態、ignored Aliasでcurrent化可否を判定|Store・targetDateあり|Membershipを対象Store限定で参照する方向。退店後未来DatasetのFact保存とListing current化を分離する|
|Town bulk link|`src/lib/imports/town/bulk-link-service.ts`|候補表示・新規Cast作成で`status`, `startedOn`, `endedOn`, `primaryStoreId`を扱う|Storeあり、Batch日付あり|人物解決は履歴用途でLegacyを許容。自動再入店・primaryStoreによる所属推定は禁止|
|CTI Resolver|`src/lib/imports/cti/resolver.ts` `findCandidates`|`startedOn`/`endedOn`の期間内Castを候補化|行のstore、businessDateあり|Townと同じ。過去Fact解決は許可し、未来Datasetで退店Castをcurrent化しない|
|CTI Resolution|`src/lib/imports/cti/resolution-service.ts`|既存Cast期間検証、新規Castの`status=ACTIVE`, `startedOn`, `primaryStoreId`|Store・businessDateあり|新規作成のLegacy値は互換維持。Membership作成・再入店はImportから行わない|
|Heaven Resolver/Import|`src/lib/imports/heaven/service.ts` `planHeavenCastResolution`, `createHeavenAliasAndResolve`|AliasとCastの`startedOn`/`endedOn`期間、`primaryStoreId`、新規Cast作成|店舗・累計期間あり|Alias履歴解決と現在掲載を分離。退店Castの同名出現はHuman Reviewへ|
|Cast一覧/UI|`src/app/(dashboard)/masters/casts/page.tsx`|表示状態、退店/再入店導線、主表示店舗をLegacyから表示|Store表示あり、現在時点|Membershipを現在在籍店舗の表示正本へ段階移行。`primaryStoreId`は補助表示に残す|
|Master actions|`src/app/actions/masters.ts`|主所属更新、Cast.status/endedOn更新|現在操作|Cast-level Exit/Re-entryの互換同期は維持。判定の正本にはしない|
|Cast diagnosis|`src/lib/analytics/cast-diagnosis/detail.ts`|`startedOn`/`endedOn`をactiveFrom/activeToとして表示|Cast単位、期間あり|Membershipの店舗別期間へ拡張が必要。joinedAt=NULLはUNKNOWN表示|
|Cast trend|`src/lib/analytics/cast-trend/service.ts`|期間境界・診断対象をLegacy期間で決定|Cast単位、月/期間あり|Current切替後にHistoricalを切替。既存出力との差分をShadowで計測|
|Diary|`src/lib/analytics/diary/service.ts`|Legacy期間でCast一覧を絞り込み、`primaryStoreId`を返す|期間あり、Storeは補助|店舗別Membership判定に変更可能。日付不明期間を暗黙に埋めない|
|統合Analytics|`src/lib/analytics/integration/query.ts` / `adapter.ts`|Legacy期間・status・primaryStoreをCast metadataへ渡す|期間あり、Storeはprimary中心|複数店舗の母集団定義を明示してから切替|
|Marketing/Dashboard|`src/lib/analytics/marketing-dashboard.ts`, `src/lib/analytics/ui/performance-view-model.ts`|Cast期間・主店舗を表示/集計モデルへ渡す|主店舗中心、日付は行側|Membership店舗集合を表示に追加し、既存主店舗出力を壊さない|
|管理画面補助|`masters/casts/memberships`, start-date/merge/duplicate画面|Legacy状態・開始終了日をレビュー情報として表示|Cast/Store混在|監査画面ではLegacyとMembershipを併記し、どちらを根拠にしたか明示|

上表は主要な実行経路であり、切替時は同じ検索条件を持つ追加Queryもgrep監査する。特に `startedOn`/`endedOn` を日付範囲の母集団に使うQuery、`status = ACTIVE` の全件取得、`primaryStoreId` による店舗絞り込みを移行候補として扱う。

## 2. Membership判定契約

共通helper（実装は次フェーズ）を `isCastMemberAt({ castId, storeId, businessDate })` とする。判定はCast単位ではなくCast×Store×日付で行う。

### Current

対象Storeに、`status = ACTIVE` または `status = ON_LEAVE` のMembershipが1件以上あれば在籍とする。Current判定ではjoinedAt=NULLを許容し、過去開始日を推測しない。leftAtが設定済みで現在日より前の行は対象外とする。

### Historical

日付判定は次の境界を固定する。

`status ∈ {ACTIVE, ON_LEAVE}` かつ `joinedAt IS NOT NULL` かつ `joinedAt <= businessDate` かつ (`leftAt IS NULL` または `businessDate <= leftAt`)

`joinedAt = NULL` の行は、その日付について `UNKNOWN` とする。Legacy `startedOn` を代入して既知期間に変換しない。複数の非重複Membership期間がある場合は、該当期間が1つでもあれば在籍とする。

### ON_LEAVE

用途ごとに意味を分ける。Roster/在籍人数はACTIVEとON_LEAVEを含む「在籍」、稼働可能人数・出勤率の分子はACTIVEのみを基本候補とする。ランキングや新人判定は、ON_LEAVEを除外した値と含めた値をShadowで併記し、業務定義確定前に一律変更しない。

## 3. Feature Flag

候補環境変数は `MEMBERSHIP_READ_MODE=legacy|shadow|membership` とする。

- `legacy`（現行既定）: 既存結果のみ返す。
- `shadow`（初期Production候補）: Legacy結果を返しながら、同じscopeでMembership結果を計算し、差分だけを観測する。書込み・自動補正はしない。
- `membership`: 対象機能の返却値をMembership判定へ切り替える。Current系から開始し、Historical系は別承認とする。

初期は設定値を変更せず、実装時に未設定時の既定値を `legacy` としてfail-safeにする。将来、`MEMBERSHIP_READ_MODE_TOWN_RESOLVER` 等の機能別overrideを追加できるが、最初から多数のFlagを導入しない。

## 4. Shadow Observability

各ドメインで次を集計する（Production writeなし）。

- domain / function / store / businessDate範囲
- Legacy結果（Cast数、店舗別集合、ランキング母集団など）
- Membership結果（同じ定義）
- 差分分類: `MATCH`, `STORE_SCOPE_DIFFERENCE`, `MEMBERSHIP_MISSING`, `LEGACY_ACTIVE_MEMBERSHIP_INACTIVE`, `UNKNOWN_DATE`, `LEGACY_DATE_CONFLICT`, `REENTRY_DIFFERENCE`, `PRIMARY_STORE_DIFFERENCE`
- 差分件数、代表例（管理者が追跡できる内部ID。通常ログには表示名を出しすぎない）

既存の `memberships:shadow-audit` の集計契約を共通分類の基準にし、request-levelログは集約カウンタ中心とする。JSON artifactを必要時に出力し、個人情報や秘密値をログへ出さない。

J0-G時点のベースライン（47件のExpected Store Scope、Current Store Missing 0、Strong Dataset membership-free 0、date-range不整合0）を切替前の比較基準として保存する。あずさの1件は `REVIEW_REQUIRED` の説明済みHuman Reviewとして別枠にする。

## 5. 段階移行ロードマップ

1. **契約固定**: helper、ON_LEAVE、UNKNOWN、Store scope、差分分類をテストで固定。
2. **Master/UI shadow**: `/masters/casts` の現在在籍店舗表示をMembershipとLegacyで比較。主表示店舗は補助表示。
3. **Resolver current shadow**: Town/CTI/Heavenの現在current化判定を対象Store Membershipで計算し、退店後未来Dataset・IGNORED Alias・明示Re-entry guardを確認。
4. **Current Analytics shadow**: 在籍人数、ランキング母集団、出勤率の件数/集合を比較。ON_LEAVEの分母差を併記。
5. **Historical shadow**: Cast×Store×businessDateで比較。joinedAt=NULLはUNKNOWNとして報告し、Legacyで穴埋めしない。
6. **Canary切替**: まず管理画面のCurrent表示、次にResolverのcurrent判定、最後にCurrent Analyticsを機能・店舗単位で `membership` に切替。各段階で差分0または説明済み差分を確認する。
7. **Legacy縮小**: Legacy fieldsは互換同期・監査・履歴表示に限定し、削除は別計画で判断する。

一括切替、Importからの自動Membership生成、退店者の自動再入店は行わない。

## 6. Legacy fieldsの将来役割

- `primaryStoreId`: 主表示店舗、既定UI選択、旧API互換のみ。複数店舗在籍判定には使用しない。自動更新しない。
- `Cast.status`: Legacy互換・一覧表示・外部連携の暫定値。Cast-level Exit/Re-entryではMembershipと同期するが、Membership modeの在籍判定根拠にはしない。
- `Cast.endedOn`: Legacyの全体退店日。店舗別期間の代替にしない。MembershipのleftAtから自動再構成しない。
- `Cast.startedOn`: Legacy開始候補。joinedAt=NULLのHistorical期間を補完しない。

## 7. リスクと受入条件

- joinedAt=NULLによりHistorical結果がUNKNOWNになる。UNKNOWNを0件・非在籍へ暗黙変換しない。
- ON_LEAVEの扱いで在籍人数と稼働可能人数の数字が変わる。用途別定義を承認する。
- primaryStoreと複数Membershipの差は仕様差であり、異常と誤認しない。
- 退店済みCastの過去Factは解決可能だが、未来Datasetでcurrent Alias/Listingを再openしない。
- キャッシュ・集計期間・丸め差をShadow比較で吸収する。

Membership modeへの各段階の受入条件は、差分が `MATCH` または説明済みのExpected/Human Reviewだけであること、書込みが発生しないこと、既存ImportのFact結果が変わらないこととする。

## 8. 推奨実装順

1. 共通判定helperと単体テスト
2. Shadow adapter/分類・JSON artifact
3. Master/UI Current表示のshadow
4. Town/CTI/Heaven current resolver shadow
5. Current Analytics（人数・ランキング・出勤率）shadow
6. Historical Analytics shadowとUNKNOWN表示
7. 機能別Canary flag
8. Legacy参照縮小のDecision Record

本書作成時点では、上記のコード・DB・設定は変更していない。Productionも未変更である。

## J0-H3 CTI Historical Resolver Shadow

CTI CAST Resolver向けに、実績日と対象Storeを使ったHistorical Membership Shadowを実装した。既存Legacy Resolverの解決結果は変更せず、`memberships:cti-resolver-shadow` Read-only CLIで最新・中間・過去の成功Batchを比較する。

出力は `MEMBER` / `NOT_MEMBER` / `UNKNOWN` の3値、差分分類、Legacy run A/B差分、ShadowによるLegacy結果差分を含む。Productionは `MEMBERSHIP_READ_MODE=legacy` のままとし、DB・Fact・Alias・Membershipへの書込みは行わない。

Status: J0-H1 COMPLETE / Production VERIFIED、J0-H2 COMPLETE / Production VERIFIED、J0-H3 IMPLEMENTATION（Production Canary未実施）。

## J0-H4 Analytics Current Store Scope Membership Shadow

H4では、現在の店舗別Cast Scopeを対象に、Legacy（`Cast.status` + `primaryStoreId`）とMembership（対象Storeの`ACTIVE`/`ON_LEAVE`）をRead-only比較する基盤を追加した。`npm run memberships:analytics-scope-shadow` は春日部・越谷を対象に差分分類と決定性ガードを出力する。Legacy結果、KPI、ランキング、Historical判定、Production設定は変更しない。

初回CanaryではprimaryStoreIdを仮想Legacy baselineとしていたため、実Analytics Readerとの差異が判明した。現在は`fetchAnalyticsSnapshot`のCTI/Town/Heaven fact store scopeをLegacy baselineとして使用し、退店・複数店舗差分を分類する。H4 status: IMPLEMENTATION / CANARY REWORK REQUIRED。

その後のレビューで、全期間Fact（2000年〜現在）もCurrent Scopeではないことを確認した。H4 CLIは仮想baselineを廃止し、現時点では`ANALYTICS CURRENT SCOPE AUDIT COMPLETE / NO SAFE CURRENT-ROSTER READER FOUND`を返す。Historical Fact Scopeは従来どおり維持し、Current Roster Readerの選定後にのみShadow Canaryを再開する。Status: IMPLEMENTATION / BASELINE RESELECTION。

## J0-H5 Town CAST Formal Switch Preparation

Town専用の`TOWN_CAST_MEMBERSHIP_READ_MODE`（`legacy` / `shadow` / `membership`）とRead-only formal-switch Canaryを追加した。Membership modeはCurrent dataset semanticsに限定し、Historical・reparse・任意過去日付ではLegacyへfallbackする。Productionはlegacyのまま。H5 status: COMPLETE / Production VERIFIED。

Current semanticsはGoogle Drive由来だけでは成立しない。通常Executeかつ明示`datasetSemantics=current`、単日であることをhelperが検証し、manual・reprocess・過去期間はhistoricalへfallbackする。Canaryはcurrent/historical双方のeffectiveMode、eligibility、fallback理由を出力する。Status: CURRENT DATASET RESOLVER CANARY VERIFIED / HISTORICAL FALLBACK IMPLEMENTED / CURRENT SEMANTICS HARDENING REQUIRED。

## J0-H6 Current Reader Membership Migration Inventory

全コード検索（`src/app`, `src/lib`, `src/components`, `scripts`）では、Legacy在籍項目（`status`, `startedOn`, `endedOn`, `primaryStoreId`）を含む参照が349箇所（テスト・監査・移行スクリプトを含む）確認された。用途を次のように分類した。

| 分類 | 主な箇所 | 判定 | 優先度 |
| --- | --- | --- | --- |
| CURRENT_ROSTER_SAFE_CANDIDATE | `/masters/casts` のMembership表示・店舗操作、将来のCurrent roster reader | Membershipへ移行候補。ただし現UIの退店・再入店はCast legacy同期を併用 | P0/P1 |
| CURRENT_GLOBAL_CAST_STATE | `/masters/casts` の`Cast.status`表示、exit/reentry | 店舗Membershipと人物全体状態を分離して段階移行 | P1 |
| HISTORICAL_DATE_SCOPE | `src/lib/imports/*/resolver.ts`、`imports/[id]`、start-date maintenance、cast trend | business/target date判定。Current Membershipで置換禁止 | DEFER |
| FACT_SCOPE | `analytics/integration/query.ts`, diary, goal benchmarks, weekday, data-health | Factの期間・storeIdがscope。Membership filter禁止 | DEFER |
| DISPLAY_ONLY_LEGACY | cast view-model、performance/dashboard DTO、primary store表示 | 表示/default/互換用途。自動削除・自動修正しない | P2 |
| AUDIT_OR_MIGRATION | membership gap/shadow/store-scope/date-range audit、reparse/repair scripts | 比較・監査のためLegacy参照を維持 | F |

主要Reader監査：`fetchAnalyticsSnapshot()`はCTI/Town/Heaven Factを期間取得するMixed/FACT_SCOPEであり、Current roster readerではない。`cast-diagnosis/service.ts`、`diary/service.ts`、`integration/service.ts`、`goal-benchmarks.ts`も期間Factを母集団にするため、H6のCurrent Membership切替対象外とした。`/masters/casts`は現在Membershipを表示・操作する最有力のP0候補だが、一覧のLegacy status表示は互換表示として残す。

Alias管理は`CastAlias.validFrom/validTo`とmedia/store scopeを使う期間解決で、Historical resolverとCurrent表示を分離する必要がある。MediaListingは掲載履歴の正本でありMembershipへ統合しない。CTI/Heaven resolverはtarget/business dateを使うHistorical処理のため、Current Membershipへの切替候補外（Town CASTのみH5でCurrent dataset限定切替済み）。selector/dropdownや新規Cast作成フォームの`primaryStoreId`/`startedOn`はP2または別途Human入力改善対象である。

H6では共通helperやcall site切替を追加していない。次の優先対象は、Legacy factを母集団にしない独立したCurrent roster readerを新設または特定した上で、Master UIのCurrent店舗表示をShadowすること。H6 status: CURRENT READER INVENTORY COMPLETE / FORMAL ANALYTICS SWITCH DEFERRED。

## J0-H7 Masters Casts Current Roster Shadow

`/masters/casts`は現状、検索・統合除外を行った全Cast一覧であり、店舗別Legacy roster filterは存在しない。Membership側には対象Storeの`ACTIVE`/`ON_LEAVE`のみを返すN+1なしのreaderを追加し、`memberships:masters-roster-shadow`で既存global listとの差分をRead-only確認する。正式UI結果・Cast status・primaryStore・検索・ページングは変更しない。H7 status: IMPLEMENTATION / STORE-SCOPED LEGACY BASELINE REQUIRED。

H8ではStore filterを`store=KASUKABE|KOSHIGAYA`として正式統合する。指定時のみMembership relation filterを適用し、未指定時は既存Global Listを維持する。検索はAND条件、無効値はGlobalへfallbackする。

H8 status: COMPLETE / Production VERIFIED。

## J0-H9 Masters Casts Membership Operations UI

`/masters/casts`の表示を、Membershipを主表示、Cast.statusを「人物状態」、primaryStoreIdを「表示用主店舗（Legacy）」として分離した。StoreごとのACTIVE / ON_LEAVE / LEFTを色だけに依存しない文言Badgeで表示し、既存の在籍追加・Cast単位退店・再入店・履歴リンクActionは変更していない。H9 status: MASTERS CASTS MEMBERSHIP OPERATIONS UI IMPLEMENTATION。

## J0-H10 Legacy Cast State Dependency Reduction Audit

Legacy参照をCurrent Store Membership、Person Global State、Display/Default、Historical/Fact、Audit/Migrationへ分類した。店舗所属の正本は`CastStoreMembership`、`Cast.status`は人物global lifecycle、`primaryStoreId`はdisplay/default/Legacy互換、`startedOn`/`endedOn`は人物global・Historical互換として当面維持する。

Read-only drift audit `npm run memberships:legacy-state-drift-audit` を追加した。Cast/Membershipの不整合を分類・表示するだけで、自動修復は行わない。H10 status: LEGACY CAST STATE DEPENDENCY REDUCTION AUDIT IMPLEMENTATION。

## J0-H11 Legacy Global Lifecycle Drift Review

`memberships:global-lifecycle-review`で、全MembershipがLEFTのACTIVE Castを、退店marker・Current Alias/Listing・最新成功Town CAST evidence・Merge疑いに基づき分類する。`SET_CAST_INACTIVE`やMerge Membership closeはRepair予定値として表示するのみで、Cast/Membership/endedOnの更新は行わない。退店日を推測しない。H11 status: GLOBAL LIFECYCLE DRIFT REVIEW IMPLEMENTATION。

### H11 Review scope refinement

レビュー対象は全Castではなく、(a) `Cast.status=ACTIVE` かつCurrent Membershipが0の非merged Cast、または (b) `mergedIntoCastId` がありCurrent stateを持つmerged source に限定する。正常なCurrent Membershipを持つnon-merged Castは `NOT_REVIEW_TARGET` としてノイズなく除外する。merged sourceは `MERGED_SOURCE_CLEAN`（current Membership/Alias/Listingなし、`NO_ACTION`）と、Membership/Mediaの残存状態別P0 reviewへ分離し、修復は行わない。`primaryStoreId` は表示用Legacy差分として別集計する。H11 status: PRODUCTION CANARY COMPLETE / REVIEW SCOPE REFINEMENT REQUIRED。

## J0-H12 Merged Current State Repair Preparation

`memberships:merged-state-repair-preview` は merged source のP0をStore・mediaType単位で比較するRead-only Previewである。同一Storeのcurrent Membership、同一Store/mediaTypeのcurrent Listingがtargetにも存在する場合のみsource close候補とし、不足resourceは `REVIEW_TARGET_*_MISSING` として自動移管・作成しない。Apply CLIは明示的な `--confirm=CONFIRM`、`MEMBERSHIP_MERGED_REPAIR_ENABLED=true`、`--close-date=YYYY-MM-DD` を要求し、推測日付を使用しない。source/target advisory lock、Serializable transaction、MediaListingHistory保存を維持する。H12 status: MERGED CURRENT STATE REPAIR / IMPLEMENTATION（Production Apply未実施）。
