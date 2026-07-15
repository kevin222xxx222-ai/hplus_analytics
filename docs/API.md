# HPLUS Analytics API

更新日: 2026-07-14

すべての取込APIは独自認証のHTTP Only Cookieを使用し、サーバー側で `ADMIN` 権限を再検証します。POSTは同一オリジンを検証します。エラー応答は `{ "error": "..." }` 形式で、サーバー内部パスを返しません。

## GET /api/health

アプリとDB接続状態を返します。認証不要です。

## POST /api/imports/cti/upload

`multipart/form-data`でCTI女子別レポートを保存・検証し、プレビューを作成します。この時点では実績へ保存しません。

入力:

- `importSourceId`: UUID
- `importMode`: DAILY / MONTH_TO_DATE / MONTHLY_FINAL / UNKNOWN
- `targetFrom`: YYYY-MM-DD
- `targetTo`: YYYY-MM-DD
- `file`: XLSX

成功: HTTP 201、`batchId`と状態を返します。

## POST /api/imports/cti/{id}/resolve

プレビューの未紐付け行を処理します。

- `EXISTING`: 既存キャストへ紐付け、CTI Aliasを作成
- `NEW`: CastとCTI Aliasを作成
- `SKIP`: 今回の取込対象外
- `PENDING`: 保留

既存キャストは対象日の在籍期間内であることを再検証します。

## POST /api/imports/cti/{id}/confirm

日次プレビューの紐付け済み・エラーなし行をトランザクションでupsertします。

入力:

```json
{ "forceDuplicate": false }
```

同一ハッシュの完了済み取込がある場合、`forceDuplicate=true`を明示しない限り拒否します。

## GET /api/imports/{id}/file

保存済み元XLSXをADMINへ返します。公開ディレクトリは使用せず、レスポンスは`private, no-store`です。

## Server Actions

既存の認証・マスタ更新はServer Actionsです。Phase 2の重いファイル解析・取込処理は再利用可能なサービス層へ分離し、Route Handlerは認証、入力受領、レスポンスに限定しています。
