# Phase H Implementation Decisions

## 1. Decision Freeze

本書をPhase H v1のImplementation Decision RecordおよびDecision Freezeとする。記載した決定は、実装中に暗黙変更しない。変更が必要になった場合は、次の順で既存仕様へ反映する。

1. Decision変更案を作成
2. 変更理由と代替案を記録
3. 影響範囲（Adapter、State、Dispatcher、Import、Production）を評価
4. この文書と関連設計書を更新
5. 承認後に実装を変更

本書はMarkdownのみを追加し、コード、DB、Prisma、Docker、設定を変更しない。

## 2. Confirmed Scope and Boundaries

| Layer | Fixed decision |
|---|---|
| Google Drive | 原本を提供する外部Source |
| Adapter | API、Folder/File metadata、Download、SHA-256、一時File |
| DriveFolderMapping | Folder ID→ImportSource/Store/ImportDataType/metricHint |
| DriveFileState | 個別Fileの検知・取得・Retry・状態 |
| Dispatcher | Adapter outputを既存Import Pipelineへ橋渡し |
| ImportSource | 媒体・店舗・種別の既存定義 |
| ImportBatch | 実Importの実行履歴・hash・件数 |
| ImportError | Parser/Validation/Alias等の既存エラー |

Adapter/DispatcherはCSV/XLSXを独自解析せず、Analytics fact tableへ直接書かない。Drive原本の移動・削除・Uploadは行わない。

## 3. Formal DriveFileState Status

Phase H v1では、次の9 Statusを正式候補として固定する。`DOWNLOADED`は`READY`へ統合し、`IGNORED`はState enumへ追加せず運用イベント/ignore reasonで表現する。`DUPLICATE`、`PREVIEW_READY`、`QUARANTINED`、`RETRY_WAITING`はImportBatch status、error category、`nextRetryAt`で表現する。

| Status | Meaning | Typical predecessor | Allowed next status | Scheduler target | Terminal |
|---|---|---|---|---:|---:|
| `DETECTED` | 新規または変更を検知し、処理候補になった | initial scan / `IMPORTED` | `DOWNLOADING`, `UNMAPPED`, `REVIEW_REQUIRED`, `FAILED_FINAL` | Yes | No |
| `DOWNLOADING` | Fileを一時領域へ取得中 | `DETECTED`, recovery | `READY`, `FAILED_RETRYABLE`, `FAILED_FINAL` | No（lease回収対象） | No |
| `READY` | Download、size、SHA-256、一次metadata検証済み | `DOWNLOADING` | `IMPORTING`, `FAILED_FINAL` | Same run only | No |
| `IMPORTING` | Dispatcherが既存Preview/Import Serviceを実行中 | `READY`, recovery | `IMPORTED`, `FAILED_RETRYABLE`, `FAILED_FINAL`, `REVIEW_REQUIRED` | No（lease回収対象） | No |
| `IMPORTED` | 最新内容のImportが成功した | `IMPORTING` | `DETECTED`（変更検知）, `REVIEW_REQUIRED`（Folder移動） | No | Yes until change |
| `FAILED_RETRYABLE` | 一時的障害で再試行可能 | `DOWNLOADING`, `READY`, `IMPORTING` | `DETECTED`, `FAILED_FINAL` | Yes when `nextRetryAt <= now` | No |
| `FAILED_FINAL` | 恒久障害またはRetry上限超過 | any processing state | `DETECTED`（明示Resetのみ） | No | Yes |
| `UNMAPPED` | Folder IDが未登録、または設定解決不能 | `DETECTED` | `DETECTED`（mapping追加/更新） | No | No |
| `REVIEW_REQUIRED` | Folder移動、店舗変更、設定変更、手動確認待ち | `DETECTED`, `IMPORTING`, `IMPORTED` | `DETECTED`（明示確認のみ） | No | No |

### 3.1 Status rules

- `status`だけを排他lockとして使用しない。
- `DOWNLOADING`/`IMPORTING`がlease期限を超えた場合、advisory lock解放後に`FAILED_RETRYABLE`へ回収する。
- `UNMAPPED`、`REVIEW_REQUIRED`、`FAILED_FINAL`をSchedulerが自動処理しない。
- `IMPORTED`で同一`driveFileId`の`modifiedTime`が変わらない場合、再Download/再Importしない。
- `FAILED_FINAL`からのResetは管理者の明示操作と理由を必須にする。

## 4. Lock Decision

### 4.1 Adopted mechanism

**PostgreSQL transaction-scoped advisory lockを採用する。**

Lock単位は`driveFileId`のみとし、同じDrive Fileが複数worker/processで同時処理されないことを保証する。status、SELECT結果、in-memory mutexだけを排他制御として使用しない。

### 4.2 Key policy

実装時は、`driveFileId`を固定canonical文字列にし、collision-resistantな決定的ハッシュから2つの32-bit整数または64-bit keyを生成する。利用するhash関数、namespace prefix、signed rangeは実装時の共通utilityで固定し、同じFile IDが毎回同じkeyになることをテストする。

Lock取得失敗時は待ち続けない。現在処理中としてSKIPし、現在のone-shot実行を終了する。次回pollで再評価する。

ImportBatchの既存SHA重複確認前後も、必要なtransaction内で同じFile lockを取得する。別File IDの同一SHAは既存ImportBatch idempotencyに委譲する。

### 4.3 Why not row/status lock

- row lockをDownload中ずっと保持すると、外部I/Oで長いtransactionになる。
- status更新だけでは同時read→同時processのraceを防げない。
- Redis/queueを追加せず、既存Production PostgreSQLを正本にできる。

## 5. Scheduler Decision

### 5.1 Formal choice

**cronから起動する10分間隔のone-shot CLI pollingを採用する。**

一回のCLIは次の順で実行し、終了する。

```text
scan → claim（advisory lock）→ process → state update → cleanup → exit
```

常駐worker、アプリ内scheduler、queue system、Redis、Drive push/watchはPhase H v1へ導入しない。

### 5.2 Query and execution

自動対象は次のいずれかとする。

```text
status = DETECTED
OR (status = FAILED_RETRYABLE AND nextRetryAt <= now)
```

`DOWNLOADING`/`IMPORTING`の期限切れはrecovery処理で`FAILED_RETRYABLE`へ戻してから次回処理する。`READY`は同じone-shot内でDispatcherへ渡し、次回scanの主対象にはしない。

Production cronの有効化はManual CLI Vertical Slice、Development Folder、重複/障害テスト、preview-only検証が完了した後とする。「最初からcronを動かさない」をPhase H v1の運用条件とする。

## 6. DriveFileState MVP Decision

### 6.1 Maximum candidate

Phase H v1の最大候補は、25運用field + `createdAt` + `updatedAt`の27 fieldとする。H4の30 field案をそのまま実装しない。

### 6.2 Candidate field list

| Group | Fields |
|---|---|
| Identity | `id`, `driveFileId`, `folderId`, `fileName` |
| Drive metadata | `mimeType`, `sizeBytes`, `driveMd5Checksum`, `createdTime`, `modifiedTime` |
| Content | `sha256` |
| Detection/import time | `firstDetectedAt`, `lastDetectedAt`, `lastDownloadedAt`, `lastImportAttemptAt`, `lastImportedAt` |
| State/retry | `status`, `retryCount`, `nextRetryAt` |
| Error | `lastErrorCode`, `lastErrorMessage` |
| Mapping | `importSourceId`, `importDataType`, `metricHint` |
| Batch pointers | `lastImportBatchId`, `lastSuccessfulImportBatchId` |
| Audit | `createdAt`, `updatedAt` |

`storeId`、`isTrashed`、`lastSeenAt`、Drive revision/change token、lease owner/expiry、event history、`DriveImportAttempt`はFuture候補とする。StoreはMapping/ImportSourceから再解決し、Trashの長期監査は後続要件が確認されてから追加する。

### 6.3 Implementation gate

実際のPrisma実装時に、各fieldをRequired/Nullableへ再確認する。Future用途だけのfieldを「念のため」で追加しない。`driveFileId`はunique、Scheduler用複合indexは最小限とする。

## 7. Auto-confirm Decision

Auto-confirmは既存Parser/Validation/Resolverの結果が全て決定的に安全な場合だけ許可する。Folderが正しいだけではAUTOにしない。

| Source | v1 classification | Conditions / prohibition |
|---|---|---|
| CTI CAST_REPORT | `MANUAL REVIEW` | 3店舗sheet、期間、必須列、Alias/Cast、warningをPreviewで確認。sheet欠損・未解決はAUTO禁止 |
| Town STORE | `AUTO` | 既存validation全PASS、Folder/store、外部店舗ID、期間、必須列、SHA重複なし。warningはReview |
| Town CAST | `MANUAL REVIEW` | Alias未紐付け/曖昧Castを明示確認。全行resolved時もv1はManual |
| Town URL | `MVP OUT /後続` | v1では監視しない |
| Town LANDING | `MVP OUT /後続` | v1では監視しない |
| Heaven SHOP | `AUTO` | Kasukabe固定、ヘッダー/期間/日付/metric検証、重複なし、Validation全PASS |
| Heaven Girl Access | `MANUAL REVIEW` | Folder metricHint、Cast解決、Preview結果を確認。将来条件付きAUTOを再評価 |
| Heaven Girl Diary | `MANUAL REVIEW` | Accessと同じ。未解決・warningはAUTO禁止 |
| Heaven MyGirl / Mitene / Talk | `MVP OUT` | Optional。v1では監視しない |
| Heaven Diary Notice / Attendance Notice | `BLOCKED / FUTURE` | 実ファイル意味・snapshot規則未確定 |

次の条件は全SourceでAUTO禁止とする：Alias unresolved、Ambiguous、Validation Error、Unsupported metric、店舗不一致、期間不一致、MISSINGの0補完、同日別SHAの修正版候補。

## 8. Production / Development Configuration Decision

### 8.1 Credential

- Production専用Service Account、専用credential JSONを使用する。
- credentialはSecret。Git、DB、ログ、backup dump、Documentationへ実値を記載しない。
- Dockerではread-only mountを使用し、既存app/db volume/networkを変更しない。
- Production credentialをlocal Developmentへコピーしない。

### 8.2 Folder ID

- Folder IDはSecretではないが、Production Configurationとして管理する。
- 実Folder IDをDocumentation、公開ログ、画面へ記載しない。
- DevelopmentはProductionと別Service Account、かつ別Development Folderを使用する。
- Production/DevelopmentでFolder mapping、監査、credentialを混在させない。

### 8.3 Missing credential behavior

H9で確定するまでの安全側方針は、credential不在時にDrive Automationだけをdisabledにし、既存Manual Import/Analyticsを継続することとする。health/CLIにはredacted errorのみを出す。

## 9. Dispatcher Input Contract Decision

### 9.1 Adapter output

H3の`DriveImportFile`をAdapterの正規化Outputとする。最低限、次を含む。

- `driveFileId`
- `folderId`
- `displayName`
- `localPath`
- `mimeType`
- `sizeBytes`
- `modifiedTime`
- `createdTime`
- `driveMd5Checksum`（取得可能時）
- `sha256`
- `downloadedAt`
- `routingHints`

### 9.2 Mapping resolution output

DispatcherはFolder Mapping解決結果として次を受け取る。

- `ImportSource`
- `Store`
- `ImportDataType`
- `metricHint`
- `Folder configuration`（mapping ID、active/future、検証結果）

### 9.3 Dispatcher responsibility

1. Mappingと`ImportSource`の整合を検証する。
2. Import先を決定する。
3. 既存Preview/Import Application Serviceを呼び出す。
4. ImportBatch/ImportError結果とDrive State更新情報をAutomation Layerへ返す。
5. Auto-confirm条件を満たさない場合はManual Reviewへ止める。

Dispatcherは禁止する：

- 独自CSV/XLSX parsing
- 独自Alias/Cast解決
- Analytics DB/fact tableへの直接write
- 既存Import Pipelineロジックの複製
- AdapterへGoogle API処理を逆流させること

## 10. MVP Folder Decision

Phase H v1 initial vertical sliceの正式対象は、次の**8 Folder**に固定する。

1. `CTI`
2. `Town/春日部/店舗別`
3. `Town/春日部/女子別`
4. `Town/越谷/店舗別`
5. `Town/越谷/女子別`
6. `Heaven/春日部/Shop`
7. `Heaven/春日部/Girl Access`
8. `Heaven/春日部/Girl Diary`

Town URL/LP、Heaven MyGirl/Mitene/Talk、Heaven通知2種、Archive/Error、野田、未登録Folderはv1 initial sliceで監視しない。

### Decision change: CTI Folder hierarchy

旧：`CTI/女子別レポート` Folder

新：`CTI` Folder直下へCTI女子別レポートXLSXを配置

理由：Phase H v1ではCTI Import種別が`CTI_CAST_REPORT`の1種類のみであり、不要なFolder階層を削減するため。

影響：Drive Folder ID登録対象が子Folderから`CTI` Folderへ変更される。Import Pipeline、`ImportDataType`、DB schema、`DriveFolderMapping`の設計には影響しない。将来CTIの別Import種別が増えた場合のみ、種別別の子Folder分割を再検討する。

## 11. Formal Implementation Order

実装順を次で固定する。

| Phase | Scope | Gate |
|---|---|---|
| H1 | Documentation / Architecture | **COMPLETE** |
| H2 | Google Authentication + Connection Test | Development credentialのみ |
| H3 | Drive Client / Adapter | DB/Import未接続 |
| H4 | DriveFolderMapping | 8 Folder mapping検証 |
| H5 | DriveFileState | additive migration、旧App互換 |
| H6 | Import Dispatcher | dry-run/preview境界 |
| H7 | Manual one-shot CLI scan | まず手動実行、cronなし |
| H8 | Advisory Lock + Retry + cron | 10分poll、重複/障害テスト後 |
| H9 | Production rollout | 段階有効化、手動rollback |

最初からcronを登録・有効化しない。H7で手動CLIのVertical Sliceを完成させ、H8で自動実行へ昇格する。

## 12. First Vertical Slice Definition

### 12.1 Environment

- Development専用Service Account
- Development専用HPlus Analytics Folder
- Production credential、Production Folder ID、実Production fileを使用しない

### 12.2 Success criteria

以下をすべて満たした時点をH2/H3最初の完成とする。

1. Service AccountでGoogle Driveへ接続できる。
2. 親Folder Viewer権限を確認できる。
3. 1 Folderの直下File一覧を取得できる。
4. 1 Fileのmetadata（ID、name、MIME、size、modifiedTime）を取得できる。
5. 1 Fileを一時領域へDownloadできる。
6. Download後のSHA-256を計算できる。
7. `DriveImportFile`を構築できる。
8. 一時Fileを成功・失敗の両方でcleanupできる。
9. Import Dispatcher、ImportBatch、DB fact tableを呼び出さない。
10. Secret、Folder ID、File内容をログへ漏らさない。

### 12.3 Explicit non-goals

このVertical Sliceでは、Import実行、Auto-confirm、DriveFileState migration、Scheduler/cron、Retry自動化、Archive/Error移動を行わない。

## 13. Decision Impact and Non-goals

### Fixed by this record

- Status 9
- `driveFileId` advisory lock
- 10分cron one-shot（H7完了後に有効化）
- State最大27 field（25運用 + 2監査timestamp）、Future fieldの抑制
- Source別Auto-confirm matrix
- Production/Development credential・Folder分離
- Dispatcher `DriveImportFile` contract
- Required 8 Folder
- H1→H9実装順

### Still Future

- `DriveImportAttempt`
- State event/audit table
- `storeId`/`isTrashed`/`lastSeenAt`のState cache
- Town URL/LP、Heaven MyGirl/Mitene/Talk、通知2種
-常駐worker、queue、Redis、Drive push/watch
- Error Folder自動移動
- 管理画面、通知、SLO

## 14. References and Consistency Check

整合確認対象：

- `docs/PHASE_H_IMPLEMENTATION_READINESS_REVIEW.md`
- `docs/PHASE_H_DRIVE_STATE_SPECIFICATION.md`
- `docs/PHASE_H_DRIVE_ADAPTER_SPECIFICATION.md`
- `docs/PHASE_H_GOOGLE_DRIVE_AUTHENTICATION_SPECIFICATION.md`
- `docs/PHASE_H_IMPORT_AUTOMATION_ARCHITECTURE.md`
- `docs/PHASE_H_GOOGLE_DRIVE_FOLDER_SPEC.md`
- `prisma/schema.prisma`（現行ImportSource/ImportBatch/ImportError）

Authentication文書の実ファイル名は`PHASE_H_GOOGLE_DRIVE_AUTHENTICATION_SPECIFICATION.md`であり、依頼文中の短縮名`...AUTHENTICATION_SPEC.md`はこの正式ファイルを指すものとして扱う。

本書で固定した決定により、Architectureの候補status、Lock未確定、Scheduler Future、Auto-confirm未定義、MVP範囲未確定というレビュー指摘を解消する。
