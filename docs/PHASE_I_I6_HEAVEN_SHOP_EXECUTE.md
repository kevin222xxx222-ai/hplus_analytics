# Phase I I6 — Heaven SHOP Manual Execute

## Scope

I6は、Google Driveの `HEAVEN_STORE`（春日部 Shop）をDevelopmentで1ファイルずつ手動実行するためのVertical Sliceです。I10総合CanaryでHeaven 3 routeのAUTO PreviewがProduction Verifiedとなったが、AUTO Confirmは実装していない。対象は `HEAVEN_KASUKABE_HEAVEN_STORE_SHOP` のMappingだけで、Heavenの未解放Metric（MY_GIRL、MITENE、TALK、NOTICE）は対象外です。

## Existing pipeline audit

- Upload入口: `POST /api/imports/heaven/upload`
- Preview入口: `createHeavenPreview()` (`src/lib/imports/heaven/service.ts`)
- Parser/validation: `parseHeavenCsvText()` と `validateHeavenParse()`。I6はこれらを呼び出すだけで、CSV parserを複製しません。
- ImportBatch作成: `createHeavenPreview()` が `ImportSource`（canonical name `HEAVEN_KASUKABE_HEAVEN_STORE_SHOP`）と `ImportBatch`、Previewを作成します。
- Confirm/commit境界: `confirmHeavenImport()`。Shopの場合は既存の `heavenShopDaily` upsertだけがfact writeを行います。
- Target period: ファイル名やCLI引数ではなく、既存parserがCSVヘッダーと日付行から求める `sourcePeriodFrom` / `sourcePeriodTo` をImportBatchのtargetFrom/targetToへ保存します。そのためI6 CLIに `--target-date` はありません。
- Shop value semantics: `HEAVEN_STORE`、metricType `UNKNOWN`、valueKind `DAILY_EVENT`。Shop Mappingの `metricHint` は必ず未設定です。
- Review URL: `/imports/heaven/<batchId>`。

## CLI

```bash
npm run drive:execute-heaven-shop -- --drive-file-id=<READYのDrive file id>
```

Production環境での実行には `--confirm-production` が必要ですが、I6ではProductionで実行しません。CLIは既存のGoogle Drive client、DriveFileState、Folder Mapping resolver、temporary download、SHA-256検証、system actor、advisory lock、`createHeavenPreview()`を再利用します。Confirmは実行せず、成功時は `READY → IMPORTING → REVIEW_REQUIRED` で停止します。

## Mapping validation

実行時に次を検証します。

- Mappingがactiveかつnon-future
- `importDataType` と ImportSource のdataTypeが `HEAVEN_STORE`
- mediaTypeが `HEAVEN`
- MappingのstoreIdとImportSourceのstoreIdが一致し、春日部であること
- MappingとImportSourceのmetricHintが未設定であること
- Fileが検知時と同じmodifiedTimeで、download後SHA-256がDriveFileStateと一致すること

店舗はファイル名から推測せず、MappingのstoreIdを正とします。

## State / review synchronization

通常のPreview作成後はDriveFileStateにBatchを紐付けて `REVIEW_REQUIRED` にします。既存のReview画面でユーザーがConfirmすると、Heaven confirm routeは既存 `confirmHeavenImport()` を実行し、その後 `syncDriveFileStateAfterConfirmedImport()` を呼びます。Drive由来のBatchだけが対象となり、成功ステータス（COMPLETED / COMPLETED_WITH_WARNINGS）を確認した後に `IMPORTED`、`lastImportBatchId`、`lastSuccessfulImportBatchId`、`lastImportedAt` を同期します。非Drive BatchはNOOPです。

## Idempotency and failure safety

- driveFileId advisory lockを実行全体で保持します。ロック取得失敗はSKIPPEDです。
- 同じDrive identity（driveFileId + modifiedTime + SHA-256）に既存Reviewがあれば再利用します。
- 同一SHAの確定済みHeaven STORE ImportBatchは新規作成せず再利用します。
- 既存Heaven serviceのactive/completed duplicate制御も維持します。`forceDuplicate` は使用しません。
- download、SHA不一致、parser/validation、Preview作成の失敗はDriveFileStateを失敗分類し、temporary fileをcleanupします。

## Runner and safety

Heaven serviceが依存する `src/lib/imports/heaven`、`src/lib/date.ts`、`src/lib/normalize.ts`、Prisma/generated clientは既存runner imageのserver-side source packagingに含まれます。今回Dockerfile変更は不要です。Secrets、Production Folder ID、Service Account情報はCLIや本書へ埋め込みません。

## Production Canary (verified)

I6のProduction Canaryとして、春日部Heaven Shopの`tokeiShop_202608.csv`を手動実行した。`READY → IMPORTING → REVIEW_REQUIRED → Manual Confirm → IMPORTED`を確認し、ImportBatchは`COMPLETED`（inserted 308、updated 197、skipped 0、warning 0、error 0）、DriveFileStateは`IMPORTED`となり、`lastImportBatchId` / `lastSuccessfulImportBatchId`の同期も確認済みである。

Fact tableは既存の`heaven_shop_daily`を使用し、列の意味は次のとおりである。日付列は`date`ではなく`business_date`である。

`business_date`, `store_id`, `import_batch_id`, `metric_key`, `raw_value`, `value_kind`, `raw_value_status`, `delta_value`, `source_column`, `source_row_number`

監査で通常のHeaven Confirm成功経路に`ImportBatch.completedAt`更新漏れが見つかった。通常成功時（`COMPLETED` / `COMPLETED_WITH_WARNINGS`）にstatus更新と同じtransactionで`completedAt`を設定する最小修正を適用した。Duplicate Cancel経路は既存の`completedAt`設定を維持する。Canary Batchの再ConfirmやProduction DBの直接補正は行っていない。

既存Canaryの`completedAt`は、`lastImportedAt`を根拠に後付け補正すると監査時刻と確定時刻を混同するため、現時点ではNULLの履歴をそのまま保持することを推奨する。必要な場合のみ、別途監査承認と明示的な補正手順を設ける。

## Test / verification status

追加したunit testは、file id、Production confirmation、Mapping（active/future/type/store/metricHint）、Drive identity、Review URLを確認します。I10総合CanaryでHeaven CASTのAUTO routeもProduction Verifiedとなった。AUTO Confirmは実装していない。

## I6 status

COMPLETE / Production Canary VERIFIED。Production Canaryの実Import・Manual Confirm・Drive State同期まで確認済み。I10でAUTO Preview経路もProduction Verifiedとなり、最終確定はHuman Confirmのみである。
