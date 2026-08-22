# Phase J0-E Current Membership Initialization

Status: IMPLEMENTED / Production Apply NOT EXECUTED

## Current Evidence

Cast × Store単位で、次のEvidenceを判定する。

- `MediaListing.isListed = true`
- `CastAlias.validTo IS NULL`
- 店舗の最新Fact日と一致する最新媒体実績

Factの最初の日付・最終日付、Aliasの終了日、Listingの終了日、Import日、Drive日付、表示名の「退店」は退店日として使用しない。

## Preview / Confirm

`/masters/casts/memberships/initialize`で作成候補を表示する。候補はCast・店舗・Evidence理由・作成内容を確認できる。ViewerはPreviewのみ、Adminの明示Confirm時だけ初期Membershipを作成する。

作成値は次のとおり。

```text
status = ACTIVE
joinedAt = NULL
leftAt = NULL
source = MEDIA_EVIDENCE_BACKFILL
sourceConfidence = CONFIRMED
```

既存ACTIVEはNOOP、ON_LEAVEは要確認、既存LEFTに現在Evidenceがある場合はREENTRY_REVIEWとし、自動作成しない。作成はtransaction・advisory lock・既存Membership検証を通す。

## Daily Operations

日常操作は`/masters/casts`に統合する。在籍店舗はMembershipを正本として店舗別に表示し、未所属店舗の追加、退店日入力によるLEFT化、LEFTからの新規再入店を行う。`primaryStoreId`と`Cast.status`はLegacy互換として維持し、Membership操作で自動変更しない。

`/masters/casts/memberships`はEvidence監査、例外、履歴確認用に残す。

## Production Safety

ProductionではPreview/Dry-runの結果を人間が確認してからApplyする。今回の実装作業ではProduction DBへの初期化を実行していない。
