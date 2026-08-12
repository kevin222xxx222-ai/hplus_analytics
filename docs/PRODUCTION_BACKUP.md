# Production PostgreSQL backup

本番PostgreSQLを停止せず、1回分の検証済みバックアップを作成する手順です。秘密情報はこの文書へ記載しません。

## 実行

本番VPSで、配置先から実行します。

```bash
cd /opt/hplus-analytics
./scripts/backup-production.sh
```

スクリプトは`.env.production`とproduction Compose設定、DBコンテナの稼働状態・healthを確認してからバックアップを作成します。DB停止、app再起動、`docker compose down`、DB reset、volume削除、migration、seedは行いません。

## 保存形式と保存先

- 保存先: `/opt/hplus-analytics/backups/`
- 形式: PostgreSQL custom format（`pg_dump -Fc`）
- owner/privilege: `--no-owner --no-acl`。restore先のrole/権限名に依存しません。
- ファイル名: `hplus_analytics_YYYYMMDD_HHMMSS.dump`
- 同じdumpのSHA-256を`.dump.sha256`へ保存し、`pg_restore -l`でアーカイブを検証します。
- 0 byteまたは異常に小さいファイルは失敗扱いです。

バックアップファイルは`.gitignore`の`backups/`によりGit管理しません。バックアップ自体の暗号化、オフサイト転送、Retention/cron、自動削除は別Phaseで扱います。

## 容量確認

作成前後にVPSの空き容量を確認します。

```bash
df -h /opt/hplus-analytics
du -sh /opt/hplus-analytics/backups
```

Docker volumeの使用量を確認する場合は、VPSのDocker運用権限で次を実行します。

```bash
docker system df -v
```

## Restore

Restoreは別scriptで実装予定です。既存DBへ直接上書きせず、まず隔離したPostgreSQLへrestoreして、`pg_restore -l`、migration status、FK/unique、件数、最新business dateを検証してから運用判断を行います。
