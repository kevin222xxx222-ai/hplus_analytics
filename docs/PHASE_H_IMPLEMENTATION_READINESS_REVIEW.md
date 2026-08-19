# Phase H Implementation Readiness Review

## Executive Decision

**判定: READY WITH CONDITIONS**

基本アーキテクチャは実装可能である。Google DriveをInput Adapterに限定し、Folder IDを設定の正、Dispatcherを既存Import Pipelineとの境界、DriveFileStateを個別Fileの状態、ImportBatch/ImportErrorを実Importの正とする責務分離は、対象6設計書と現行Prisma/Import実装で概ね一致している。

ただし、現状のまま本番自動確定へ進むことは許可しない。実装開始前に、状態enum、Lock方式、Scheduler方式、Auto-confirm境界、MVP対象Folder、Drive Stateのfield削減を決定する必要がある。最初の実装はRequired Folderだけのpreview-only縦切りとし、Production自動確定は別ゲートにする。

## Review Scope and Evidence

照合対象：

- `docs/PHASE_H_DRIVE_IMPORT_SOURCE_AUDIT.md`
- `docs/PHASE_H_GOOGLE_DRIVE_FOLDER_SPEC.md`
- `docs/PHASE_H_IMPORT_AUTOMATION_ARCHITECTURE.md`
- `docs/PHASE_H_GOOGLE_DRIVE_AUTHENTICATION_SPEC.md`
- `docs/PHASE_H_DRIVE_ADAPTER_SPECIFICATION.md`
- `docs/PHASE_H_DRIVE_STATE_SPECIFICATION.md`
- `docs/HPLUS_ANALYTICS_COMPLETE_SYSTEM_SPECIFICATION_v1.0.1.md`
- `prisma/schema.prisma`
- 現行 `src/lib/imports/cti`、`town`、`heaven` Import Service

現行Prismaでは`ImportSource`、`ImportBatch`、`ImportError`が既に存在する。`ImportSourceKind.GOOGLE_DRIVE`は定義済みだが、Drive API、Folder監視、Download、Scheduler、自動confirmは未実装である。HeavenはKasukabeのみを許可し、Town BulkはKasukabe/Koshigayaのみを対象とする実装を確認した。

## Confirmed Architecture

| Layer | Confirmed responsibility | Review |
|---|---|---|
| Google Drive | 原本とFolderを提供するExternal Source | 整合 |
| Drive Adapter | API通信、metadata、一覧、Download、SHA-256、一時File | 整合 |
| DriveFolderMapping | Folder ID→Import設定/店舗/metricHint | 整合。専用設定を推奨 |
| Import Dispatcher | mapping検証、既存Serviceへの橋渡し、State/Batch参照 | 整合 |
| DriveFileState | 個別Drive Fileの検知・Download・Retry・Folder移動状態 | 整合。Importロジックを持たない |
| ImportSource | 媒体、店舗、ImportDataTypeの定義 | 既存Schemaと整合 |
| ImportBatch | 実Importの状態、hash、件数、対象期間 | 既存Schemaを正とする |
| ImportError | Parser/Validation/Alias等の内部エラー | 既存Schemaを正とする |
| Existing Pipeline | Preview、Validation、Alias、DB upsert | Adapterから直接参照しない |

Adapterは`CtiCastDaily`等へ直接書かず、DispatcherはCSV/XLSXを再解析しない。原本はDrive上の元Folderに残し、Archive/Errorへの自動移動はv1では行わない。

## Contradictions Found

設計間の実質的な矛盾または未統一は**6件**ある。いずれも実装前に解消する。

| # | Finding | Impact | Required resolution |
|---:|---|---|---|
| 1 | Architectureの候補status（`DISPATCHED`、`PREVIEW_READY`、`DUPLICATE`、`RETRY_WAITING`、`QUARANTINED`等）とH4の10 statusが異なる | 状態遷移・Scheduler query・監査表示が実装者ごとに分岐する | H4の10状態を正本にし、ImportBatch statusはDrive Stateへ複製しない |
| 2 | LockはArchitectureがadvisory lockまたは同等、H4がrow lock推奨だが最終選択未確定 | 同時実行時の二重Import防止を実装できない | Phase H v1はPostgreSQL advisory lockを採用し、claim metadataをtransactionで更新する |
| 3 | SchedulerはArchitectureでFuture、H4でScheduler前提、Productionはcron運用済み | workerをいつ・どこで動かすかが未確定 | v1はcronから起動するone-shot CLI。常駐worker/queueはFuture |
| 4 | 既存Preview/ConfirmをCTI/Town/Heavenのどこまで自動confirmするか未定義 | Alias unresolvedやHeaven snapshot resetを誤確定する危険 | Source別Auto-confirm matrixを本書で固定し、条件外はManual Review |
| 5 | H4の30 fieldは監査とFuture機能を同じStateへ詰めている | migration、更新競合、Retentionが過剰になる | MVPは25 fieldへ削減し、isTrashed/lastSeenAt等は同一モデルに残すがAttempt/lease等はFuture |
| 6 | Drive Stateの`lastImportBatchId`とImportBatch metadataのprovenanceが二重化する可能性 | Batch履歴とState pointerの責務が曖昧になる | Stateは最新ポインタ、Batchは実行履歴。Drive provenanceはBatch metadataへ一度だけ保存 |

Folder、Authentication、Drive Adapterの責務分離、Heaven 8 Folder構成、Archive/Error Future方針については矛盾を確認しなかった。

## Responsibility Matrix

| Operation | Adapter | Folder Mapping | Dispatcher | DriveFileState | Import Pipeline |
|---|---:|---:|---:|---:|---:|
| Drive API auth/list/download | Owner | - | - | - | - |
| Folder ID→設定解決 | Hint搬送 | Owner | Verify | Record result | - |
| MIME/size/hash一次確認 | Owner | - | Verify | Record | - |
| CSV/XLSX parser | - | - | - | - | Owner |
| Alias/Cast解決 | - | - | - | - | Owner |
| ImportBatch作成 | - | - | Orchestrate | Reference | Owner |
| ImportError作成 | - | - | - | - | Owner |
| retry/backoff | - | - | Request | State fields | Scheduler |
| DB fact upsert | - | - | - | - | Owner |
| Drive原本の移動/削除 | Prohibited | - | Prohibited | Logical quarantine only | - |

## Folder Specification Review

### Confirmed

- CTIは1 Folder、1 XLSX、春日部/越谷/野田の3店舗sheet。
- Townは春日部/越谷をFolder IDで分離し、`STORE`、`CAST`、`URL`、`LANDING`を別設定にする。
- Heavenは春日部のみ。Shop 1 FolderとGirl 7 metric Folderの合計8 Folder。
- Heaven Girlの`tokeiGirl_YYYYMM.csv`同名問題はFolderの`metricHint`で解決し、fileNameで推測しない。
- Archive/Errorは予約のみで、v1では自動移動しない。
- 野田Heaven、Town野田、未定義媒体は自動Import対象外。

### MVP対象Folder

Requiredのみで開始する。対象は**8 Folder**：

1. `CTI`
2. `Town/春日部/店舗別`
3. `Town/春日部/女子別`
4. `Town/越谷/店舗別`
5. `Town/越谷/女子別`
6. `Heaven/春日部/Shop`
7. `Heaven/春日部/Girl Access`
8. `Heaven/春日部/Girl Diary`

Town URL/LP、Heaven MyGirl/Mitene/TalkはOptional、通知2種はFutureとする。

## Authentication Review

正式案のMy Drive + Service Account + 親Folder Viewer共有 + `drive.readonly` + VPS Secret JSON + Docker read-only mountは、Folder仕様、Adapter、Production hardeningと矛盾しない。

実装時の必須条件：

- Production/DevelopmentのService Account、Cloud Project、Folderを分離する。
- credential JSONはGit、DB、backup dump、ログへ含めない。
- Secret mountが欠けても既存Manual Import/Analyticsを停止させない初期方針にする。
- Viewerのみ。Drive原本の移動・削除・作成権限は与えない。
- Folder IDは設定、private keyはSecretとして別管理する。

## Adapter Review

H3のAdapterは次を満たしており、実装開始可能である。

- Import DBへ直接書かない。
- ImportBatch/ImportErrorを作らない。
- Import成功/失敗の意味を解釈しない。
- Retry policyを持たない。
- Schedulerを呼ばない、またはSchedulerを依存しない。
- `DriveImportFile`をDispatcherへ渡し、一時Fileをcleanupする。

ただし、Dispatcherが既存`createCtiPreview`、`createTownPreview`、`createHeavenPreview`へ渡すApplication Service契約を、実装前に固定する必要がある。

## Drive State Review

### Recommended MVP fields: 25

H4の30 fieldから、次の25 fieldをMVPへ採用する。

1. `id`
2. `driveFileId`
3. `folderId`
4. `fileName`
5. `mimeType`
6. `sizeBytes`
7. `driveMd5Checksum`
8. `sha256`
9. `createdTime`
10. `modifiedTime`
11. `firstDetectedAt`
12. `lastDetectedAt`
13. `lastDownloadedAt`
14. `lastImportAttemptAt`
15. `lastImportedAt`
16. `status`
17. `retryCount`
18. `nextRetryAt`
19. `lastErrorCode`
20. `lastErrorMessage`
21. `importSourceId`
22. `importDataType`
23. `metricHint`
24. `lastImportBatchId`
25. `lastSuccessfulImportBatchId`

`storeId`はImportSource/mappingから再解決できるためMVPでは省略候補、`isTrashed`/`lastSeenAt`は監査上有用だが初回Vertical Sliceでは後続migrationへ回せる。`createdAt`/`updatedAt`は標準監査列として保持する場合、上記25に加えて2列となる。最終的な本番Modelは「25運用field + 2監査timestamp」を推奨する。

### Future fields/models

- `storeId`のState側cache
- `isTrashed`、`lastSeenAt`（長期監査が必要になった時点）
- lease owner/expiry（advisory lock採用時は必須でない）
- Drive revision、change token
- `DriveImportAttempt`
- State event/audit table

## Status Simplification

### Recommended status: 9

H4の10状態から、`DOWNLOADED`を`READY`へ統合し、`IGNORED`は運用イベントとしてFutureへ回す。一方、Folder移動や店舗変更を安全に止めるため`REVIEW_REQUIRED`はMVPでも独立状態として残す。MVPの正本は次の9状態とする。

| Status | Role |
|---|---|
| `DETECTED` | 新規/再評価候補 |
| `DOWNLOADING` | Download lease中 |
| `READY` | Download・一次検証完了、Dispatcher待ち |
| `IMPORTING` | Dispatcher/既存Batch処理中 |
| `IMPORTED` | 最新内容のImport成功 |
| `FAILED_RETRYABLE` | backoff後に再実行可能 |
| `FAILED_FINAL` | 自動Retry停止、手動Review |
| `UNMAPPED` | Folder未登録/設定未解決 |
| `REVIEW_REQUIRED` | Folder移動、店舗変更、設定変更など自動継続禁止 |

`IGNORED`は`ignoredAt`/reasonまたは運用イベントとしてFutureへ回す。`DUPLICATE`、`PREVIEW_READY`、`QUARANTINED`、`RETRY_WAITING`はImportBatch/エラー分類/`nextRetryAt`で表現し、Drive Stateへ追加しない。

## Duplicate / Idempotency Review

役割を次のように固定する。

| Key | Canonical responsibility |
|---|---|
| `driveFileId` | Drive実体の追跡・rename吸収・Folder移動検知 |
| `modifiedTime` | 同一Fileの再取得候補判定 |
| Drive `md5Checksum` | API metadataの補助値。未提供を許容 |
| Download SHA-256 | 実バイト列の同一性とDownload検証 |
| `ImportBatch.fileHash` | 既存Pipelineの完了Batch重複/idempotency |
| DB natural unique/upsert | 各fact tableの最終整合性 |

同一`driveFileId`かつ`modifiedTime` unchangedは再Downloadしない。同じSHAでも別Folder/店舗なら自動統合しない。別File IDの同一SHAは既存ImportBatchの媒体・店舗・dataType・対象期間条件で重複判定する。Drive StateはImport idempotencyを二重実装しない。

## Lock Recommendation

**Phase H v1はPostgreSQL advisory lockを採用する。**

理由：

- 既存PostgreSQLがProductionの正本で、新規Redis/worker基盤を追加しない。
- `driveFileId`、`folderId + dataType + period`をhashしたtransaction-scoped lockで同一処理を排他できる。
- statusだけのlockは並行Schedulerに弱い。
- row lockだけでは、Download中の長い外部I/Oをtransactionに保持しにくい。
- advisory lockなら外部I/Oをtransaction外に置き、claim後のlease/timeoutで回復できる。

同時に、ImportBatchの既存SHA重複確認前後も同じtransactionでadvisory lockを取得する。lock取得失敗は成功扱いにせず、次回poll対象とする。

## Scheduler Recommendation

**Phase H v1は、既存Production cronから起動するone-shot CLI pollingを採用する。**

理由：VPS/Docker/cronが既に運用され、long-running worker、queue、Redis、watch tokenを追加しないためである。1 tickは一覧→claim→Download→Dispatcher→State更新までを行い、同時起動はadvisory lockで止める。

- systemd timer：VPS運用依存を増やすためFuture。
- 常駐worker：監視・再起動・memory管理が必要なためFuture。
- queue/worker：Redis等の追加障害点があるためFuture。
- Drive push/watch：再同期とtoken期限管理が必要なためFuture。

cron実行はPhase H v1の検証・preview-onlyが安定してから有効化する。

## Auto-confirm Matrix

| Source | Classification | Conditions |
|---|---|---|
| CTI CAST_REPORT | `MANUAL REVIEW` | 3店舗sheet、期間、必須列、Alias/Cast解決、警告をPreviewで確認。sheet欠損/未解決は自動確定しない |
| Town STORE | `AUTO` (条件付き) | Folder/store、外部店舗ID、期間、必須列、SHA重複、Validationが全PASS。WarningsはReview |
| Town CAST | `MANUAL REVIEW` | Alias未紐付け・曖昧Castがあり得る。全行resolved時のみ将来AUTO再評価 |
| Town URL | `MANUAL REVIEW` | URL内店舗/Cast検証と対象期間が必要。Optionalのためv1対象外 |
| Town LANDING | `MANUAL REVIEW` | LP/店舗/期間検証。Optionalのためv1対象外 |
| Heaven SHOP | `AUTO` (条件付き) | Kasukabe固定、ヘッダー/期間/日付/metric検証、重複なし、Validation PASS |
| Heaven Girl PAGE_ACCESS/DIARY_POSTS | `MANUAL REVIEW` initially | metricHintとCast解決をFolder ID/Previewで照合。運用実績確認後に条件付きAUTO |
| Heaven Girl MY_GIRL | `MANUAL REVIEW` | 累計snapshotの初回、前日欠測、リセット、差分nullを自動推測しない |
| Heaven Girl MITENE/TALK | `MANUAL REVIEW` | OptionalかつmetricHint/未紐付けを確認。v1対象外 |
| Heaven通知2種 | `BLOCKED` | 実ファイル意味・リセット規則未確定。Future |

`AUTO`は「無条件でconfirm」ではなく、Preview結果が全て決定的に安全な場合だけを意味する。`MANUAL REVIEW`ではPreview/Confirm画面または管理CLIの明示確認を必須にする。Alias unresolved、期間不一致、店舗不一致、MISSINGを0補完するケースは全SourceでBLOCKする。

## Failure / Retry Matrix

| Category | Classification | Owner | Action |
|---|---|---|---|
| `AUTH` | Final/Review | Operator | credential修復後に手動再開 |
| `PERMISSION` | Review | Operator | Folder共有修正、再scan |
| `FOLDER_NOT_FOUND` | Final | Mapping admin | `UNMAPPED`、自動Import停止 |
| `FILE_NOT_FOUND`/Trash | Terminal | Adapter/State | State保持、再出現時再評価 |
| `DOWNLOAD` | Retryable | Scheduler | backoff有限Retry |
| `CHECKSUM` | Final | Adapter/Operator | 原本差替え確認、再取得 |
| `VALIDATION` | Final/Review | Existing Pipeline | ImportError/Preview、手動修正 |
| `IMPORT` | Batch-defined | Existing Pipeline | ImportBatchを正とする |
| `TRANSIENT_API` | Retryable | Scheduler | jitter付きRetry |
| `RATE_LIMIT` | Retryable | Scheduler | Retry-After尊重 |
| `DISK` | Retryable after fix | Operator/Scheduler | temp cleanup/容量確認 |
| `UNKNOWN` | Retry then Final | Scheduler | 最大回数後Manual Review |

AdapterはRetryせず、Schedulerがbackoffを持つ。Import validationは既存ImportBatch/ImportErrorに記録し、Drive Stateは参照ポインタだけ更新する。

## Quarantine Review

Phase H v1でDrive Error Folderへ自動移動しない方針は妥当である。理由は、Viewer権限でWrite操作を禁止できること、移動がFolder mappingを変え、同じFileの再検知・重複判定を複雑にすること、原本の監査証跡を維持できることにある。

v1では`FAILED_FINAL`、`UNMAPPED`、必要なら`REVIEW_REQUIRED`を論理Quarantineとする。管理者が原因修正後に手動Resetし、元Folderの同じFileを再評価する。Error Folder移動はWrite scope・運用手順・復帰仕様を別途承認したFutureとする。

## Observability

### Required v1 audit

- scan開始/終了、最終成功scan時刻
- 対象Folder数、Folder取得失敗数
- files detected / changed / skipped / ignored
- download成功/失敗、checksum不一致
- dispatch件数、ImportBatch作成件数
- imported / duplicate / manual review / unmapped
- retry pending、failed retryable、failed final
- 最終成功File時刻、処理時間、API quota/429
- `driveFileId`、Folder mapping key、state status、Batch ID、error code

### UI decision

v1は新規UIを作らず、構造化CLIログと既存Import履歴/ImportErrorで十分とする。運用開始後に未処理・FAILED_FINAL・mapping変更の確認頻度を測り、H8で管理画面を判断する。

## Security Review

- `drive.readonly`のみ。Write scope不使用。
- Service AccountはProduction専用、Developmentと分離。
- 親Folder Viewer共有、最小Folder範囲。
- JSON private keyはGit/DB/backup/logに含めず、Docker read-only mount。
- Secret値、Authorization header、download URL queryをログ・healthへ出さない。
- Drive Folder IDは設定正だが公開ログへ平文出力しない。
- credential不在時もManual Import/Analyticsを維持する安全側を採用。
- backup/restore、nginx、driver-managementへ影響させない。

## Production Impact

| Area | Impact | Rule |
|---|---|---|
| `docker-compose.production.yml` | credential read-only mount、将来one-shot CLI | 既存db volume/network/portを変更しない |
| deploy script | migration/config validationを既存手順に追加 | Drive secretの生成・上書き・削除をしない |
| scheduler | cronからCLI起動 | app/dbの再作成や`down`を行わない |
| DB migration | Drive State/Mapping table追加 | additive only、既存table変更なし |
| backup | 新tableもpg_dump対象 | 既存custom dump/restoreと互換 |
| rollback | 新tableを旧Appが無視できる設計 | 自動rollbackしない、停止/手動判断 |
| nginx/UFW | 外部公開不要 | Drive APIはapp outboundのみ |

H9では、migration deploy前にProduction backup、staging/preview、health、manual rollback手順を確認する。旧Appは新tableを参照しないため、additive migration後も起動できるが、旧Appで作成されたDrive Stateは存在しない状態として扱う。

## Migration Strategy

1. `DriveFolderMapping`と`DriveFileState`を新規tableとして追加する。
2. 既存`ImportSource`、`ImportBatch`、fact tableは変更しない。
3. nullable FKまたは参照なしのBatch pointerから開始し、既存Batchに強制FKを追加しない。
4. indexはunique `driveFileId`とScheduler/Folder用複合indexだけに限定する。
5. migrationはadditiveで、既存Production DBのデータ移行を要求しない。
6. 旧Appが新tableを無視して起動できることを確認する。
7. 失敗時はdeploy scriptの自動rollbackに頼らず、backupから手動判断する。

バックフィルは行わない。Drive Stateの初回scanで`firstDetectedAt`を設定し、過去のImportBatchを推測してlastImportedAtへ埋めない。

## Final Implementation Order

実装順序を次のとおり正式化する。

| Step | Scope | Gate |
|---:|---|---|
| H1 | 既存Import/Folder/安全境界のDocumentation freeze | 本レビュー承認 |
| H2 | Development専用Service Account、Connection Test、Secret read-only | Production credential未使用 |
| H3 | DriveClient/Adapter、Folder scan、metadata、Download、SHA | DB/Import未接続 |
| H4 | DriveFolderMapping設定、Dispatcher dry-run | 未登録/将来Folderを停止 |
| H5 | DriveFileState additive migration、state transition | rollback/旧App互換確認 |
| H6 | Required FolderのみManual CLI、preview-only | 8 Folderの検知/一覧一致 |
| H7 | Dispatcher→既存Preview/Validation、Batch参照 | Auto-confirm禁止 |
| H8 | advisory lock、cron one-shot、有限Retry | 重複/lease/障害テスト |
| H9 | Source別条件付きAuto-confirm、Production段階導入、Monitoring | 手動ゲート承認 |

最初からScheduler、通知、UI、Archive/Error移動、Optional/Future metricsを作らない。

## Phase H v1 MVP Scope

### Include

- Development専用Service Account + read-only Connection Test
- Required 8 FolderのFolder ID mapping
- Drive直下File list、metadata、Download、SHA-256
- preview-only CLI trigger
- `DriveFileState`の最小状態記録（DB migration後）
- 未登録Folder、MIME不一致、checksum不一致、Kasukabe以外Heavenの停止
- 既存Import ServiceへのDispatcher dry-run
- 構造化監査CLIログ

### Exclude

- Production自動confirm
- Optional Town URL/LP、Heaven MyGirl/Mitene/Talk
- Heaven通知2種
- Archive/Error Folder自動移動
- 管理画面、通知、Drive push/watch
- 常駐worker、queue、Redis
- `DriveImportAttempt`、State event table
- 自動rollback、DB reset、seed

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| CTI 3sheet欠損/partial | High | preview-only、全sheet検証、Manual Review |
| Town CAST Alias unresolved | High | AUTO禁止、既存Alias resolverへ委譲 |
| Heaven snapshot reset | High | MyGirl/通知をManual Review/Future |
| 同日別SHA修正版 | High | ImportBatch idempotencyとManual Review |
| Folder誤移動 | High | mapping変更をReview、店舗変更自動Import禁止 |
| Service Account key漏洩 | High | read-only scope、600、分離、rotation |
| Scheduler二重起動 | High | advisory lock、one-shot、監査 |
| temp disk full | Medium | size validation、cleanup、disk監視 |
| Drive quota/429 | Medium | Scheduler側backoff、有限Retry |
| State schema過剰 | Medium | 25 field MVP、Attempt/Future分離 |

## Required Decisions Before Coding

実装開始前に次の**7件**を承認する。

1. H4の10状態を整理した9状態（`REVIEW_REQUIRED`を含む）を正本にする。
2. PostgreSQL advisory lockとlock key/timeoutを確定する。
3. cron one-shot CLIと実行間隔、ログ/同時実行防止を確定する。
4. Drive StateのMVP field、`storeId`/`isTrashed`/`lastSeenAt`を初回migrationに含めるか決める。
5. Source別Auto-confirm matrixと、Preview warning時の停止条件を承認する。
6. 8 Required Folderの実Folder ID、Development/Production credential分離を登録する。
7. Dispatcherの既存Preview Service入力契約と、Batch metadataへのDrive provenance項目を確定する。

## Open Questions

- Required Folderを初回から全8件監視するか、CTI/Town STORE/Heaven SHOPのさらに小さいSmoke Sliceから始めるか。
- `IGNORED`をstatusとして追加するか、運用イベントで表現するか。
- `storeId`をDriveFileStateへcacheするか、毎回Mapping/ImportSourceから解決するか。
- Auto-confirmの管理者overrideと監査記録のUI/CLI方式。
- State/MappingのRetain期間、Soft delete、将来のDrive Changes API。
- 429/5xx時の最大Retry回数、backoff、通知閾値。
- Productionでcredential不在時にwarning起動とするか、Automation containerだけfailとするか。

## Implementation Readiness

**READY WITH CONDITIONS**。

### Ready

- Architecture boundaryは一致。
- Folder ID、Heaven Kasukabe固定、同名`tokeiGirl`のmetricHint方式は一致。
- H2 read-only Service Account方式はProduction hardeningと互換。
- Adapterと既存Import Pipelineの責務は重複しない。
- additive migrationで旧Appを壊さずにState/Mappingを追加できる。

### Conditions

- Required Decisionsの7件を承認すること。
- MVPは8 Required Folder、preview-only、手動確認から開始すること。
- advisory lock、cron one-shot、状態enumを実装前に固定すること。
- Auto-confirmはTown STORE/Heaven SHOP等の決定的ケースに限定し、Alias/snapshot/通知系は自動確定しないこと。
- Productionへ展開する前にDevelopment実Folderで接続・Download・Parser回帰・backup互換を通すこと。

条件承認後はH2→H3→H4 dry-runの順で実装を開始できる。条件未承認のままScheduler、Auto-confirm、Production credentialの実装へ進むことは禁止する。

## Review Conclusion

Phase Hの設計は実装不能ではないが、現在は「設計完了」ではなく「安全な縦切り実装の準備完了」に近い。上記7決定事項を固定し、Required Folderのpreview-onlyで実データを壊さずに検証してから、State migrationと条件付きAuto-confirmを段階投入するのが最も安全である。

本レビューはMarkdownのみを追加し、コード、DB、Prisma、Docker、Script、設定を変更しない。
