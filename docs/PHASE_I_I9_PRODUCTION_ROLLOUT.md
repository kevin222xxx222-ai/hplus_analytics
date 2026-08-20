# Phase I I9 — Production Rollout / Operations Hardening

## 目的と適用範囲

I9は新しいImport business logicを追加せず、Phase H〜IのGoogle Drive Automationを安全に継続運用するためのProduction運用仕様を固定する。Production変更・cron登録・Gate変更は本書作成時には実施しない。

## 現在のProduction運用

- Drive polling: `*/10 * * * *`
- 実行: `docker exec hplus-analytics-app npm run drive:poll-once`
- `GOOGLE_DRIVE_AUTOMATION_ENABLED=true`
- AUTO PreviewはGlobal Gateとper-route allowlistの両方が必要
- AUTO Confirmは常にOFF
- CTI/TownはAUTO Preview対象外、Manual Executeのみ
- poll log: `/var/log/hplus-drive-poll.log`（推奨permission: `600`）

### Heaven累計ファイル

月次累計CSVは月ごとに同一Drive File IDを維持して上書きする。旧版を同じMapping Folderへ別名で残さない。保管が必要な旧版はAutomation対象外のArchive Folderへ手動移動する（Archive自動化はI9対象外）。

同一SHAのCompleted BatchはNOOP、新Batch・fact rewrite・Reviewを作らない。内容変更時は`IMPORTED → DETECTED → DOWNLOADING → READY → AUTO Preview → REVIEW_REQUIRED`、Confirm成功後にのみ新Batchをsuccessfulとして同期する。

## Archive運用

### CTI / Town

- Confirm完了・`IMPORTED`後の元ファイルは削除せず、監査のため保持・Archiveを推奨する。
- Archive先はGoogle Drive AutomationのMapping対象外Folderとする。
- 同一Mapping Folder内に旧版を別名保存しない。
- DBへ確定済みのfactは、Drive Fileの移動・削除によって削除されない。

### Heaven

- 当月の累計CSVはMapping Folderに残す。
- 月ごとに同一Drive File IDを維持して上書き更新する。
- 当月中はArchiveしない。
- 月替わり後、前月ファイルはMapping対象外のArchive Folderへ手動移動できる。
- 旧版を同一Mapping Folderへ別名保存しない。

Archive Folderの作成・ファイル移動はPhase Iでは自動化せず、Operatorによる手動運用とする。

## AUTO Preview段階解放

| Stage | `GOOGLE_DRIVE_AUTO_EXECUTION_ROUTES` | 状態 |
|---|---|---|
| 1 | `HEAVEN_SHOP` | Production Verified |
| 2 | `HEAVEN_SHOP,HEAVEN_GIRL_ACCESS` | Production Verified |
| 3 | `HEAVEN_SHOP,HEAVEN_GIRL_ACCESS,HEAVEN_GIRL_DIARY` | Production Verified |

各Stageは1 Fileで`AUTO Preview → REVIEW_REQUIRED → Manual Confirm → IMPORTED`を確認してから次へ進む。AUTO Confirm、CTI/Town AUTO解放、cron頻度変更は行わない。

## Emergency Stop

1. まず`GOOGLE_DRIVE_AUTO_EXECUTION_ENABLED=false`へ変更し、appを再作成してAUTO Previewだけを停止する。
2. scan/download/state trackingも停止する場合のみ`GOOGLE_DRIVE_AUTOMATION_ENABLED=false`を設定する。
3. cron削除を第一手段にしない。設定反映後にpoll logとhealthを確認する。

Production環境変数の実変更はOperator承認の手順で行い、本書の作成・更新では実施しない。

## Rollback / Emergency Recovery

- Code rollbackは既知のGit tag/commitへ戻し、`docker compose build app`後に`docker compose up -d --no-deps app`とする。
- `docker compose down`、volume削除、DB resetは禁止。
- I9では新規Migrationは作成しない。DB migration rollbackは原則行わない。
- 誤Import時はImportBatch/importBatchIdとfact影響範囲を監査して個別対応する。自動削除・自動rollbackは行わない。

## Operator Recovery

`npm run drive:reset-state -- --drive-file-id=<id> --to=READY --confirm-production`は、Batch未紐付けの`REVIEW_REQUIRED`だけに使用する。Mappingがactiveかつ非future、未trashed、SHAありであることを確認する。

Batch紐付け済みReview、`IMPORTED`、`FAILED_FINAL`のreset、SQL直接更新、`forceDuplicate`は禁止する。

## Failure Matrix

| State | 意味 | 自動再試行 | Operator action | Review URL | Reset |
|---|---|---:|---|---|---|
| DETECTED | 新規/変更File検知 | 次poll | logとMapping確認 | なし | 通常不要 |
| DOWNLOADING | download中 | retry policy | 長時間ならlog確認 | なし | 不要 |
| READY | download/SHA検証済み | poll/execute候補 | AUTO/Manual方針確認 | なし | 不要 |
| IMPORTING | Preview処理中 | retry policy | 二重実行せずlock確認 | なし | 不要 |
| REVIEW_REQUIRED | Preview後、人手確認待ち | なし | 既存Review UIで確認/Confirm | あり | BatchなしのみREADY |
| IMPORTED | Confirm成功済み | 変更検知時のみ | Batchと実績を監査 | なし | 禁止 |
| FAILED_RETRYABLE | 一時失敗 | `nextRetryAt`以降 | log/error確認 | なし | 通常不要 |
| FAILED_FINAL | 恒久失敗 | なし | Operator調査・手動復旧 | なし | 禁止 |
| UNMAPPED | Mapping不備 | なし | Mappingを修正し再検知 | なし | 不要 |

## Idempotency / Lock

Drive idempotencyは次を併用する。

- `driveFileId`
- `driveModifiedTime`
- download後SHA-256
- ImportBatch `fileHash`
- driveFileId advisory lock
- fact table natural-key upsert

同一SHAかつCompleted BatchはNOOP。新しい内容は新Preview Batchを作る。Confirm成功までは`lastSuccessfulImportBatchId`を旧成功Batchのまま維持し、Preview作成時は`lastImportBatchId`だけを更新する。

## Logs / Daily Check

最低限、毎日次を確認する。

```bash
tail -50 /var/log/hplus-drive-poll.log
docker compose ps
curl -fsS http://127.0.0.1:3001/api/health
```

poll logでは`mappings`, `filesSeen`, `downloaded`, `skipped`, `retryPending`, `reviewRequired`, `failed`に加え、`autoExecutionEnabled`, `autoExecutionRoutes`, `autoAttempted`, `autoPreviewCreated`, `autoExecuted`, `autoReviewRequired`, `autoReused`, `autoNoop`, `autoFailed`, `autoBlocked`を確認する。外部通知・SLOはI9対象外。

## Cron / Backup relation

- Drive polling: 10分ごと
- DB backup: 03:00
- backup retention: 04:00

cronは今回変更しない。DB backupにはDrive credential、Service Account JSON、`.env.production`を含めない。Backup/restoreは既存Production Hardening手順を使用する。

## Security / Deployment Checklist

Deploy前に以下を確認する。

- git status clean、`git pull --ff-only`
- 対象commitとbackupを確認
- `docker compose config`、image build、healthを確認
- credentialはread-only mountで、imageへCOPYされていない
- `APP_ORIGIN`、Automation Gate、route allowlistを確認
- System Actorはinactive VIEWER、AUTO Confirm/`forceDuplicate`なし
- cronとpoll logを確認
- Migration変更がないDeployでは不要な`migrate deploy`を毎回実行しない

## I10 Final Canary / Phase I completion

I10総合Canaryで、Town春日部/越谷のSTORE/CAST、CTI、Heaven SHOP/PAGE_ACCESS/DIARY_POSTSの全8 Mappingを確認済み。poll実績は`mappings=8`、`filesSeen=62`、`downloaded=37`、`skipped=25`、`reviewRequired=34`、`failed=0`、`autoNoop=3`だった。

Phase I COMPLETE条件は充足済みである。I1〜I10 COMPLETE、8 Mapping Production VERIFIED、10分cron安定、Manual Confirmのみ、failure/recovery runbook、Emergency Stop、Rollback、Security、Backup、Logs、Production Healthを確認済みとする。

## Status

I9 **COMPLETE / Production VERIFIED**。Productionへのcron頻度変更・新規cron登録・DB変更は行っていない。
