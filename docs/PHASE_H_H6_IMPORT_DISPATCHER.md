# Phase H H6 Import Dispatcher

## 1. 目的と責務

H6 Dispatcherは、H3の`DriveImportFile`とH4のResolved `DriveFolderMapping`を受け取り、既存のCTI/Town/Heaven Import Pipelineへ渡すrouteと運用policyを決めます。

Dispatcher自身はCSV/XLSXを解析せず、Drive APIを呼ばず、Downloadせず、Analytics fact tableへ直接書き込みません。既存Pipelineの実行は注入されたexecutor境界からのみ行います。

Scheduler、cron、Retry自動化、Advisory Lock、Production rolloutはH6の範囲外です。

## 2. Input / Output

`dispatchDriveImport({ file, mapping, stateId?, stateStatus? }, options)`を提供します。

Inputは`driveFileId`、Folder ID、file名、localPath、MIME、size、SHA-256、`ImportDataType`、metricHint、ImportSource、Store、Mappingを含みます。

Outputは次の情報です。

| Field | Meaning |
|---|---|
| `status` | `IMPORTED` / `REVIEW_REQUIRED` / `BLOCKED` / `FAILED` |
| `pipeline` | 解決した既存Pipeline |
| `policy` | `AUTO` / `MANUAL_REVIEW` / `BLOCKED` |
| `importBatchId` | 既存Pipelineが返したBatch ID。Dispatcher独自作成はしない |
| `message` | 安全な結果要約 |
| `autoConfirmed` | Auto routeが検証成功した場合のみtrue |
| `reviewReason` | Manual Review理由 |
| `errorCode` | Blocked/Failure分類 |

## 3. Route / Policy Matrix

| ImportDataType / metricHint | Pipeline | Policy |
|---|---|---|
| `CTI_CAST_REPORT` | CTI | MANUAL_REVIEW |
| `TOWN_STORE` | Town Store | AUTO候補 |
| `TOWN_CAST` | Town Cast | MANUAL_REVIEW |
| `HEAVEN_STORE` | Heaven Shop | AUTO候補 |
| `HEAVEN_CAST + PAGE_ACCESS` | Heaven Girl Access | MANUAL_REVIEW |
| `HEAVEN_CAST + DIARY_POSTS` | Heaven Girl Diary | MANUAL_REVIEW |
| `TOWN_URL`, `TOWN_LANDING` | — | BLOCKED / MVP_OUT_OF_SCOPE |
| `HEAVEN_CAST + MY_GIRL/MITENE_SENT/OKINI_TALK_SENT` | — | BLOCKED / UNSUPPORTED_HEAVEN_METRIC |
| `ATTENDANCE_NOTICE`, `DIARY_NOTICE` | — | BLOCKED / FUTURE |
| unknown type、inactive/future Mapping | — | BLOCKED |

AUTOは無条件成功ではありません。既存Pipeline executorが返すwarning、unresolved/pending、errorが1件でもあれば`REVIEW_REQUIRED`とします。

## 4. Existing Pipeline Boundary

Dispatcherは既存Serviceを複製しません。実行時は`executePipeline` callbackへroute済みのFileを渡し、既存の各ServiceがPreview/Validation/ImportBatchを担当します。

- CTI: `createCtiPreview` / 既存CTI confirm境界
- Town: `createTownPreview` / 既存Town importer境界
- Heaven: `createHeavenPreview` / 既存Heaven confirm境界

H6のDevelopment CLIは`RESOLVE_ONLY`固定であり、executorは呼び出しません。

## 5. DriveFileState連携

`EXECUTE`モードで`stateId`が渡された場合、既存H5 Serviceを使って次を扱います。

```text
READY -> IMPORTING -> IMPORTED
                    -> REVIEW_REQUIRED
                    -> FAILED_RETRYABLE / FAILED_FINAL
```

`RESOLVE_ONLY`ではDB状態を変更しません。`stateStatus`がREADY以外の場合はDispatchを開始せずReview扱いにします。

## 6. RESOLVE_ONLY

```ts
await dispatchDriveImport(input, { mode: "RESOLVE_ONLY" });
```

Route、Pipeline、Policyだけを確認し、Import Pipeline、ImportBatch、実績DBへの書き込みを行いません。Development検証、Folder Mapping確認、H7手動Scanの前段で使用します。

## 7. Development CLI

```bash
npm run drive:test-dispatch
```

既存の`GOOGLE_DRIVE_CREDENTIALS_PATH`と`GOOGLE_DRIVE_DEV_TEST_FOLDER_ID`を使用します。任意の`GOOGLE_DRIVE_DEV_TEST_FILE_ID`を指定できます。Folder Mappingを解決し、直下Fileを1件選び、次を表示します。

```text
Drive Dispatcher test: OK
File: 女子別レポート_20260808.xlsx
ImportDataType: CTI_CAST_REPORT
Pipeline: CTI
Policy: MANUAL_REVIEW
Status: REVIEW_REQUIRED
Import: NOT EXECUTED
```

実Google Driveでの検証はDevelopment credentialと実Folder IDを設定して実行するまで`NOT VERIFIED`です。

## 8. Tests

CTI、Town Store/Cast、Heaven Shop/Girl、unsupported metric、AUTO/MANUAL/BLOCKED、RESOLVE_ONLYのImport未実行をUnit Testで確認します。

## 9. Production Safety / H7接続

- Production Folder ID、credentialは登録しない
- Production DB migration/deployは行わない
- Scheduler、cron、Retry自動化、Lockは実装しない
- H7ではこのDispatcherを手動one-shot scanのroute/preview境界へ接続する
