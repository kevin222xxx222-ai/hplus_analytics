# Phase H H2 Google Drive Connection

## Purpose

H2は、Development専用のGoogle Drive FolderへService Accountで読み取り接続できることを確認するフェーズです。H2ではFile Download、Import、DB/Prisma、DriveFileState、Dispatcher、Scheduler、cronを実行しません。

## Authentication

- Google Drive API v3
- Service Account JSON key
- OAuth scope: `https://www.googleapis.com/auth/drive.readonly`
- Development専用Service AccountとDevelopment専用Folderを使用
- 親FolderをService AccountへViewer相当で共有
- Production credential、Production Folder、共有Driveは使用しない

## Environment Variables

`.env.example`に値なしの例を用意しています。

```text
GOOGLE_DRIVE_CREDENTIALS_PATH=
GOOGLE_DRIVE_DEV_ROOT_FOLDER_ID=
```

`GOOGLE_DRIVE_CREDENTIALS_PATH`はJSON本体ではなく、ローカルに配置したcredential fileのpathです。`GOOGLE_DRIVE_DEV_ROOT_FOLDER_ID`はDevelopment root FolderのIDです。実値はGit、Documentation、ログへ記載しません。

## Credential Placement

Service Account JSONはリポジトリ外へ配置し、読み取り権限を必要最小限にしてください。

```text
<user-owned-secret-directory>/google-drive-development.service-account.json
```

`secrets/`と`*.service-account.json`はGitignore対象です。秘密鍵、Authorization header、JSON内容はCLI出力・例外・DBへ保存しません。Production credentialをDevelopment環境へコピーしないでください。

## Development Folder Sharing

1. Development専用Service Accountを作成する。
2. My Drive上のDevelopment root Folderを作成する。
3. root FolderをService AccountへViewerで共有する。
4. `GOOGLE_DRIVE_DEV_ROOT_FOLDER_ID`へroot Folder IDを設定する。
5. 子FolderはH1のFolder Specificationに沿って作成する。

H2の接続テストはroot Folderのmetadataと直下File一覧のみを読み取ります。Folder作成、移動、rename、削除、権限変更、Uploadは行いません。

## CLI

依存関係をインストール後、`.env.local`等を読み込んだShellで実行します。

```bash
npm run drive:test-connection
```

CLIは次を実行します。

1. credential path確認
2. Service Account JSONの安全な読込
3. Drive API read-only client生成
4. Development root Folder metadata取得
5. Folder名表示
6. 直下File一覧取得
7. 最大10件のFile名表示

期待結果：

```text
Google Drive connection: OK
Folder: HPlus Analytics Development
Files: 3
- sample.csv
- sample.xlsx
```

Fileのsize、MIME、時刻、checksumはAPI client内部で正規化しますが、接続テストの標準出力には秘密情報や不要な詳細を出しません。

## Failure Examples

以下は非ゼロ終了です。

| Error | Meaning |
|---|---|
| `GOOGLE_DRIVE_CREDENTIALS_PATH_MISSING` | credential path未設定 |
| `GOOGLE_DRIVE_CREDENTIALS_FILE_NOT_FOUND` | credential file不存在/読取不可 |
| `GOOGLE_DRIVE_CREDENTIALS_INVALID_JSON` | JSON不正 |
| `GOOGLE_DRIVE_CREDENTIALS_INVALID` | Service Account必須項目不足 |
| `GOOGLE_DRIVE_AUTH_FAILURE` | Google Drive認証失敗 |
| `GOOGLE_DRIVE_FOLDER_ID_MISSING` | Development Folder ID未設定 |
| `GOOGLE_DRIVE_FOLDER_NOT_FOUND` | Folder不存在 |
| `GOOGLE_DRIVE_PERMISSION_DENIED` | Folder共有/権限不足 |
| `GOOGLE_DRIVE_API_ERROR` | その他Drive API障害 |

エラー出力はsafe messageのみとし、秘密鍵・token・APIレスポンスのsecret部分を表示しません。

## H2 Boundary

H2で確認するのは接続・Folder metadata・直下File metadataの取得までです。H3でDownloadとtemporary file lifecycleを実装し、H4以降でFolder Mapping、State、Dispatcher、Schedulerを実装します。

## Production Notice

このH2実装では本番VPSの設定、`docker-compose.production.yml`、Production credential mount、Nginx、DB、Prisma migration、cronを変更しません。Production Folder IDとProduction Service AccountをローカルConnection Testで使用することは禁止です。

## Dependency

Google公式の`googleapis` packageを使用します。Google Drive API v3 clientとService Account認証を提供するためで、他のGoogle SDKは追加しません。
