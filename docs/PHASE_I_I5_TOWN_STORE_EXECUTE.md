# Phase I I5 Town STORE Manual Execute

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

## I5 verification status

CLIとvalidation unit testを追加済み。実Development Drive Fileでの実行はまだ行っていない（NOT VERIFIED）。次の手動検証では、春日部または越谷のTOWN_STORE Mappingにある1 Fileを指定し、Preview URLを開いてから、必要なReview/Confirmをユーザーが明示操作する。Production cronはRESOLVE_ONLYのまま維持する。

## Next

Developmentで1 FileのPreview・Manual Review・Confirm後同期を確認できれば、I6 Heaven SHOPの既存Pipeline監査へ進む。
