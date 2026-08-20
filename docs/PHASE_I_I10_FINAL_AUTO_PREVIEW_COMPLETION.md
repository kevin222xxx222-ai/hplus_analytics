# Phase I10 — Final Auto Preview Completion

## 目的

Productionの8 Mappingを、Drive更新から既存Preview/Review UIまで自動接続する。Confirmは必ず人が行い、AUTO Confirm、独自parser、直接fact writeは行わない。

## 対象route

`HEAVEN_SHOP`、`HEAVEN_GIRL_ACCESS`、`HEAVEN_GIRL_DIARY`、`TOWN_STORE`、`TOWN_CAST`、`CTI_CAST_REPORT`。Global Gateとper-route allowlistのdefault denyは維持する。

## Town target-date resolver

既存`parseTownCsv()`の`sourcePeriodFrom`/`sourcePeriodTo`を正とする。両方が存在し、同一日である場合だけAUTO target dateとして採用する。複数日、期間欠落、解析エラーはPreviewを作成せず停止する。

`dto.jp-shop-YYYYMMDD_to_YYYYMMDD.csv`、`dto.jp-gal-YYYYMMDD_to_YYYYMMDD.csv`のfilename期間は補助検証に限る。解析可能な場合はCSV内部期間と完全一致させ、不一致なら停止する。filenameだけで日付を決めない。

Mappingの`storeId`/`storeCode`を店舗判定の正とし、春日部・越谷を同一adapterで処理する。Town CASTの未紐付けCastは`WAITING_FOR_CAST_LINK`でReviewへ送り、AUTO Alias/Cast作成は行わない。

## CTI target-date resolver

現行CTI XLSX parserの3店舗sheet（春日部・越谷・野田）を検証し、対象sheetが欠落していないことを確認する。現行Drive用XLSX構造にはPreviewへ渡せる共通日付列がないため、現段階では厳格な`女子別レポート_YYYYMMDD.xlsx` filename patternの日付を補助根拠として採用する。pattern不一致、日付不正、3店舗sheet欠落はAUTO停止する。将来XLSX内部に正式日付を追加できる場合は内部日付を優先する。

## Execution flow

```text
Drive scan → download/SHA → resolver → existing adapter
→ createTownPreview/createCtiPreview
→ REVIEW_REQUIRED → Human Review/Confirm → IMPORTED
```

Town/CTI adapterへ内部`autoPreview` capabilityとresolver結果を渡す。Manual CLIは引き続き利用可能で、Productionでは`--confirm-production`が必要である。

## State / Idempotency

`driveFileId` advisory lock、`driveModifiedTime`、SHA-256、ImportBatch `fileHash`、natural-key upsertを維持する。同一SHA CompletedはNOOP、新Contentは新Preview。Confirm前は`lastSuccessfulImportBatchId`を旧成功Batchのまま維持する。

## Rollout order

1. Town STORE 春日部
2. Town CAST 春日部
3. Town STORE/CAST 越谷
4. CTI
5. Heaven PAGE_ACCESS changed-content Canary
6. Heaven DIARY_POSTS changed-content Canary

各段階で1 Fileの`AUTO Preview → REVIEW_REQUIRED → Human Confirm → IMPORTED`を確認してから次へ進む。Production cron頻度、AUTO Confirm、DB schemaは変更しない。

## 8 Mapping completion matrix

| Mapping | AUTO Preview | 実績/残作業 |
|---|---:|---|
| CTI | I10 resolver実装済み | Production Canary pending |
| Town 春日部 STORE | I10 resolver実装済み | Production Canary pending |
| Town 春日部 CAST | I10 resolver実装済み | Production Canary pending |
| Town 越谷 STORE | I10 resolver実装済み | Production Canary pending |
| Town 越谷 CAST | I10 resolver実装済み | Production Canary pending |
| Heaven SHOP | 実装済み | changed-content Canary verified |
| Heaven PAGE_ACCESS | 実装済み | changed-content Canary pending |
| Heaven DIARY_POSTS | 実装済み | changed-content Canary pending |

## Status

I10はコード実装とunit/regression test段階。8 MappingのProduction Canary完了まではPhase I Final COMPLETEにしない。Production設定・DB・Drive・cronは変更していない。
