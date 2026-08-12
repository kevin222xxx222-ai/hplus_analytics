# Production backup automation

毎日のPostgreSQLバックアップと、古いバックアップの整理をVPS上で定期実行する運用例です。本番cronへの登録は手動で行い、今回の実装では登録・実削除を行いません。

## 保持方針

- デフォルト保持期間: 14日
- 環境変数`BACKUP_RETENTION_DAYS`またはスクリプト引数で変更可能（1以上の整数のみ）
- 対象: `backups/`直下の`hplus_analytics_*.dump`、`hplus_analytics_*.dump.sha256`
- 対象外: 14日以内のファイル、他の名前、ディレクトリ、backups配下のサブディレクトリ
- 最新dumpは保持期間を過ぎても誤削除防止のため保持

## 推奨cron

毎日03:00にバックアップ、04:00に保持処理を実行する例です。`--apply`がある場合だけ削除されます。

```cron
0 3 * * * cd /opt/hplus-analytics && ./scripts/backup-production.sh >> /var/log/hplus-backup.log 2>&1
0 4 * * * cd /opt/hplus-analytics && BACKUP_RETENTION_DAYS=14 ./scripts/backup-retention.sh --apply >> /var/log/hplus-backup-retention.log 2>&1
```

cronユーザーがログへ書き込める権限を持つこと、ログのrotate/保持期間を別途設定することを確認してください。秘密情報はログへ出力しません。

## 手動実行

まずdry-runで候補を確認します。

```bash
cd /opt/hplus-analytics
./scripts/backup-retention.sh
```

削除が必要と確認した後だけ、明示的に適用します。

```bash
BACKUP_RETENTION_DAYS=14 ./scripts/backup-retention.sh --apply
```

削除候補、保護された最新dump、削除件数を標準出力へ表示します。DB停止、app再起動、migration、seed、volume操作は行いません。

## 容量確認

```bash
df -h /opt/hplus-analytics
du -sh /opt/hplus-analytics/backups
docker system df -v
```

## Restoreとの関係

保持処理はバックアップファイルを整理するだけで、DBを変更しません。Restore前には必ず`backup-production.sh`でpre-restore backupを作成し、`restore-production.sh`のchecksum・確認語・事前検証を使用してください。古いバックアップを削除する前に、オフサイト保管やrestore検証が必要な運用では別途確認します。

## 障害時の確認

1. `/var/log/hplus-backup.log`と`/var/log/hplus-backup-retention.log`を確認。
2. `docker compose --env-file .env.production -f docker-compose.production.yml ps`でDB/app状態を確認。
3. `/api/health`がHTTP 200かつ`database=connected`か確認。
4. `backups/`のdumpサイズと`.sha256`の`sha256sum -c`を確認。
5. retentionの失敗時はdry-runで候補を再確認し、手動削除は行わず原因を解消してから`--apply`を再実行。
