# Phase I Import Execution Gate Architecture

## 1. 目的と境界

Phase H v1のProduction自動化は、Google Drive scan、detection、download、SHA-256、DriveFileState、Dispatcher `RESOLVE_ONLY`までである。Phase IはREADY Fileを既存Import Pipelineへ渡すExecution Gateを設計するが、最初からAUTO Importを解放しない。

初期設計対象はCTI `CTI_CAST_REPORT`の手動Execution Vertical Sliceだった。現在はI5 Town STORE Manual Executeまで実装・Production Canary検証済みである。AUTO Importの解放、DB schema、Prisma、Migration、Docker、Compose、Production cronの自動Execute化は引き続き対象外である。

## 2. 設計原則

- 既存CTI parser、resolver、importer、ImportBatch作成を唯一の正とする。
- Dispatcherはroute/policyと状態制御だけを担い、XLSX解析やfact table writeを行わない。
- Production cronは常に`RESOLVE_ONLY`固定。`EXECUTE`はDevelopment/管理者が明示する手動CLIだけにする。
- AUTO confirm、ImportBatch自動作成、実績への自動確定はPhase I initial sliceで禁止する。
- File単位のPostgreSQL advisory lockを、Execution開始から状態更新まで継続利用する。
- 失敗時は既存Retry分類とDriveFileStateを使い、暗黙の再実行や自動rollbackを行わない。

## 3. Execution Mode

| Mode | 使用場所 | 動作 |
|---|---|---|
| `RESOLVE_ONLY` | Production cron、現行poll | Mapping/route/policyを解決し、Import未実行 |
| `EXECUTE` | Phase I手動CLIのみ | READYのFileを既存PipelineのPreview入口へ渡す。I3 CTI/I5 Town STOREで検証済み |

`EXECUTE`でもCTI policyは`MANUAL_REVIEW`である。したがってExecutorはPreview Batchを作成した時点で停止し、Confirm APIを呼ばない。

## 4. CTI Vertical Slice flow

```text
手動CLI
  ↓ driveFileIdを指定
DriveFileState取得 + status=READY確認
  ↓ driveFileId advisory lock
既存Download/一時File（必要時のみ）
  ↓ Drive由来metadataを付けた薄いFile adapter
既存 createCtiPreview()
  ↓ 既存parser / resolver / ImportError / Preview JSON
ImportBatch = PREVIEW_READY または WAITING_FOR_CAST_LINK
  ↓ Dispatcher結果 REVIEW_REQUIRED
DriveFileState = REVIEW_REQUIRED
  ↓ 既存 /imports/[id] でCast解決・Preview確認
人が既存Confirm操作（I4以降）
  ↓ 成功後の明示的state同期
DriveFileState = IMPORTED候補
```

Initial sliceでは最後のConfirmと`IMPORTED`遷移を自動で行わない。CLIはBatch ID、既存レビューURL、review reason、Import未実行を表示する。

## 5. Dispatcher EXECUTEの推奨接続先

H6の`executePipeline` callbackを維持し、CTI専用adapterを別serviceとして実装する。概念的な責務は次の通り。

1. `DriveImportFile.localPath`を読み、既存のCTI `File`入力へ変換する。
2. Mappingの`importSourceId`、`CTI_CAST_REPORT`、日次対象期間、Drive metadataをmetadataへ渡す。
3. `createCtiPreview()`を呼び、返却Batch ID/statusを`PipelineExecutionResult`へ変換する。
4. `confirmCtiImport()`、独自parser、独自ImportBatch作成は呼ばない。

既存Serviceが`File`を要求するため、最小のadapterはNodeの`File`または既存storageを介した入力変換に限定する。Drive Fileの再Downloadは既存download/temporary storageを再利用し、scanのcleanupより前に実行する。

## 6. DriveFileState遷移

### Initial slice

```text
READY
  → IMPORTING（Execution開始のclaim）
  → REVIEW_REQUIRED（Preview Batch作成済み、Confirm待ち）
```

### Failure

```text
IMPORTING → FAILED_RETRYABLE（Drive/API/一時障害）
IMPORTING → FAILED_FINAL（恒久的な入力/設定障害）
```

Preview Batch作成後の`REVIEW_REQUIRED`は「Import成功」ではない。`lastImportBatchId`にはレビュー対象Batch IDを記録してよいが、`lastSuccessfulImportBatchId`と`lastImportedAt`は更新しない。Confirm成功を既存Batchの`COMPLETED`または`COMPLETED_WITH_WARNINGS`で確認した後だけ、明示的同期処理が`lastSuccessfulImportBatchId`と`lastImportedAt`を更新する。

将来AUTO対象で全ValidationがPASSした場合のみ、別Decisionで`IMPORTING → IMPORTED`を許可する。CTI initial sliceでは直接遷移させない。

## 7. Manual Review設計

既存`/imports/[id]`を正本画面として再利用する。I3では新しいレビューUIを作らず、次を出力する。

- ImportBatch ID
- `/imports/{batchId}`のレビュー先
- `REVIEW_REQUIRED`理由（CTI manual policy、未紐付け、warning/error）
- Drive由来であること（file IDは監査用に限定し、secretは表示しない）
- `import=NOT_EXECUTED`

I4ではBatch詳細画面にDrive metadataと「Drive File Stateへ戻る」関連を追加するか評価する。既存のCast解決、Reparse、Confirm操作は変更せず、Confirm後にDrive Stateを同期するサーバー側処理を追加する。Confirm APIからDrive File IDを信頼できるmetadataとして取得し、同じadvisory lockを再取得して状態を更新する。

## 8. ImportBatch relation

schema変更なしで、Preview Batchの`metadata`に次を保存する案を正式採用候補とする。

```json
{
  "origin": "GOOGLE_DRIVE",
  "driveFileId": "<redacted in docs/logs>",
  "driveModifiedTime": "<timestamp>",
  "driveSha256": "<sha256>",
  "driveFileStateId": "<uuid>",
  "executionMode": "EXECUTE",
  "reviewRequired": true
}
```

実装時は既存metadataを保持してmergeする。`lastImportBatchId`は直近のPreview/Attempt Batch、`lastSuccessfulImportBatchId`は確定済み実績を反映したBatchだけ、と定義する。

## 9. Idempotency and duplicate protection

Execution開始前に、同一Drive Stateについて次を順に確認する。

1. `driveFileId` advisory lockを取得できなければSKIP。
2. Stateの`status`がREADYでなければ実行しない。
3. `driveFileId + driveModifiedTime + sha256`が同一の既存Drive metadata/Batchを検索し、Preview済み・レビュー待ちなら既存Batchへ誘導する。
4. 同一SHAの既存完了Batchがある場合は、CTI既存仕様のduplicate warning/明示再処理を尊重する。Gateが`forceDuplicate`を自動指定してはならない。
5. 事実確定は既存`ctiCastDaily`の自然キーupsertに委譲する。

DriveFileStateだけを唯一の排他根拠にしない。Stateのstatus更新、ImportBatch metadata、既存fileHash制御、fact upsertを組み合わせる。

## 10. Production safety

- Production cronは`RESOLVE_ONLY`のみ。環境変数を変更してEXECUTEにしない。
- `GOOGLE_DRIVE_AUTOMATION_ENABLED=true`でもImportを意味しない。H9のDispatcher policy境界を維持する。
- 手動CLIはProduction credential/Folderを既定対象にせず、明示的な安全確認を要求する。
- ImportBatch、fact table、Drive Stateを跨ぐ処理で失敗した場合、自動rollbackやschema resetを行わない。
- Import実行結果、Batch ID、状態、理由を監査ログへ残す。秘密値、XLSX内容、Folder IDはログへ出さない。

## 11. Proposed implementation order

| Phase | 内容 | Gate |
|---|---|---|
| I1 | Existing Pipeline Audit | 本書監査、入口と境界をレビュー |
| I2 | Execution Decision Record | CTI manual policy、state/Batch意味、禁止事項を承認 |
| I3 | CTI manual execute CLI | DevelopmentでREADY 1件、Preview Batch生成、Import未実行 |
| I4 | CTI Manual Review integration | `/imports/[id]`でDrive由来Batchを確認し、Confirm後に明示同期 |
| I5 | Town STORE execute | AUTO候補だが別承認、まずManual gateで検証 |
| I6 | Heaven SHOP execute | 春日部固定・validation・duplicateを検証 |
| I7 | MANUAL_REVIEW sources | Town CAST、Heaven Girlを順次接続 |
| I8 | AUTO execution gate | Source別条件、監査、kill switch、rollback手順を承認 |
| I9 | Production rollout | canary、cron RESOLVE_ONLY維持、段階的解放 |

I3からI7まではProduction cronを変更しない。I8でAUTO解放が承認されない限り、ProductionはH9のRESOLVE_ONLYへ戻せる。

## 11A. Current Phase I status

| Phase | Status |
|---|---|
| I1 Existing Pipeline Audit | COMPLETE |
| I2 Import Execution Decision Record | COMPLETE |
| I3 CTI Manual Execute | COMPLETE / Development VERIFIED |
| I4 CTI Manual Review + Post-Confirm Sync | COMPLETE / Development VERIFIED |
| I5 Town STORE Manual Execute | COMPLETE / Production Canary VERIFIED |
| I6 Heaven SHOP | IMPLEMENTED / Development manual execute pending verification |
| I7 MANUAL_REVIEW系 | NOT STARTED |
| I8 AUTO Execution Gate | NOT STARTED |
| I9 Production Rollout | NOT STARTED |

### I5 production evidence

春日部 `TOWN_STORE`の`dto.jp-shop-20260818_to_20260818.csv`を対象日2026-08-18で実行し、`READY → REVIEW_REQUIRED → IMPORTED`、ImportBatch `COMPLETED`、`town_store_daily` 1件、Drive Stateのsuccessful Batch同期を確認済み。Production cronはRESOLVE_ONLYのままである。

### I6 implementation note

Heaven SHOPは既存の`createHeavenPreview()` / `confirmHeavenImport()`と`heavenShopDaily` upsertを再利用する手動CLIを追加した。CSVから既存parserが決定するsourcePeriodを使用し、`READY → IMPORTING → REVIEW_REQUIRED`で停止する。Confirm後は既存Drive synchronizerで`IMPORTED`へ同期する。Production cron、AUTO Import、AUTO Confirmは変更しない。

## 12. Open Questions

1. Drive由来Batchの`uploadedByUserId`をNULLのsystem actorとするか、既存の監査用system userを使うか。
2. `createCtiPreview()`へ渡すCTI対象日付を、ファイル名・XLSX内日付・Drive metadataのどれから確定するか。推測で補完しないルールが必要。
3. 3店舗シートの期間が一致しない場合、Previewを作成してReviewへ止めるか、Gate前にBLOCKするか。
4. `COMPLETED_WITH_WARNINGS`をDrive Stateのsuccessfulと扱うか。initial sliceでは、Confirm完了をsuccessfulとし、warningは監査表示する案が安全。
5. Confirm API後のDrive State同期を同一transactionで行えない場合の再試行・不整合検知方法。
6. 既存Batch metadataへのDrive identity追加を正式採用するか。schema変更なしで十分かをI2で確定する。
7. CTIの部分取込をDrive Executionで許可するか。initial sliceではManual Reviewで明示操作するまで確定しない案を推奨。
8. ProductionでI9へ進む際のcanary対象、停止手順、監視SLO、通知先。

## 13. Non-goals

- CTI parser/XLSX解析の複製
- 独自ImportBatch作成
- Analytics fact tableへの直接write
- cronからのEXECUTE
- 自動Confirm、AUTO policy解放
- DB schema、Prisma migration、Production Compose変更
