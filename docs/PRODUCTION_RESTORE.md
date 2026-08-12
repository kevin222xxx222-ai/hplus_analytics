# Production PostgreSQL restore

Restoreは既存データを破壊する操作です。対象はHPlus Analyticsのproduction Compose DBだけであり、既存driver-management、ホストPostgreSQL、nginx、その他のvolumeには触れません。

## 実行例

```bash
cd /opt/hplus-analytics
./scripts/restore-production.sh backups/hplus_analytics_20260812_211956.dump
```

必須条件:

- `.env.production`と`docker-compose.production.yml`が存在すること
- `.dump`ファイルと対応する`.dump.sha256`が存在すること
- DBコンテナが起動中かつhealthyであること
- checksumと`pg_restore -l`の事前検証に成功すること

checksumがない場合は安全のためRestoreを開始しません。Restore前に対象DB、dump名・サイズ・timestamp、現在DBサイズを表示し、ユーザーが`RESTORE`と完全入力した場合だけ続行します。

## 処理内容

1. 既存appを停止（DBは稼働維持）
2. `scripts/backup-production.sh`でpre-restore backupを作成
3. `public` schemaをdrop/create
4. custom format dumpを`pg_restore --exit-on-error --no-owner --no-privileges`で復元
5. public table数と`_prisma_migrations`を確認
6. `prisma migrate status`を確認
7. appを再起動
8. DB/app statusと`/api/health`（HTTP 200、database=connected）を確認

`docker compose down`、volume削除、DB reset系Prisma command、seed、migration生成、自動rollbackは行いません。

## 失敗時

失敗段階、pre-restore backup path、対象dump pathを表示して停止します。自動rollbackは行いません。pre-restore backupを使った復旧は、DB状態とエラー内容を確認したうえで手動判断してください。Restore途中で失敗した場合、appが停止状態のままになるため、再起動や復旧は手動runbookに従って実施します。

## Restore後の手動確認

- DBコンテナがhealthyであること
- appコンテナがrunningであること
- `/api/health`がHTTP 200かつ`database=connected`であること
- `npx prisma migrate status`がup to dateであること
- Data Health、Store Analytics、Cast Analyticsを読み取り確認すること
- 最新business date、ImportBatch、Availability、主要row countを復元前と照合すること
- 必要に応じて隔離DBへ同じdumpをrestoreし、FK/uniqueと代表画面を確認すること

RestoreファイルとchecksumはGit管理しません。秘密情報はこの文書へ記載しません。
