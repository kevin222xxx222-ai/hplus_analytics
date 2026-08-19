# Phase I I5 Town STORE Manual Execute

## Final status

**COMPLETE / Production Canary VERIFIED**

I5の春日部 `TOWN_STORE`を、Productionで1 FileのManual ExecuteからManual Review/Confirm、DriveFileState同期まで検証済みである。AUTO Import、AUTO Confirm、Production cronからのExecuteは引き続き解放しない。

## Scope

I5は`TOWN_STORE`だけを対象に、READYのDriveFileStateを1件ずつ明示指定して既存Town Preview Pipelineへ渡すDevelopment/管理者向けのManual Executeである。AUTO Import、AUTO Confirm、Production cron、Town CAST/URL/LANDINGは対象外とする。

## Existing Pipeline Audit

既存の正本経路は次の通り。

```text
/imports/town upload
  → createTownPreview()
  → parseTownCsv()
  → resolveTownPreviewRows()
  → ImportBatch + Preview + ImportError
  → /imports/town/[id]
  → confirmTownImport()
  → townStoreDaily upsert
```

- Upload入口は`src/app/api/imports/town/upload/route.ts`。
- `createTownPreview()`がImportBatchを`VALIDATING`で作成し、CSV検証・Preview保存・ImportError保存後に`PREVIEW_READY`、`WAITING_FOR_CAST_LINK`、または`FAILED`へ遷移する。
- `confirmTownImport()`がPreviewを読み、`townStoreDaily`をupsertし、ImportBatchを`COMPLETED`または`COMPLETED_WITH_WARNINGS`へ遷移する。Confirm前にfact tableへ書き込まない。
- `fileHash`と完了済み同種Batchの重複を既存Pipelineが警告として記録する。Drive Executeではさらに`driveFileId + driveModifiedTime + sha256`を確認し、同一Contentの新Batchを作成しない。
- 同一Drive identityは既存Review Batchを再利用し、別Drive identityでも同一SHA-256の完了済み`TOWN_STORE` Batchがあれば新Batchを作らず`DUPLICATE_COMPLETED_FILE`として再利用結果を返す。`forceDuplicate`はCLIから使用しない。
- 店舗はDriveファイル名では判定しない。`DriveFolderMapping.storeId`と紐付く有効な`ImportSource`を正本とする。春日部・越谷を許可し、野田・久喜は拒否する。
- `--target-date=YYYY-MM-DD`を必須とし、Town parserの正式な日付列と対象期間検証へ渡す。ファイル名から日付を推測しない。

## CLI

```bash
npm run drive:execute-town-store -- \
  --drive-file-id=<drive-file-id> \
  --target-date=YYYY-MM-DD
```

Review URLは`/imports/town/<batchId>`を使用する。

Production環境では`--confirm-production`が必要だが、I5ではProduction実行しない。

処理範囲は次の通り。

```text
READY
  → driveFileId advisory lock
  → TOWN_STORE / active / non-future / storeId validation
  → Drive modifiedTime確認
  → 既存downloadDriveFile() + SHA-256
  → 既存createTownPreview()
  → ImportBatch / Preview / ImportError
  → REVIEW_REQUIRED
  → Confirm: NOT EXECUTED
```

Download後は一時ファイルを必ずcleanupする。SHA-256不一致、Drive更新、Download/Preview失敗はDriveFileStateを失敗状態へ分類し、途中のファイルを残さない。

## State / Review

Manual Preview成功時は`READY → IMPORTING → REVIEW_REQUIRED`。Previewが`FAILED`の場合はImportを確定せず失敗扱いとする。既存Town Review UIで確認・必要な解決を行い、Confirm API成功後はI4の共通post-confirm synchronizerがDrive由来Batchを`IMPORTED`へ同期し、`lastSuccessfulImportBatchId`を設定する。同期失敗時も確定済みTown factをRollbackしない。

## Safety

- `forceDuplicate`はCLIから使用しない。
- Drive file lockを利用し、Lock取得不可はSKIPPED。
- AUTO execution、AUTO Confirm、cron、Production実行は行わない。
- 独自CSV parser、独自Validation、独自ImportBatch作成、fact tableへの直接writeは行わない。
- 既存CTI/TownのManual Upload経路は変更しない。

## Production Canary verification

対象は春日部「店舗別」の`TOWN_STORE`である。

```text
File: dto.jp-shop-20260818_to_20260818.csv
Target date: 2026-08-18
ImportBatch: dc9ff39a-3a2d-4749-a340-e7507ec05c9e

DriveFileState:
READY → REVIEW_REQUIRED → IMPORTED

ImportBatch:
COMPLETED
insertedCount=1 / updatedCount=0 / skippedCount=0
warningCount=0 / errorCount=0
```

`town_store_daily`には2026-08-18の春日部レコードが1件保存され、PV 14,595、UU 1,994、平均PV 7.319458、直帰率 0.218、TELタップUU 19、コンバージョン率 0.00952859を確認した。保存されたレコードの`importBatchId`はCanary Batchと一致した。

DriveFileStateの最終確認値：

- `lastImportBatchId`：Canary Batch
- `lastSuccessfulImportBatchId`：Canary Batch
- `lastImportedAt`：設定済み
- `retryCount`：0
- `nextRetryAt`：NULL
- `lastErrorCategory`：NULL

Production HealthはOK、Databaseはconnected。既存10分Drive cronは継続し、`AUTO Import=OFF`、`AUTO Confirm=OFF`、Town STOREはManual Executeのみである。

## Canaryで発見・修正した事項

### 1. Production runner dependency不足

runner stageに`src/lib/import-automation`だけが含まれ、既存Town Pipelineの`src/lib/imports`、`src/lib/date.ts`、`src/lib/normalize.ts`が不足していた。runnerへ必要なserver-side sourceを追加COPYし、Town/CTI CLIの`MODULE_NOT_FOUND`を解消した。Town parser、validation、importer business logicは変更していない。

### 2. Town Review URL

CLIが`/imports/<batchId>`を表示していたため、CTI用ページでTown Previewを読み込むSSR errorが発生した。Town専用の`/imports/town/<batchId>`へ修正し、`townReviewUrl()`へ集約した。正規URLではReview UIが正常表示された。

### 3. Production Same-Origin / reverse proxy

Browserのpublic OriginとNginx reverse proxy後の内部`request.url` originが異なり、Confirm時に`Invalid request origin`となった。`APP_ORIGIN`を厳密なexpected originとして追加し、URL validation、`URL.origin`正規化、完全一致を行う方式へ修正した。未設定時は従来のrequest URL fallback、Origin headerなしの既存policyを維持し、任意Host、substring、`X-Forwarded-Host` trustは行わない。Productionではpublic originを設定済みで、CSRF/Same-Origin保護を維持している。

## Next

I5はProduction Canary VERIFIEDまで完了した。次はI6 Heaven SHOPの既存Pipeline監査へ進む。I8までAUTO実行・AUTO Confirmは解放しない。
