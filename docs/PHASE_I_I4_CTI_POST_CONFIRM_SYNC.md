# Phase I I4 CTI Manual Review / Post-Confirm Synchronization

## Status

I3のDevelopment実環境検証では、`女子別レポート_20260808.xlsx`が`READY → REVIEW_REQUIRED`となり、ImportBatchは`WAITING_FOR_CAST_LINK`、未紐付けは春日部・越谷・野田各1件だった。I4では既存Review画面からCast Linkを解決し、手動Confirm後にDriveFileStateを同期する。

## Existing Confirm path

```text
/imports/[id]
  → /api/imports/cti/[id]/resolve（Cast/Alias解決）
  → PREVIEW_READY
  → /api/imports/cti/[id]/confirm
  → confirmCtiImport()
  → ctiCastDaily upsert
  → COMPLETED / COMPLETED_WITH_WARNINGS
```

Drive由来でもこの経路を正本とし、専用Review UIは作らない。`confirmCtiImport()`は汎用Manual Uploadにも使われるため、Drive固有処理を内部へ埋め込まない。

## Post-confirm synchronizer

API：

```ts
syncDriveFileStateAfterConfirmedImport(batchId)
```

Confirm APIは、既存Confirm成功後にこのSynchronizerを呼ぶ。Synchronizerは次を確認する。

1. Batchが存在する。
2. `metadata.origin === "GOOGLE_DRIVE"`である。
3. statusが`COMPLETED`または`COMPLETED_WITH_WARNINGS`である。
4. `lastImportBatchId=batchId`のDriveFileStateを検索する。
5. Stateが`REVIEW_REQUIRED`である。

全条件を満たす場合のみ、次を更新する。

```text
REVIEW_REQUIRED → IMPORTED
lastSuccessfulImportBatchId = batchId
lastImportedAt = now
lastError* / nextRetryAt = clear
```

Preview成功、`WAITING_FOR_CAST_LINK`、`PREVIEW_READY`、`FAILED`は同期しない。非Drive BatchはNOOPで終了する。

## Confirm failure boundary

Confirm失敗時はDrive Stateを`IMPORTED`にしない。Confirm後にSynchronizerだけが失敗した場合、既に確定したCTI factとImportBatchをrollbackせず、API結果の`driveFileStateSync.status=FAILED`または`CONFLICT`として扱う。後続の同期Retry/Manual Repairで復旧する。

この境界により、Drive Stateの同期障害が既存CTI ConfirmをFAILEDへ戻すことはない。

## Idempotency

- `IMPORTED`かつ`lastSuccessfulImportBatchId=batchId`ならNOOP成功。
- `REVIEW_REQUIRED`以外のStateはCONFLICTとして変更しない。
- 別Batchが既に`IMPORTED`の場合は上書きしない。
- 非Drive metadata、未リンクBatch、未確定statusはNOOP。
- `driveFileId` advisory lockとBatch identity照合はI3/I4のExecution側で継続する。

## Manual Review UI

既存`/imports/[id]`に次の情報を追加表示するかを最小UI変更として評価するが、I4の必須条件ではない。

- `Source: Google Drive Automation`
- Drive File Stateがレビュー待ちであること
- 同期結果（確認済み/同期待ち）

Folder ID、credential、private key、ファイル内容は表示しない。

## Development verification procedure

ユーザー操作が必要なため、次の地点で停止して確認を依頼する。

1. I3 Batchの`/imports/[id]`を開く。
2. 春日部・越谷・野田の未紐付け3件を既存UIでCast Link解決する。
3. Batchが`PREVIEW_READY`になったことを確認する。
4. 画面の既存Confirmを手動で実行する。
5. `COMPLETED`または`COMPLETED_WITH_WARNINGS`と`ctiCastDaily`反映を確認する。
6. `DriveFileState=IMPORTED`、`lastSuccessfulImportBatchId`、`lastImportedAt`を確認する。
7. 同じBatchの再同期がNOOPであることを確認する。

CodexはCast Link作成・Confirm・Production実行を自動で行わない。

## Scope exclusions

- AUTO Confirm
- cronからのConfirm
- Town/Heaven
- CTI parser/Importer複製
- schema/migration変更
- Confirm済みfactの自動rollback

## I5 Town STORE extension

I5では同じpost-confirm synchronizerをTown STOREにも再利用する。Townの既存Review/Confirm経路は変更せず、Confirm成功後にDrive由来Batchだけを`IMPORTED`へ同期する。DevelopmentでのTown実環境検証はI5 CLI実行後にユーザーが手動Review/Confirmを行って確認する。
