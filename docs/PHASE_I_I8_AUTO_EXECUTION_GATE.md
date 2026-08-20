# Phase I I8 — AUTO Execution Gate

## Definition

I8のAUTOは、既存Import PipelineのPreview作成までを自動化する`AUTO Preview Execution`です。Confirm、fact tableへの直接write、Alias/Cast自動作成は行いません。最終状態は必ず`REVIEW_REQUIRED`で、人間が既存Review UIからConfirmします。

## Global gate

`GOOGLE_DRIVE_AUTO_EXECUTION_ENABLED=true`のときだけAUTO Previewを評価します。さらに`GOOGLE_DRIVE_AUTO_EXECUTION_ROUTES`へ既知routeを明示列挙した場合だけ許可します。未設定・空・未知tokenは全routeを拒否するdefault denyです。既存`GOOGLE_DRIVE_AUTOMATION_ENABLED`（scan/download/state tracking）とは別のGateです。cron行や頻度は変更しません。

許可routeは`HEAVEN_SHOP`、`HEAVEN_GIRL_ACCESS`、`HEAVEN_GIRL_DIARY`、`TOWN_STORE`、`TOWN_CAST`、`CTI_CAST_REPORT`です。未設定routeはdefault denyです。例えば最初のCanaryは次の設定です。

```text
GOOGLE_DRIVE_AUTO_EXECUTION_ENABLED=true
GOOGLE_DRIVE_AUTO_EXECUTION_ROUTES=HEAVEN_SHOP
```

## Initial policy and I10 completion

I8初期はHeaven系のみでしたが、I10で既存parserを再利用したTown/CTI target-date resolverを追加し、Production 8 MappingをVerifiedとしました。

| Mapping | AUTO Preview | 理由 |
|---|---:|---|
| HEAVEN_STORE | 許可 | `sourcePeriodFrom/To`をHeaven parserが取得 |
| HEAVEN_CAST + PAGE_ACCESS | 許可 | 同上 |
| HEAVEN_CAST + DIARY_POSTS | 許可 | 同上 |
| CTI_CAST_REPORT | Production Verified | 厳格filenameとXLSX 3店舗sheet検証でtarget dateを解決 |
| TOWN_STORE | Production Verified | CSV内部単日期間を正としてtarget dateを解決 |
| TOWN_CAST | Production Verified | CSV内部単日期間を正としてtarget dateを解決 |
| Town URL/LANDING | Blocked | I8対象外 |
| Heaven MY_GIRL、MITENE、TALK、通知系 | Blocked | 未解放 |

CTI/Townはファイル名を無条件に正とせず、TownはCSV内部期間、CTIは厳格filenameと3店舗sheet検証を使います。

## Execution Registry / Dispatcher

`auto-execution-gate.ts`の型付きPolicy ResolverがMapping/DataType + metricHintを判定し、Global Gateとroute allowlistの両方を通過したadapterだけをRegistryから呼び出します。route未許可またはtarget-date解決不能時は安全に停止します。Dispatcherは既存H6を使用し、`executePipeline` callbackと`executorOwnsState`を渡します。Parser、ImportBatch、fact writeはDispatcherへ追加していません。Manual CLIと同じadapter/coreを共有します。

## State and failure

```text
READY → IMPORTING → Existing Preview Pipeline → REVIEW_REQUIRED
```

Adapter側がDownload、SHA、lock、Preview、State更新を所有します。失敗時は既存分類に従い`FAILED_RETRYABLE`または`FAILED_FINAL`、validation/unresolvedは`REVIEW_REQUIRED`です。`lastImportBatchId`はPreview作成時に更新し、Confirm前に`lastSuccessfulImportBatchId`を変更しません。

## Idempotency and safety

既存のdriveFileId advisory lock、driveModifiedTime、SHA-256、fileHash、既存Batch duplicate制御を維持します。cron重複時はlockまたは既存Reviewへ誘導し、同一内容のBatchを増やしません。完了済みBatchと同一fileHashの`DUPLICATE_COMPLETED_FILE`はNOOPとして扱い、新しいReviewやBatchを作りません。`confirmCtiImport()`、`confirmTownImport()`、`confirmHeavenImport()`、`forceDuplicate`はAUTO経路から呼びません。

## Heaven cumulative file canonical operation

Heaven SHOPの月次累計CSVは、Mapping Folder内に日付別ファイルを増やすのではなく、月単位の同一Drive File（例：`tokeiShop_YYYYMM.csv`）を毎日上書きする運用を正規候補とします。同じDrive File IDの`modifiedTime`または内容SHA-256の変化をscanが検知し、既存の`IMPORTED` stateは新しい内容について`DETECTED`へ戻り、通常の`DOWNLOADING → READY → AUTO Preview → REVIEW_REQUIRED`を再実行します。新しいPreviewでは`lastImportBatchId`だけを新Batchへ関連付け、Manual Confirmが成功するまで`lastSuccessfulImportBatchId`は直前の成功Batchを保持します。Confirm後にのみpost-confirm syncが新Batchへ更新します。

同一Drive File IDで内容SHA-256が同じ場合は、既存のdriveFileId lock・driveModifiedTime/SHA・ImportBatchのfileHash重複検査により新しいBatchを作成しません。Heavenの確定処理は既存Pipelineの`heavenShopDaily` upsertを使用し、`businessDate + storeId + metricKey`の既存行は更新、新規日付は追加します。新しい累計ファイルに存在しない過去行を削除する処理はありません。

既存Import adapterはManual CLIのProduction確認ガードも共有します。I8のallowlist判定を通過したRegistryだけが内部`autoPreview` capabilityを渡してPreviewを起動でき、これはConfirmやfact writeを許可するものではありません。手動CLIは従来どおり`--confirm-production`を要求します。旧版を別名ファイルとして同じMapping Folderへ残す運用は再検知・重複判定を招くため非推奨とし、Archive/Error移動方針はI9で扱います。

## Observability

`scan_end`のAUTOカウンタは、`autoAttempted`（試行数）、`autoPreviewCreated`/`autoExecuted`（新Preview作成数）、`autoReviewRequired`（新Previewまたは既存Review）、`autoReused`（既存Batch再利用）、`autoNoop`（完了済み重複のNOOP）、`autoFailed`、`autoBlocked`に分離します。`autoExecuted`は後方互換の別名として新Preview作成数を示します。秘密情報、credential、Folder IDは出力しません。`import`表示は引き続き`NOT_EXECUTED`（Confirm未実行）です。

## Final Production status

I10総合Canaryで、`TOWN_STORE`、`TOWN_CAST`、`CTI_CAST_REPORT`、`HEAVEN_SHOP`、`HEAVEN_GIRL_ACCESS`、`HEAVEN_GIRL_DIARY`の全routeをProductionで確認済み。Global Gateは有効、route allowlistはdefault denyを維持し、`autoAttempted=37`、`autoPreviewCreated=34`、`autoReused=3`、`autoNoop=3`、`autoFailed=0`、`autoBlocked=0`だった。AUTO Confirmは実行せず、34件はHuman Review/Confirmへ進めた。

## Canary order

Global Gateをいきなり全Mappingへ適用せず、Heaven SHOP → PAGE_ACCESS → DIARY_POSTS → target date解決後のTown/CTIの順で、1 FileずつPreview、Review、Manual Confirm、Drive State同期を確認します。I8のProduction実行は本変更では行っていません。

今回の累計ファイル監査でもAUTO Gateは変更・有効化していません。ProductionはOFFのままです。
