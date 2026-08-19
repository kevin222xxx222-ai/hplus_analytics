# Phase I I7 — MANUAL_REVIEW Drive Execute

## Scope and status

I7はAUTO Import対象外のDrive Mappingを、既存Preview/Review経路へ手動接続するPhaseです。対象は次の3系統です。

- Town CAST: 春日部・越谷（`TOWN_CAST`）
- Heaven CAST PAGE_ACCESS: 春日部（`HEAVEN_CAST` + `PAGE_ACCESS`）
- Heaven CAST DIARY_POSTS: 春日部（`HEAVEN_CAST` + `DIARY_POSTS`）

Town URL/LANDING、Heaven SHOP、Heaven CASTのMY_GIRL・MITENE・TALK・通知系はI7対象外です。AUTO Confirm、AUTO Alias作成、AUTO Cast作成、cronからのEXECUTEは行いません。

## Existing pipeline audit

### Town CAST

入口は既存`createTownPreview()`（`src/lib/imports/town/service.ts`）です。`parseTownCsv()`、既存resolver、`TownPreview`保存、`WAITING_FOR_CAST_LINK`判定をそのまま使用します。ImportBatchはPreview serviceが作成し、Confirmは既存`confirmTownImport()`が`townCastDaily`へupsertします。対象期間はTown parserが入力された`targetFrom`/`targetTo`で検証するため、CLIでは明示的な`--target-date`を必須とし、ファイル名から推測しません。

### Heaven CAST

入口は既存`createHeavenPreview()`です。`parseHeavenCsvText()`、`validateHeavenParse()`、既存Heaven Alias resolver、Preview保存を再利用します。`metricHint`はMappingの値を正とし、I7では`PAGE_ACCESS`と`DIARY_POSTS`だけを許可します。CSVの日付行からparserが`sourcePeriodFrom`/`sourcePeriodTo`を決定し、ImportBatchへ保存します。Confirmは既存`confirmHeavenImport()`が`heavenCastDaily`へupsertします。

両方とも独自parser、独自ImportBatch、fact tableへの直接writeはありません。

## CLI

```bash
npm run drive:execute-town-cast -- \
  --drive-file-id=<READYのDrive file id> \
  --target-date=YYYY-MM-DD

npm run drive:execute-heaven-cast -- \
  --drive-file-id=<READYのDrive file id>
```

Production環境では両CLIとも`--confirm-production`が必要です。I7ではProduction実行しません。

## Safety and state

既存のGoogle Drive client、Folder Mapping resolver、temporary storage、SHA-256検証、`automation-google-drive` system actor、driveFileId advisory lockを使用します。

正常系は共通して次の状態で停止します。

```text
READY → IMPORTING → REVIEW_REQUIRED
```

Previewは`PREVIEW_READY`または`WAITING_FOR_CAST_LINK`となり得ます。未紐付けCastは既存Review UIとResolve APIで人が解決します。CLIはConfirmを呼びません。

Review URLはTownが`/imports/town/<batchId>`、Heavenが`/imports/heaven/<batchId>`です。

## Idempotency and synchronization

driveFileId + modifiedTime + SHA-256、既存ImportBatchのfileHash、完了済みBatchを併用します。`REVIEW_REQUIRED`は既存Batchへ誘導し、同一内容の新規Batchを作りません。`forceDuplicate`は指定しません。Confirm後は既存`syncDriveFileStateAfterConfirmedImport(batchId)`を利用し、Drive由来Batchだけを`IMPORTED`へ同期します。`lastSuccessfulImportBatchId`はConfirm前には変更しません。

## Runner / Production

既存runnerの`src/lib/imports`、`src/lib/date.ts`、`src/lib/normalize.ts`、Prisma/generated clientでTown/Heaven CAST依存を解決できます。今回Dockerfile、Compose、DB、Prisma、Migrationは変更していません。Production cronはRESOLVE_ONLYのままです。

## Verification

Mapping種別、store、active/future、metricHint、Production confirmation、target date、Review URLのunit testを追加しました。実Drive FileによるI7 Canaryは未実施（NOT VERIFIED）です。Canary実行後、各対象のPreview、Resolve、Manual Confirm、post-confirm syncを個別に確認します。
