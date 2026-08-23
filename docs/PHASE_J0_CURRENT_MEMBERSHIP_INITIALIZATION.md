# Phase J0-E Current Membership Initialization

Status: J0-E COMPLETE / Production VERIFIED

旧Previewの373 CREATE_ACTIVE候補はConfirmしていない。旧ロジックはCast自身のFact最大日・媒体混在Store最大日・累計HeavenFactをCurrent判定に含み得たため、Production初期化条件として不十分だった。

## Current Evidence

Cast × Store単位で、次のEvidenceを判定する。

- `MediaListing.isListed = true`
- `CastAlias.validTo IS NULL`
- CTI×Storeの最新成功CTI Datasetに存在
- Town CAST×Storeの最新成功Town CAST Datasetに存在

Heaven累計Fact、Factの最初・最終日、Aliasの終了日、Listingの終了日、Import日、Drive日付、表示名の「退店」はCurrent CREATE_ACTIVEや退店日として使用しない。AliasとMediaListingは補足Evidenceへ降格した。

最新Datasetは既存ImportBatchの`COMPLETED` / `COMPLETED_WITH_WARNINGS`だけを対象に、source×storeの`targetTo`最大Datasetを選ぶ。Datasetに存在しないことから退店・LEFTは生成しない。

## Preview / Confirm

`/masters/casts/memberships/initialize`で作成候補を表示する。候補はCast・店舗・Source・最新Dataset日・成功済みImportBatch（先頭8文字表示、詳細はtitle）・Evidence理由・作成内容を確認できる。ViewerはPreviewのみ、Adminの明示Confirm時だけ初期Membershipを作成する。

作成値は次のとおり。

```text
status = ACTIVE
joinedAt = NULL
leftAt = NULL
source = MEDIA_EVIDENCE_BACKFILL
sourceConfidence = CONFIRMED
```

既存ACTIVEはNOOP、ON_LEAVEは要確認、既存LEFTにCurrent CTI/Town Evidenceがある場合はREENTRY_REVIEW、Legacy markerまたはINACTIVEとの矛盾はLEGACY_STATUS_CONFLICT、HeavenだけはHEAVEN_CURRENT_REVIEWとする。作成はtransaction・advisory lock・既存Membership検証を通す。

## Daily Operations

日常操作は`/masters/casts`に統合する。在籍店舗はMembershipを正本として店舗別に表示し、未所属店舗の追加、退店日入力によるLEFT化、LEFTからの新規再入店を行う。`primaryStoreId`と`Cast.status`はLegacy互換として維持し、Membership操作で自動変更しない。

`/masters/casts/memberships`はEvidence監査、例外、履歴確認用に残す。

## Production Safety

ProductionではPreview/Dry-runの結果を人間が確認してからApplyする。J0-E Production Canaryでは、190件を明示Confirmし、`cast_store_memberships`に190件（ACTIVE 190件、`MEDIA_EVIDENCE_BACKFILL` 190件）を登録した。

### Production Canary監査結果

- 初期Preview: `CREATE_ACTIVE=190`、春日部113・越谷61・野田16
- Evidence: Town CASTのみ128、CTIのみ23、Town CAST + CTI39
- `duplicate cast/store=0`
- `invalid Batch status=0`
- source集計・店舗集計: PASS
- Confirm後Preview: `EXISTING_ACTIVE=190`、`CREATE_ACTIVE=0`
- `LEGACY_STATUS_CONFLICT=6`、`HEAVEN_CURRENT_REVIEW=53`、`NO_CURRENT_EVIDENCE=547`

Canary中に、(1) `castId:storeId`複合値をUUID配列として検証していたConfirm payload、(2) `pg_advisory_xact_lock()`のvoid結果を`$queryRaw`でdeserializeしていたMembership lockを発見した。Confirmはintentだけ送信してServer Action側で再取得・再監査する方式へ、lockは`IS NULL AS locked`を返す既存Productionパターンへ修正した。両失敗時ともINSERT前に停止し、partial writeは発生しなかった。

### 正式運用と次Canary

日常操作は`/masters/casts`を主画面とし、店舗追加・退店日入力・再入店・必要時の休業/復帰をMembership service経由で行う。`/masters/casts/memberships`は履歴・Evidence・例外・監査用に残す。退店日は人間の明示入力だけを`leftAt`へ保存し、Fact最終日、Alias/Listing終了日、Import日からは生成しない。

次のProduction Canaryは、既存データを壊さない専用対象Castを選び、(1)新規店舗追加、(2)ACTIVEの退店、(3)LEFT店舗への新規再入店、(4)必要ならON_LEAVE/復帰を各1件確認する。完了後はJ0-F Shadow Read / Legacy comparison（読み取り専用）へ進む。Resolver・Analyticsはまだ切り替えない。
