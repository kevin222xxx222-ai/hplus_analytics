# Phase J0-C Existing Cast Membership Backfill / Migration Audit

更新日: 2026-08-20  
Status: DRY-RUN AUDIT ONLY

## 1. 目的

既存Castから`CastStoreMembership`を作成できる根拠があるかを監査する。今回のCLIは分類とJSONレポート生成だけを行い、Membership・Cast・Alias・Factを変更しない。

## 2. 監査対象

Castごとに次を読み取る。

- `Cast.status`
- `Cast.startedOn`
- `Cast.endedOn`
- `Cast.primaryStoreId`
- 既存Membershipの有無
- CastAliasの`storeId`
- MediaListingの`storeId`
- CTI / Town / Heaven Cast Factの`storeId`

Fact、Alias、Listingは店舗の補助的な存在根拠としてのみ使用する。最終退店日や入店日をFactの最終日・Aliasの最終日・掲載終了日・最終Import日から推測しない。

## 3. 分類

### SAFE_AUTO

- 既存Membershipなし
- 店舗根拠が1店舗のみ
- `primaryStoreId`あり
- `status=ACTIVE`
- `endedOn=NULL`
- Legacy日付の信頼を明示的に許可

自動作成時の値は、`source=LEGACY_CAST_BACKFILL`、`sourceConfidence=INFERRED`を予定する。J0-Cでは作成しない。

### SAFE_LEFT

- 既存Membershipなし
- 店舗根拠が1店舗のみ
- `primaryStoreId`あり
- `status=INACTIVE`
- `startedOn <= endedOn`
- Legacy日付の信頼を明示的に許可

自動作成時は`status=LEFT`を予定する。J0-Cでは作成しない。

### MULTI_STORE_EVIDENCE

Alias、Listing、Factなどから複数店舗の根拠があるCast。自動作成せずManual Reviewとする。

### DATE_UNCERTAIN

日付の根拠が確認できない、日付順が不正、またはLegacy日付の信頼を明示していないCast。最終Fact日などを退店日として補完しない。

### STORE_UNCERTAIN

`primaryStoreId`がなく、店舗根拠もないCast。店舗を推測して作成しない。

### EXISTING_MEMBERSHIP

既にMembershipがあるCast。Backfill対象外とし、重複作成しない。

## 4. Dry-run CLI

```bash
npm run memberships:backfill-audit
```

出力先:

```text
artifacts/audits/cast-membership-backfill-YYYYMMDDHHmmss.json
```

`artifacts/audits/`はGit管理対象外である。CLIは読み取り専用Queryだけを実行し、トランザクション更新、Migration、Backfill、Cast状態変更を行わない。

デフォルトではLegacy日付の信頼を許可しないため、既存の`startedOn/endedOn`だけでSAFE_AUTOやSAFE_LEFTへ分類しない。

監査比較用に、明示的に以下を設定した場合だけ、信頼済みLegacy日付を使った候補分類を確認できる。

```bash
MEMBERSHIP_BACKFILL_TRUST_LEGACY_DATES=true npm run memberships:backfill-audit
```

これは依然としてDry-runであり、Membershipを作成しない。Productionでの設定・実行は別途承認が必要である。

## 5. レポートshape

```text
generatedAt
mode = DRY_RUN
trustedLegacyDates
summary:
  totalCasts
  safeAuto
  safeLeft
  multiStore
  dateUncertain
  storeUncertain
  alreadyMigrated
results[]:
  castId
  displayName
  status
  primaryStoreId
  startedOn
  endedOn
  evidence.storeIds[]
  evidence.sourceKinds[]
  evidence.dateRanges[] = sourceKind / storeId / from / to
  classification
  reason
  proposedStatus
  sourceConfidence
```

## 6. Apply方針

J0-CではApply CLIを実装しない。将来実装する場合も、次を必須とする。

- デフォルトDry-run
- `--apply`必須
- Productionでは`--confirm-production`必須
- SAFE_AUTO / SAFE_LEFTのみ対象
- Manual Review分類は拒否
- 既存MembershipはNOOP
- `castId + storeId + 同一期間`の重複作成禁止
- advisory lockとtransactionを利用
- Cast Legacy field、Alias、Factは変更しない

## 7. Manual Review queue

J0-DのUIでは最低限次を表示する。

- Cast ID / 表示名
- 現在のStatus
- Primary Store
- `startedOn` / `endedOn`
- 根拠店舗一覧
- 根拠種別（Alias / Listing / CTI / Town / Heaven）
- 分類
- 理由
- 作成候補のMembership期間

Reviewで承認された値だけを、Operator操作としてMembershipへ登録する。

## 8. Rollout順

1. Migration適用済みであることを確認
2. Dry-run監査
3. 件数とManual Review対象を確認
4. SAFE subsetを手動承認
5. Apply機能を別工程で実装
6. Apply後に再監査し、EXISTING_MEMBERSHIPを確認
7. J0-D管理UI
8. Resolver shadow read
9. Resolver切替
10. Analytics切替

## 9. 今回の制約

- Production DB Backfill: 未実施
- Cast Legacy field変更: なし
- Alias変更: なし
- Fact変更: なし
- Resolver変更: なし
- Analytics変更: なし
- UI変更: なし
- 自動Membership作成: なし
