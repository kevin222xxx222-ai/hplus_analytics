# Phase J0-E Current Membership Initialization

Status: E2 HARDENED / Production Apply NOT EXECUTED

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

ProductionではPreview/Dry-runの結果を人間が確認してからApplyする。今回の実装作業ではProduction DBへの初期化を実行していない。
