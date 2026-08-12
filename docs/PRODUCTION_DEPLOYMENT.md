# Production deployment

本番運用の更新手順です。秘密情報や実際のsecret値はこの文書へ記載しません。

## 構成

- 本番URL: 運用環境で設定したHTTPS URL（このリポジトリには値を固定しません）
- 配置先: `/opt/hplus-analytics`
- app: `127.0.0.1:3001` → コンテナの`3000`
- PostgreSQL: Docker network内部のみ。ホストへport公開しません。
- 設定: `.env.production`（Git管理しません）
- compose: `docker-compose.production.yml`

## Deploy

VPS上で、リポジトリのmain checkoutから実行します。

```bash
cd /opt/hplus-analytics
./scripts/deploy-production.sh
```

スクリプトは、実行ディレクトリ・環境ファイル・composeファイル・main branch・tracked変更を確認し、開始commitを表示します。その後、`git fetch`、`git pull --ff-only origin main`、compose設定検証、app image build、DB起動/health確認、temporary app containerでの明示的な`npx prisma migrate deploy`、app起動、`/api/health`のretry確認を行います。HTTP 200かつ`status=ok`・`database=connected`でない場合は失敗終了します。

`docker compose`は常に次の指定を使用します。

```bash
docker compose --env-file .env.production -f docker-compose.production.yml …
```

## Migrationとseed

- migrationはdeploy時にtemporary app containerで`npx prisma migrate deploy`を1回だけ明示実行します。
- appの起動commandは`npm start`です。
- deploy時に`prisma db seed`は実行しません。
- DB reset、`docker compose down`、volume削除、`git reset --hard`は行いません。

## Healthcheck

deploy後に次を確認します。

```bash
curl http://127.0.0.1:3001/api/health
```

HTTP 200で、`status`が`ok`、`database`が`connected`である必要があります。外部公開URLのTLS・nginx確認は、VPSの既存reverse proxy運用手順で別途行います。

## 注意事項

- 既存の`driver-management`、そのDB、volume、nginx設定には触れません。
- `.env.production`はVPS上で安全に配置し、Gitへ追加しません。
- PostgreSQLのpersistent volumeは`hplus_analytics_postgres`、upload volumeは`hplus_analytics_uploads`です。
- 失敗時は表示された開始commitを使って状況を確認します。自動rollbackは行いません。
