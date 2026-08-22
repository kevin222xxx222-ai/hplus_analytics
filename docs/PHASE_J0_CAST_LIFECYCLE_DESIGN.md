# Phase J0-A Cast Lifecycle / Store Membership Design

更新日: 2026-08-20  
Status: J0-E COMPLETE / Production VERIFIED（Resolver・Analytics切替は未実施）

## 1. 目的と適用範囲

Castは人物の恒久的なマスターとして維持し、店舗ごとの在籍期間・退店・再入店・休業を別の履歴として保持する。これにより、現在在籍・過去時点在籍・新人・在籍期間・退店前推移を同じ人物IDで再現できるようにする。

J0-Aではデータモデル、互換性、Migration方針だけを確定する。Resolver、Analytics、UI、Production DBは変更しない。

J0-EでCurrent Membership初期化をProduction Canaryまで完了した。現在Membershipの正本は`CastStoreMembership`とし、日常の追加・Cast単位退店・再入店・休業操作はMembership serviceへ集約する。Cast単位退店ではLegacyの`status/endedOn`も同一transactionで同期し、Resolver/Analyticsの切替はJ0-F以降に読み取り比較を行ってから判断する。

## 2. 現行構造の監査結果

`prisma/schema.prisma` の現行Castは、`status`、`startedOn`、`endedOn`、`primaryStoreId`を持つ。`endedOn`は存在するがCast全体の単一終了日であり、店舗別履歴・再入店・休業・複数店舗同時在籍は表現できない。

現行の周辺モデルは次の役割である。

| Model | 現在の役割 | 在籍履歴としての限界 |
|---|---|---|
| `Cast` | 人物マスター、全体状態 | 店舗別・複数期間を持てない |
| `Store` | 店舗マスター | Cast所属履歴は持たない |
| `CastAlias` | 媒体・店舗別の名前解決、`validFrom/validTo` | Aliasの有効期間は雇用期間ではない |
| `MediaListing` | 媒体掲載状態、`listedFrom/listedTo` | 掲載期間は在籍期間ではない。1媒体・1店舗・1Castの現行行のみ |
| `CastNameHistory` | 表示名変更履歴 | 所属履歴ではない |
| `CastStartDateBulkChangeHistory` | 開始日変更の監査 | 店舗別Membershipではない |

現行Schemaには`CastStoreMembership`相当の在籍履歴テーブルはない。

## 3. 推奨Schema

新規モデル名は`CastStoreMembership`とする。

```text
CastStoreMembership
  id                  UUID PK
  castId              UUID NOT NULL
  storeId             UUID NOT NULL
  joinedAt            DATE NULL
  leftAt              DATE NULL
  status              ACTIVE | ON_LEAVE | LEFT
  source              VARCHAR NULL
  sourceConfidence    CONFIRMED | INFERRED | UNKNOWN
  note                TEXT NULL
  createdAt           TIMESTAMPTZ
  updatedAt           TIMESTAMPTZ
  createdByUserId     UUID NULL
  updatedByUserId     UUID NULL
```

`castId`と`storeId`は必須とする。人物と店舗の所属履歴は削除せず、CastおよびStoreへの参照は`Restrict`を基本とする。

### 3.1 日付の意味

- `joinedAt`: その店舗の所属開始日。判明しない場合はNULL。
- `leftAt`: その店舗の所属終了日。退店日不明の場合はNULL。
- 判定境界は当面inclusiveとする。つまり`joinedAt <= businessDate <= leftAt`を在籍期間とする。
- 「退店日当日のFactを含める」仕様を正式採用する。翌日以降は所属外とする。

### 3.2 statusと日付の整合性

期間の事実は`joinedAt/leftAt`、現在の運用状態は`status`に分離する。

- `ACTIVE`: `leftAt`はNULLが原則。
- `ON_LEAVE`: `leftAt`はNULLが原則。休業期間を別途分析する場合は将来の休業履歴へ拡張する。
- `LEFT`: `leftAt`が既知なら必須。

退店済みだが退店日不明の既存データを表現するため、`LEFT`かつ`leftAt=NULL`を完全禁止すると移行不能になる。したがって移行期間は`sourceConfidence=UNKNOWN`の場合に限り例外を許容し、UI上は「退店日不明」と表示する。将来、状態を厳密にしたい場合は`LEFT_UNKNOWN_DATE`を追加する選択肢を残す。

## 4. NULLと信頼度方針

推測値の自動投入は禁止する。

- 開始日不明・現在在籍: `joinedAt=NULL`, `leftAt=NULL`, `status=ACTIVE`, `sourceConfidence=UNKNOWN`
- 過去所属は確認できるが期間不明: 日付NULL、`sourceConfidence=UNKNOWN`、手動Review対象
- 退店済みだが退店日不明: `status=LEFT`, `leftAt=NULL`, `sourceConfidence=UNKNOWN`
- 根拠がある期間: 実日付、`sourceConfidence=CONFIRMED`

将来、開始日と退店日の確度が異なるケースが多い場合は、`joinedAtConfidence`と`leftAtConfidence`へ分割する。J0-Aではまずレコード単位の`sourceConfidence`で開始し、詳細化はJ0-Bの判断事項とする。

## 5. 期間重複防止

同一`castId + storeId`のMembership期間は重複禁止とする。一方、同一Castの異なる店舗間の同時在籍は許可する。

```text
2025-01-01 ～ 2025-06-30
2025-07-01 ～ NULL       OK

2025-01-01 ～ NULL
2025-05-01 ～ NULL       NG
```

PostgreSQLでは、将来的に`daterange`と`EXCLUDE USING GIST`による排他制約をMigration SQLで追加できる。Prisma schemaだけではexclusion constraintを表現できないため、初期実装では以下を併用する。

1. Serviceのトランザクション内で重複検査
2. 同一Cast・店舗へのadvisory lock
3. 既知日付のMembershipに対するPostgreSQL exclusion constraint

NULL境界を含む暫定データは、期間確定時に再検証する。DB制約だけに依存しない。

## 6. 再入店

再入店は既存Membershipの再利用や`leftAt`の削除ではなく、新規行を追加する。

```text
Cast A / 春日部
1: 2024-01-01 ～ 2025-01-31 / LEFT
2: 2025-05-01 ～ NULL         / ACTIVE
```

Cast ID、Alias、過去Fact、ImportBatchは維持する。再入店はImportの出現だけでは発生させず、Operatorの明示操作または確定したMembership Importでのみ行う。

## 7. 複数店舗とprimaryStoreId

春日部ACTIVEと越谷ACTIVEの同時状態を許可する。`primaryStoreId`は当面残し、表示上の主所属・既存互換用途に限定する。

新Membership導入後の分析母集団はMembershipを正とし、`primaryStoreId`から在籍を推測しない。将来的に主所属をMembershipから導出するか、Operatorが明示的に設定するかをJ0-Bで決定する。

## 8. 休業

J0-Aでは`ON_LEAVE`をMembershipの現在状態として採用する。休業の開始日・終了日を複数回記録する必要が出た場合は、次のいずれかをJ0-Bで選択する。

- `CastStoreLeavePeriod`を追加する
- Membership自体を状態期間の履歴テーブルへ拡張する

今回、休業を`leftAt`で表現して退店扱いにすることは禁止する。

## 9. Legacy Cast fieldsとの関係

以下は削除しない。

- `Cast.status`
- `Cast.startedOn`
- `Cast.endedOn`
- `Cast.primaryStoreId`

推奨は「Membershipを新しい正本、Legacy項目を互換表示・段階的Derived値」とする方式である。長期的なdual-writeは不整合を生むため、ResolverやAnalyticsの移行完了後に、Cast側への書込みは廃止する。

移行期間中に旧UIからCast側だけが更新されると不整合になるため、J0-Bでは管理ActionをMembership serviceへ集約し、Legacy項目は同一トランザクションで互換更新するか、読み取りDerivedに限定するかを決定する。

## 10. 既存データMigration方針

自動Backfillは証拠のある範囲に限定する。

### 分類

1. 期間根拠あり: 手動確認済みの所属情報
2. 現在在籍だが開始日不明
3. 過去所属だが期間不明
4. `primaryStoreId`のみ確認可能
5. 複数店舗Factが存在

### 禁止事項

- Factの最後の日付を退店日と推測しない
- Aliasの最後の`validTo`や最終出現日を退店日としない
- `startedOn`を無検証で全Membershipへコピーしない
- `endedOn`を無検証で店舗退店日にコピーしない
- 現在のCast数だけで所属履歴を生成しない

初期Migrationは、空のMembership tableを作成してから、根拠の確認できる行だけを明示的なBackfill scriptで登録する。その他はManual Review queueへ送る。Migration SQLとBackfillは分離し、Backfill失敗時にSchema migrationを巻き戻す必要がない構成にする。

## 11. Import Resolver移行方針

J0-AではResolverを変更しない。対象は将来のQuery契約だけ定義する。

CTI、Town、HeavenのResolverは、対象`businessDate`と`storeId`を受け取り、次の判定をMembershipへ移行する。

```text
(joinedAt IS NULL OR joinedAt <= businessDate)
AND
(leftAt IS NULL OR leftAt >= businessDate)
```

ただし、日付不明Membershipを自動的に全期間有効と扱うか、Reviewへ送るかはJ0-Bで決定する。安全側の初期案は、日付不明を自動再有効化せず、既存AliasとManual Reviewを優先することである。

Importで退店者が登場しても、Castのstatus・endedOnを自動変更しない。

## 12. Analytics移行方針

将来のAnalytics APIは`asOfDate`または対象期間を明示し、現在状態ではなく対象日Membershipで母集団を決定する。

- 在籍人数: 対象日時点で有効なMembership数
- 出勤率: 対象日時点の在籍者を分母にするかを明示
- 新人: Membershipの最初の`joinedAt`を基準にするかを決定
- ランキング: 実績日ごとのMembershipでフィルタ
- 退店前分析: `leftAt`から逆算
- 在籍期間別生産性: `joinedAt`から対象日または`leftAt`までで算出
- Morning Report: 日次FreshnessとMembership母集団の両方を表示

既存の`startedOn/endedOn`参照箇所は、以下を中心に段階移行する。

- `src/lib/analytics/integration/query.ts`
- `src/lib/analytics/diary/service.ts`
- `src/lib/analytics/cast-diagnosis/detail.ts`
- `src/lib/analytics/cast-trend/service.ts`
- `src/app/(dashboard)/analytics/casts/*`
- `src/app/(dashboard)/imports/*`のCast候補Query

## 13. 推奨Index

最低限、以下を設計する。

```text
INDEX (castId, storeId, joinedAt)
INDEX (castId, storeId, leftAt)
INDEX (storeId, status, joinedAt)
INDEX (storeId, status, leftAt)
INDEX (castId, status)
```

実際のas-of検索では、`storeId`と日付範囲を先に絞るQuery形状を採用する。Factの`castId/storeId/date`既存Indexと合わせ、Membership取得後にFactを取得するか、対象日MembershipをJOINする。

## 14. UI要件（J0-B以降）

必要な操作は以下である。

- Membership追加
- 店舗退店
- 再入店
- 休業開始・復帰
- 日付修正
- source / confidence修正
- 変更理由・変更者の記録
- 履歴の時系列表示
- 期間重複エラーの表示

既存のCast一覧にある`ACTIVE/INACTIVE`切替は、将来的にMembership操作へ置換する。Import Reviewからの既存Cast紐付けは、Castの再有効化操作と分離する。

## 15. Migration / Rollout順

1. J0-A: SchemaとMigration SQLのレビュー・承認
2. 新テーブルとIndexのみDeploy
3. Backfill対象を監査し、手動承認
4. 根拠ありMembershipだけBackfill
5. 既存Cast QueryとMembershipの差分監視
6. Membership読み取りHelperを追加
7. Cast管理UIをMembership操作へ移行
8. CTI/Town/Heaven ResolverをbusinessDate + storeId基準へ移行
9. Analytics・Ranking・Diagnosis・Trendを移行
10. Legacy Cast fieldの書込み停止方針を確定

Rollbackは、旧Queryを維持したままMembership読み取りをFeature Flagで無効化できるようにする。既存FactやCastを削除するRollbackは行わない。

## 16. リスク

- `Cast.status`とMembership.statusの二重管理
- 日付不明データを誤って全期間在籍扱いすること
- 複数店舗の重複所属
- 再入店期間の重複
- Alias期間とMembership期間の不一致
- Cast Merge時のMembership移行漏れ
- 現在の`startedOn/endedOn`参照Queryの取り残し
- Heaven累計データの期間判定
- 退店者を現在ランキングから誤って除外すること
- Import出現による意図しない再有効化

## 17. Open Questions

- 日付不明MembershipをResolverで自動採用するか
- `LEFT_UNKNOWN_DATE`をstatusとして追加するか
- `sourceConfidence`を開始日・退店日別に分割するか
- ON_LEAVEの期間履歴を別テーブル化する時期
- `primaryStoreId`をDerivedにするか
- 同日再入店・退店の境界をどう表現するか
- MembershipをCast Mergeの移行対象に含める詳細

## 18. 今回の変更範囲

- 新規Documentation: `docs/PHASE_J0_CAST_LIFECYCLE_DESIGN.md`
- コード変更: なし
- Prisma schema変更: なし
- Migration変更: なし
- Backfill実行: なし
- DB更新: なし
- UI変更: J0-DでReview / Management UIを追加（詳細は`docs/PHASE_J0_CAST_MEMBERSHIP_UI.md`）
- Resolver変更: なし
- Analytics変更: なし
- Production変更: なし

## 19. J0-B実装結果

J0-Bで以下を正式導入した。

- `CastStoreMembership` model
- `CastMembershipStatus` enum (`ACTIVE`, `ON_LEAVE`, `LEFT`)
- `CastMembershipSourceConfidence` enum (`CONFIRMED`, `INFERRED`, `UNKNOWN`)
- Cast・Store・UserとのRelation
- `cast_store_memberships` tableと基本Index
- `LEFT`の`leftAt`必須、`ACTIVE/ON_LEAVE`の`leftAt` NULL、日付順のDB CHECK
- 同一Cast・店舗の期間重複を防ぐService validationとtransaction advisory lock
- inclusiveなas-of判定（`joinedAt`当日・`leftAt`当日を在籍扱い）
- 再入店用の新規Membership作成Service

既存CastからのBackfill、Resolver切替、Analytics切替、UI、Production Migration適用は行っていない。

## 20. J0-C Backfill監査結果

J0-Cでは既存CastのBackfill候補分類とDry-run CLIを追加した。Legacy `startedOn/endedOn`には信頼度メタデータがないため、デフォルトではSAFE_AUTO/SAFE_LEFTへ自動分類せず、DATE_UNCERTAINとしてManual Reviewへ送る。複数店舗のAlias・Listing・Fact根拠、店舗不明、既存Membershipはそれぞれ専用分類とする。

CLIは`npm run memberships:backfill-audit`で実行し、`artifacts/audits/`へJSONレポートを生成する。DB更新・Backfill・Apply CLIは行わない。詳細は`docs/PHASE_J0_CAST_MEMBERSHIP_BACKFILL.md`を参照する。

## 21. J0-D Review / Management UI

`/masters/casts/memberships`に、Backfill分類・店舗根拠・Membership履歴を確認する管理画面を追加した。ViewerはRead Only、Adminだけが既存Membership Service経由で変更できる。Fact・Alias・MediaListingの期間は根拠表示に限定し、Membershipへ自動適用しない。Production Backfill、Resolver切替、Analytics切替は未実施である。

## 22. J0-E Current Membership Initialization / Cast Management Integration

現在媒体EvidenceをCast・店舗単位で判定し、`/masters/casts/memberships/initialize`でPreview後にAdminが明示Confirmできる導線を追加した。日常の店舗追加・退店・再入店は`/masters/casts`へ統合し、Membershipを正本として扱う。Production Apply、Resolver切替、Analytics切替は未実施である。
