# HPLUS Analytics

CTI・デリヘルタウン・シティヘブンのデータを統合する、店舗・キャスト・媒体分析専用システムです。既存のドライバー管理システムとは、DB・認証・環境変数・セッション・コンテナ・Prismaスキーマ・デプロイ・ドメインを共有しません。

## Phase 1・2 の実装範囲

- Next.js 16 / TypeScript / Tailwind CSS 4
- PostgreSQL 18 / Prisma ORM 7
- 独自認証（ADMIN / VIEWER、DBセッション、HTTP Only Cookie）
- 店舗、キャスト、キャスト別名、媒体掲載状態、媒体取込元、ユーザーのマスタ
- Docker Compose（アプリとDBを `hplus_analytics` 名前空間で分離）
- `/api/health` ヘルスチェック
- CTI女子別レポートXLSXの非公開アップロード、プレビュー、未紐付け解決、日次取込
- 取込履歴・エラー管理と、同一日再取込upsert
- キャスト別・店舗別のCTI基本実績画面

詳細は [docs/SPECIFICATION.md](docs/SPECIFICATION.md)、DB設計は [docs/DATABASE.md](docs/DATABASE.md)、運用は [docs/IMPORT_CTI.md](docs/IMPORT_CTI.md)、列対応は [docs/CTI_COLUMN_MAPPING.md](docs/CTI_COLUMN_MAPPING.md) を参照してください。

## ローカル起動

1. `.env.example` を `.env` へコピーし、パスワードを変更します。
2. `docker compose up -d db` で専用DBを起動します。
3. `npm ci`、`npx prisma migrate deploy`、`npm run db:seed` を順に実行します。
4. `npm run dev` を実行し、`http://localhost:3000` を開きます。

初期管理者は `INITIAL_ADMIN_LOGIN_ID` と `INITIAL_ADMIN_PASSWORD` が両方設定されている場合だけシードで作成されます。初期パスワードは12文字以上が必須です。

## Dockerで全体を起動

`.env` の認証情報を変更後、次を実行します。

```bash
docker compose up --build -d
```

アプリコンテナは起動時にマイグレーションと冪等なシードを適用します。本番ではDBポートを外部公開しない構成へ変更し、HTTPS終端のリバースプロキシを前段に置いてください。

## 主なコマンド

| コマンド | 用途 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm run lint` | 静的解析 |
| `npm test` | 単体・統合テスト |
| `npm run db:generate` | Prisma Client生成 |
| `npm run db:migrate` | 開発用マイグレーション作成 |
| `npm run db:deploy` | 既存マイグレーション適用 |
| `npm run db:seed` | 3店舗と初期管理者の投入 |

## セキュリティ上の注意

- `.env` はGit対象外です。本番用の秘密情報をコミットしないでください。
- Cookieの `Secure` は本番環境で有効になります。本番は必ずHTTPSで運用してください。
- すべての更新Server ActionでADMIN権限を再検証します。
- npm監査時点で、Next.js内包PostCSSにmoderate 1件（依存連鎖上は2件表示）の既知警告があります。安定版Next.js側に修正版がないため、ユーザー入力CSSを生成しない構成で影響を限定しています。次回安定版リリース時に更新してください。
# hplus_analytics
