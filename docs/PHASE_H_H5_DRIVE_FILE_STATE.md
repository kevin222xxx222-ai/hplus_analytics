# Phase H H5 DriveFileState

## 1. 目的と範囲

Google Drive上のFile単位で、Automation Layer専用の検知・Download前後・Import参照状態を保存します。既存のImportBatch/ImportErrorを置き換えず、実績データやImport Pipelineを変更しません。

H5では、Dispatcher、既存Import Service呼び出し、Scan自動化、Scheduler、Retry自動実行、Advisory Lock、cron、Production rolloutは実装しません。

## 2. Model

`DriveFileState`は28フィールドです。Drive Fileの安定IDを正本とし、媒体・店舗・ImportDataType・metricHintは二重保持せず、`DriveFolderMapping`のFKから解決します。

| 分類 | Fields |
|---|---|
| Identity | `id`, `driveFileId`（unique）, `folderId`, `fileName`, `mimeType` |
| Content metadata | `sizeBytes`, `driveMd5Checksum`, `sha256`, `driveCreatedTime`, `driveModifiedTime` |
| Detection timestamps | `firstDetectedAt`, `lastDetectedAt`, `lastDownloadedAt`, `lastImportAttemptAt`, `lastImportedAt`, `lastSeenAt` |
| State/error | `status`, `retryCount`, `nextRetryAt`, `lastErrorCategory`, `lastErrorCode`, `lastErrorMessage` |
| Relations/retention | `driveFolderMappingId`, `lastImportBatchId`, `lastSuccessfulImportBatchId`, `isTrashed` |
| Audit | `createdAt`, `updatedAt` |

`DriveFolderMapping`へのnullable FKを持ち、ImportBatchへの2つのnullable参照は最新試行・最新成功へのポインタだけです。H5では`DriveImportAttempt`を作成しません。

## 3. Status

正式Statusは次の9個です。

`DETECTED` / `DOWNLOADING` / `READY` / `IMPORTING` / `IMPORTED` / `FAILED_RETRYABLE` / `FAILED_FINAL` / `UNMAPPED` / `REVIEW_REQUIRED`

`READY`はDownload・checksum検証済みでDispatcher受け渡し可能な状態を表します。H5はこの状態を保存するだけで、Dispatcherは起動しません。

## 4. Failure Category

12分類を採用します。

`AUTH`, `PERMISSION`, `FOLDER_NOT_FOUND`, `FILE_NOT_FOUND`, `DOWNLOAD`, `CHECKSUM`, `VALIDATION`, `IMPORT`, `TRANSIENT_API`, `RATE_LIMIT`, `DISK`, `UNKNOWN`

秘密情報を`lastErrorMessage`へ保存せず、`lastErrorCode`と安全な要約だけを記録します。

## 5. State Transition

Service層の許可遷移は次のとおりです。

```text
DETECTED          -> DOWNLOADING / UNMAPPED / REVIEW_REQUIRED
DOWNLOADING       -> READY / FAILED_RETRYABLE / FAILED_FINAL / REVIEW_REQUIRED
READY             -> IMPORTING / FAILED_RETRYABLE / FAILED_FINAL / REVIEW_REQUIRED
IMPORTING         -> IMPORTED / FAILED_RETRYABLE / FAILED_FINAL / REVIEW_REQUIRED
IMPORTED          -> DETECTED / REVIEW_REQUIRED
FAILED_RETRYABLE  -> DETECTED / DOWNLOADING / REVIEW_REQUIRED
FAILED_FINAL      -> DETECTED / REVIEW_REQUIRED
UNMAPPED          -> DETECTED / REVIEW_REQUIRED
REVIEW_REQUIRED   -> DETECTED / READY
```

許可されない遷移はDomain Errorとして拒否します。`status`を排他Lockとして使用しません。

## 6. Detection Upsert

`upsertDetectedDriveFile()`はH3 Adapterのmetadataを受け取り、次を行います。

- 初回`driveFileId`は`DETECTED`（Mapping未解決・無効なら`UNMAPPED`）で作成
- 既存Fileはmetadata、`lastDetectedAt`、`lastSeenAt`を更新
- 同じ`modifiedTime`は再Download不要候補
- `modifiedTime`変更は再評価対象
- renameだけなら同じStateの`fileName`更新
- 同じ`driveFileId`のFolder移動、またはMapping変更は`REVIEW_REQUIRED`
- 未登録Folderは`UNMAPPED`
- File Stateを物理削除しない。`isTrashed`で保持する

Mapping IDを指定する場合、Folder IDとの一致を検証します。inactive / future Mappingは自動処理対象にしません。

## 7. Duplicate / Update判定

`classifyDriveFileUpdate()`は次を返します。

- 同一`driveFileId`かつ`modifiedTime`不変：`unchanged`
- `modifiedTime`変更かつSHA-256同一：`content_unchanged`
- `modifiedTime`またはSHA-256変更：`changed`

別Drive Fileの同一SHAや、ImportBatchの`fileHash` idempotencyは既存Import Pipelineの責務です。H5が既存重複判定を置き換えることはありません。

## 8. Service API

- `upsertDetectedDriveFile(input, db?)`
- `classifyDriveFileUpdate(existing, input)`
- `canTransitionDriveFileState(from, to)` / `assertDriveFileStateTransition(from, to)`
- `transitionDriveFileState(id, to, patch?, db?)`
- `markDriveFileFailure(id, failure, db?)`
- `getDriveFileStateByDriveFileId(driveFileId, db?)`
- `listDriveFileStatesByStatus(status, db?)`
- `listPendingDriveFileStates(now?, db?)`

`listPendingDriveFileStates`は`DETECTED`、`READY`、期限到来した`FAILED_RETRYABLE`を返します。Retry Scheduler自体はH5の範囲外です。

## 9. Index / Migration

Indexは5個です。

1. unique `driveFileId`
2. `(status, nextRetryAt)`
3. `(folderId, status)`
4. `(driveFolderMappingId, status)`
5. `(driveModifiedTime, lastDetectedAt)`

`prisma/migrations/20260814074155_add_drive_file_states`はenum、Table、FK、Indexを追加するだけのAdditive Migrationです。既存Table・既存データは変更しません。Migrationはcreate-onlyで作成し、Development/Production DBへ適用していません。

## 10. H6接続点

H6 Dispatcherは、`READY` Stateと`DriveFolderMapping`を解決し、既存Import Serviceへ入力を渡す設計です。H5ではその呼び出し・自動実行・ImportBatch生成は行いません。

## 11. Production安全性

- Production migration未適用
- Production credential / Folder未設定
- Import、Scheduler、cron、Advisory Lock未実行
- 既存Manual Import、Analytics、ImportBatchデータ未変更

## 12. Development実環境検証CLI

Development専用の`npm run drive:test-detect-state`を追加しています。`GOOGLE_DRIVE_DEV_TEST_FOLDER_ID`で指定した、H4 Mapping登録済みFolderを読み取り、直下の通常Fileを1件選択してmetadataだけを`upsertDetectedDriveFile()`へ渡します。

```bash
GOOGLE_DRIVE_DEV_TEST_FOLDER_ID="<development-cti-folder-id>" \
GOOGLE_DRIVE_DEV_TEST_FILE_ID="<optional-file-id>" \
npm run drive:test-detect-state
```

必須環境変数は既存の`GOOGLE_DRIVE_CREDENTIALS_PATH`と`GOOGLE_DRIVE_DEV_TEST_FOLDER_ID`です。`GOOGLE_DRIVE_DEV_TEST_FILE_ID`を省略すると、Folder直下の最初の通常Fileを使用します。実際のIDはRepositoryやDocumentationへ保存しません。

再実行時は`driveFileId`のunique制約を使って同じStateを更新し、`UNCHANGED`等の既存判定を表示します。CLIはH4 Mapping解決、metadata取得、DriveFileState upsert、結果表示だけを行います。

このCLIはDevelopment検証専用です。Download、ImportBatch作成、Import、Driveへの書込、File移動、削除、Scheduler、Retry、Lock、Production Folder利用は行いません。実Google Driveでの検証結果は、実IDとDevelopment credentialを設定して実行するまで`NOT VERIFIED`です。
