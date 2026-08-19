# Phase H H3 Google Drive Download

## Purpose

H3は、H2で接続確認済みのDevelopment Google Driveから1ファイルをread-onlyで取得し、Git管理外のtemporary fileへ保存し、SHA-256を計算してcleanupするVertical Sliceです。

Import、ImportBatch、DriveFileState、DriveFolderMapping、Dispatcher、Scheduler、cron、advisory lock、Production設定は実装しません。

## CLI

```bash
npm run drive:test-download
```

対象Fileは、`GOOGLE_DRIVE_DEV_TEST_FILE_ID`が設定されていればそのFileを使用します。未設定時はDevelopment root Folder直下の最初の通常ファイルを使用します。Google Workspace native file（Docs/Sheets/Slides等）やTrash Fileは対象にしません。

再利用する環境変数：

```text
GOOGLE_DRIVE_CREDENTIALS_PATH=
GOOGLE_DRIVE_DEV_ROOT_FOLDER_ID=
GOOGLE_DRIVE_DEV_TEST_FILE_ID=
```

実値は`.env.example`、Git、Documentationへ記載しません。

## Temporary Storage

既定の保存先は次です。

```text
data/tmp/google-drive/
```

必要なら`GOOGLE_DRIVE_TEMP_DIR`でDevelopment専用の保存先へ変更できます。保存先は自動作成され、`.gitignore`でGit管理外です。

temporary filenameは、Drive File IDを安全化した文字列、UUID、限定的な拡張子から生成します。元のFile名をpathとして直接使用せず、`..`、slash、制御文字等を除去します。cleanup APIはTemporaryStorageが発行・追跡したpathだけを削除でき、任意path削除には使用できません。

## SHA-256

Download streamをTransformで受け、全内容をmemoryへ載せずにtemporary fileへ書き込みながらSHA-256を計算します。CLIにはhash値のみ表示し、File内容やcredentialを表示しません。空Fileも有効なDownloadとして扱い、空内容のSHA-256を返します。

`DriveImportFile`には、次のH3 Outputを構築します。

- `driveFileId`
- `folderId`
- `displayName` / `fileName`
- `localPath`
- `mimeType`
- `sizeBytes`
- `createdTime`
- `modifiedTime`
- `driveMd5Checksum`
- `sha256`
- `downloadedAt`

Store、Media、ImportDataType、metricHintはFolder Mapping未実装のためH3では設定しません。

## Cleanup

成功時はCLI終了前に明示cleanupします。Download、stream、writeに失敗した場合も、作成済みtemporary fileを可能な範囲で削除します。cleanup失敗は安全なエラーとして返し、残存pathが管理対象として追跡できるようにします。

## Unsupported Files

Google Workspace native MIME type（`application/vnd.google-apps.*`）のexportはH3では実装しません。検知時は`GOOGLE_DRIVE_UNSUPPORTED_WORKSPACE_FILE`で停止します。CSV、XLSX、その他のuploaded binaryはstream Download対象です。

## Expected Output

```text
Google Drive download test: START
Folder: 00_HPlus Analytics Development
File: test.csv
Size: 123 bytes
SHA-256: <hash>
Temporary file created: data/tmp/google-drive/<managed-name>
Temporary cleanup: OK
Google Drive download test: OK
```

## Failure Categories

- `GOOGLE_DRIVE_FILE_NOT_FOUND`
- `GOOGLE_DRIVE_UNSUPPORTED_WORKSPACE_FILE`
- `GOOGLE_DRIVE_DOWNLOAD_FAILED`
- `GOOGLE_DRIVE_TEMP_STORAGE_FAILED`
- `GOOGLE_DRIVE_CHECKSUM_FAILED`
- `GOOGLE_DRIVE_CLEANUP_FAILED`

既存H2のcredential、permission、API error分類も維持します。秘密鍵、token、Authorization header、Download URLのsecret queryはログへ出しません。

## H3 Boundary

H3の成功は「Download、temporary保存、SHA-256、cleanup」が成功したことを意味します。Importを実行せず、ImportBatchを作成せず、DBへ書き込みません。H4ではFolder Mapping、H5ではDriveFileStateを実装します。

## Production Notice

本H3はDevelopment用です。Production credential、Production Folder、Docker Compose、Nginx、PostgreSQL、Prisma、cron、Schedulerは変更・使用しません。
