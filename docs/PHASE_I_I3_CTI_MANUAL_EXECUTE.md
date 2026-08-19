# Phase I I3 CTI Manual Execute CLI

## 目的

READY状態のCTI `CTI_CAST_REPORT` DriveFileを1件だけ明示指定し、既存CTI Preview Pipelineまで実行するDevelopment/管理者向けCLIである。Import確定・AUTO confirm・Production cron実行は行わない。

```bash
npm run drive:execute-cti -- \
  --drive-file-id=<drive-file-id> \
  --target-date=YYYY-MM-DD
```

Production環境では追加で`--confirm-production`が必要である。ただしI3検証はDevelopmentで行い、Productionでは実行しない。

## 実行範囲

```text
DriveFileState READY
  → driveFileId advisory lock
  → Mapping/CTI/target-date validation
  → 既存Drive download + SHA-256
  → 既存 createCtiPreview()
  → ImportBatch / Preview / ImportError
  → DriveFileState REVIEW_REQUIRED
  → Confirm: NOT EXECUTED
```

独自XLSX parser、独自validation、独自ImportBatch作成、`confirmCtiImport()`呼び出し、Analytics fact tableへの直接writeは行わない。既存の`src/lib/imports/cti/*`を唯一のPipelineとして利用する。

## System Actor

`uploadedByUserId`にはautomation専用のinactive `VIEWER` Userを使用する。既存Admin IDをハードコードしない。初回は明示的に次を実行してprovisionする。

```bash
npm run automation:provision-system-user
```

この処理はloginIdでlookupするidempotent処理で、passwordを出力せず、既存のactive userや権限を変更しない。Actorが存在しない場合、Executeは安全側に失敗する。

## 実行前Validation

- `--drive-file-id`必須、複数File・Folder全件処理は禁止
- `--target-date=YYYY-MM-DD`必須。File名から自動決定しない
- DriveFileStateは通常`READY`のみ
- `REVIEW_REQUIRED`は既存Batchへ誘導し、新Batchを作らない
- `IMPORTED`同一内容、`FAILED_FINAL`、`UNMAPPED`、処理中Statusは拒否
- Mappingはactive、non-future、`CTI_CAST_REPORT`、Media CTI、`storeId=null`
- Productionは`--confirm-production`なしで拒否

## Downloadと整合性

既存`downloadDriveFile()`と`GoogleDriveTemporaryStorage`を再利用する。実行中にDriveの`modifiedTime`が検知時の値から変わった場合、Previewを作成しない。ダウンロードSHA-256がDriveFileState.sha256と一致しない場合もPreviewを作らず失敗扱いとする。一時Fileは成功・失敗を問わずcleanupする。

## StateとBatch

成功時は次の遷移になる。

```text
READY → IMPORTING → REVIEW_REQUIRED
```

Preview Batch IDを`lastImportBatchId`へ設定し、`lastSuccessfulImportBatchId`と`lastImportedAt`は変更しない。Confirm後の同期はI4の専用post-confirm synchronizerで行う。

同一`driveFileId + driveModifiedTime + sha256`のBatchが既にPreview/Review済みの場合、既存Batch IDとReview URLを表示し、新規Batchを作らない。`forceDuplicate=true`は使用しない。

## 出力例

```text
CTI Drive Execute: OK
ImportBatch: <id>
Batch Status: PREVIEW_READY
Drive State: REVIEW_REQUIRED
Review URL: /imports/<id>
Confirm: NOT EXECUTED
```

実Folder ID、credential、private key、XLSX内容はログへ出力しない。

## Manual Review / I4接続

Reviewは既存`/imports/[id]`を正本とする。I4で、Drive由来Batchであることをmetadataから表示し、Cast/Alias解決とPreview確認を行う。I3 CLIはConfirmを呼ばず、Batch IDとReview URLを表示するだけである。I4のConfirm後同期が成功して初めて、DriveFileStateを`IMPORTED`、`lastSuccessfulImportBatchId`設定へ進める。

## Production Safety

- 既存10分cronは`RESOLVE_ONLY`のまま
- CLIをcronから呼ばない
- AUTO Import / AUTO confirmは無効
- Town/Heavenは対象外
- advisory lock取得失敗時は待たずにSKIP
- 自動rollback、Drive書込み、Archive/Error移動は行わない

## Development Verified

Development実環境で`女子別レポート_20260808.xlsx`を使い、`READY → REVIEW_REQUIRED`、ImportBatch `WAITING_FOR_CAST_LINK`、target date `2026-08-08`、automation actor `Google Drive Automation`、pending 3、warning 3、error 0、春日部/越谷/野田の`UNMATCHED_CAST`各1件を確認済み。`/imports/[id]`でPreview UIを表示し、AUTO Confirmは実行していない。

## I3完了条件

DevelopmentでREADY CTI Fileを使い、Download、既存`createCtiPreview()`、ImportBatch/ImportError保存、`REVIEW_REQUIRED`、Review URL表示、同一content再実行時のBatch再利用を確認する。Confirmは実行しない。I4で既存Review画面とConfirm後Drive State同期を接続する。
