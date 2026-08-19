# Phase H H4 Drive Folder Mapping

## Purpose

H4は、Google Drive Folder IDを既存の`ImportSource`、店舗、`ImportDataType`、Heaven `metricHint`へ安全に紐付けるための設定層です。

H4ではImport実行、DriveFileState、Dispatcher、Scheduler、cron、Retry、advisory lock、Production rolloutは行いません。

## Responsibility

- `ImportSource`: 媒体・店舗・Import種別の既存定義
- `DriveFolderMapping`: Google Drive Folder IDと既存Import設定の紐付け
- `DriveFileState`: H5で個別Drive Fileの状態を管理
- Dispatcher: H6でMappingを解決し、既存Import Pipelineへ渡す

ImportSourceをDrive専用に複製せず、Mappingから既存ImportSourceを参照します。

## Prisma Model

`DriveFolderMapping`を追加しました。

| Field | Meaning |
|---|---|
| `id` | internal UUID |
| `driveFolderId` | Google Drive Folder ID。unique |
| `displayName` | 管理用表示名 |
| `importSourceId` | 既存ImportSourceへの参照 |
| `storeId` | 店舗。CTIはnull可 |
| `importDataType` | 既存ImportDataType |
| `metricHint` | Heaven Girl等の既存metric hint |
| `priority` | `REQUIRED` / `OPTIONAL` / `FUTURE` |
| `isActive` | falseなら運用無効 |
| `isFuture` | trueならPhase H v1の自動処理対象外 |
| `createdAt` / `updatedAt` | 監査時刻 |

`priority=FUTURE`と`isFuture=true`は一致させます。`isActive=false`は管理上の無効化、`isFuture=true`は将来予約という別の意味です。

Indexは`driveFolderId` unique、`importSourceId`、`isActive + isFuture`だけを追加しています。

## Migration

Migrationは`drive_folder_mappings`テーブルと`DriveFolderMappingPriority` enumを追加します。既存の`ImportSource`、`Store`、ImportBatch、fact tableのデータは変更しません。

既存Production Appは新テーブルを参照しないため、新migration後も旧Appが起動できます。Productionへのmigration実行は今回行っていません。

## Folder Resolution

`resolveDriveFolderMapping(folderId)`がuniqueなFolder IDからMappingを取得します。結果にはMapping、既存ImportSource、Store、ImportDataType、metricHint、priority、active/future状態が含まれます。

- 未登録Folderは`Drive Folder is UNMAPPED.`で明示的に失敗
- `isActive=false`はactive listから除外
- `isFuture=true`はactive listから除外
- Unknown Folderを自動Importへ流さない

## Validation

登録時に次を検証します。

- Folder ID、表示名が空でない
- ImportSourceが存在する
- MediaTypeとImportDataTypeが一致する
- Mapping storeとImportSource storeが一致する
- CTIは3店舗レポートのためstore=null、metricHint=null
- Townは春日部/越谷のみ。metricHint不可
- Heavenは春日部のみ
- Heaven ShopはmetricHint不可
- Heaven Girlは既存metricHint（`PAGE_ACCESS`、`DIARY_POSTS`等）のみ
- `priority=FUTURE`と`isFuture`が一致する
- 野田・久喜をH4対象Mappingへ登録しない

## Development Setup

実Folder IDはコード、migration、seed、documentationへハードコードしません。H4ではidempotentなupsert CLIを使用します。

```bash
npm run drive:mapping:upsert -- \
  --folder-id="<development-folder-id>" \
  --display-name="Town Kasukabe Store" \
  --import-source-id="<existing-import-source-id>" \
  --store-id="<kasukabe-store-id>" \
  --data-type="TOWN_STORE" \
  --priority="REQUIRED"
```

Heaven Girlの例：

```bash
npm run drive:mapping:upsert -- \
  --folder-id="<development-folder-id>" \
  --display-name="Heaven Kasukabe Girl Access" \
  --import-source-id="<existing-heaven-source-id>" \
  --store-id="<kasukabe-store-id>" \
  --data-type="HEAVEN_CAST" \
  --metric-hint="PAGE_ACCESS" \
  --priority="REQUIRED"
```

同じFolder IDを再登録するとupsertされ、重複レコードは作られません。実IDはShell環境またはSecret/Configuration管理から渡し、リポジトリへ保存しません。

## Phase H v1 MVP Folder

初期Vertical Sliceの正式対象は8 Folderです。

1. CTI
2. Town / 春日部 / 店舗別
3. Town / 春日部 / 女子別
4. Town / 越谷 / 店舗別
5. Town / 越谷 / 女子別
6. Heaven / 春日部 / Shop
7. Heaven / 春日部 / Girl Access
8. Heaven / 春日部 / Girl Diary

Town URL/LP、Heaven MyGirl/Mitene/Talk、通知2種、Archive/Error、野田、久喜は初期監視対象外です。

## Production Safety

- Production Folder IDを登録していない
- Production migrationを実行していない
- `docker-compose.production.yml`を変更していない
- Import、Dispatcher、Scheduler、cronを起動していない
- 既存Production ImportSourceやデータを変更していない

## Next Phase

H5でDriveFileStateをadditive migrationとして追加し、H6でDispatcher dry-runへ接続します。H4のMapping自体はImportを実行しません。
