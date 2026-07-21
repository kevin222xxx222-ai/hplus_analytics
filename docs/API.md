# HPLUS Analytics API

更新日: 2026-07-21

すべての取込APIは独自認証のHTTP Only Cookieを使用し、サーバー側で `ADMIN` 権限を再検証します。POSTは同一オリジンを検証します。エラー応答は `{ "error": "..." }` 形式で、サーバー内部パスを返しません。

## POST /api/imports/cti/{id}/reparse

FAILED / WAITING_FOR_CAST_LINK / COMPLETED_WITH_WARNINGS / COMPLETEDのCTIバッチを、保存済み`storagePath`と現在のCast/Alias期間で同一バッチへ再解析します。

更新対象はプレビューJSON、ImportError、ImportBatch解析件数・検出情報・状態だけです。既存CTI実績、Cast、Alias、MediaListingは変更しません。応答は`before / after`に未紐付け、警告、取込可能件数を返します。

## Cast・Alias開始日の一括前倒し（Server Action）

外部公開APIは追加せず、ADMIN認証済みのServer Actionだけを使用します。

- `previewCastStartDateBulkChangeAction`: Cast ID配列、対象日、媒体範囲から変更・衝突プレビューとフィンガープリントを返す
- `executeCastStartDateBulkChangeAction`: 必須理由とプレビューフィンガープリントを再検証して一括変更する
- VIEWERはプレビュー・実行の双方をServer Action入口で拒否する
- 実行はSerializableな単一DBトランザクションで、監査履歴作成を含む全件成功または全件ロールバックとする

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

## GET /api/imports/cti/bulk/scan

ADMIN専用。`CTI_BULK_DIR`で固定したフォルダだけを走査し、厳密な`女子別レポート_YYYYMMDD.xlsx`について対象日、サイズ、SHA-256、既存バッチ、同日別SHA、保存済み解析件数、処理可否を返します。XLSX本文は解析せず、パス入力も受け付けません。成功時は`Server-Timing`と`X-CTI-Bulk-Duration-Ms`で処理時間を返します。

## POST /api/imports/cti/bulk/process

ADMIN・同一オリジン専用。サーバー発行の`key`、`VALIDATE`または`CONFIRM_SAFE`、任意の`retryFailed`を受け取ります。1リクエストにつき1ファイルだけを再検証し、`createCtiPreview`は最大1回です。同一keyの同時要求は単一処理へ集約します。許可フォルダ内の非シンボリックリンクXLSXであることを再検証し、`CONFIRM_SAFE`でも未紐付け、曖昧、ERROR、同日別SHA等があるバッチは確定しません。成功時は開始・終了・処理時間をJSON、`Server-Timing`、`X-CTI-Bulk-Duration-Ms`で返します。

## POST /api/imports/town/upload

`multipart/form-data`で店舗、データ種別、対象期間、CSVを受け取り、非公開保存・構造検証・プレビュー作成を行います。店舗は選択した取込元で確定し、ファイル名は判定に使いません。成功時はHTTP 201で `batchId` と状態を返します。

## GET /api/imports/town/bulk/scan

ADMIN専用。環境変数で固定した春日部・越谷フォルダだけを走査し、ファイル名、種別、対象期間、サイズ、SHA-256、既存ImportBatch、件数、処理可否を返します。パス入力は受け付けません。

## POST /api/imports/town/bulk/process

ADMIN・同一オリジン専用。サーバー発行の`key`と`VALIDATE`または`CONFIRM_SAFE`を受け取り、許可フォルダ内の通常CSVであることを再検証します。既存Townプレビュー処理を1ファイルだけ実行し、`CONFIRM_SAFE`でも安全条件を満たさないバッチは確定しません。失敗済み同一SHAの再試行時だけ`retryFailed=true`を指定できます。

## POST /api/imports/town/bulk/link-candidates

ADMIN・同一オリジン専用。`{"action":"PREVIEW"}`は現在のOPEN未紐付け、CTI Alias、Cast表示名・在籍期間、CastNameHistory、Town Alias、修正版情報を読み取り専用で再計算し、A/B/C候補、行数、バッチ数、推定WAITING・自動確定可能数、候補フィンガープリントを返します。

`EXECUTE`は`category`（A/B）、プレビューで選択した`candidateKeys`、`fingerprint`を受け取ります。Aは候補全件、Bは選択候補だけを対象にし、実行直前の再計算結果と不一致なら拒否します。SerializableトランザクションとDB advisory lockを使用し、Town Alias、preview、ImportError、未反映実績、ImportBatch件数・監査イベントを一括更新します。Cは実行できません。

## POST /api/imports/town/{id}/resolve

タウンプレビューのOPEN未紐付け行を処理します。`EXISTING` は既存キャストへ紐付けて店舗限定TOWN Aliasをupsert、`SKIP` は今回の当該行だけを除外、`PENDING` は保留です。

`CHECK_NEW` はTown女子別行について新規名と対象日時点の同名在籍候補を返します。`NEW` はADMINの明示操作でのみ利用でき、Town女子別行から内部Cast、TOWN Alias、MediaListingを作成し、同店舗・同一正規化名の女子/URL/LPを再解決します。候補1件は `confirmDuplicate=true` がない限り拒否し、複数候補は確認済みでも拒否します。URL/LP行からの `NEW` は拒否します。

`PREVIEW_READY` / `WAITING_FOR_CAST_LINK` に加え、`COMPLETED_WITH_WARNINGS`、OPEN未紐付けを持つ`COMPLETED`でも利用できます。完了済みバッチでは同店舗・同一正規化名の女子/URL/LPを再解決し、新たに解決された行だけを実績へupsertします。既存完了行は再加算せず、バッチ状態を未確定へ戻しません。ADMIN権限と同一オリジン検証は必須です。

## POST /api/imports/town/{id}/reparse

ADMIN・同一オリジン専用。FAILED / PREVIEW_READY / WAITING_FOR_CAST_LINKのTown店舗・女子・URL・LPバッチを、保存済み元CSVと現在のCast、TOWN Alias、在籍期間で再解析します。同一batch IDのpreview JSON、ImportError、ImportBatch検証件数だけを更新し、Town実績4テーブルは変更しません。同一batchIdの同時要求は単一処理へ集約し、完了済みバッチは拒否します。

## POST /api/imports/town/{id}/confirm

エラーなしの解決済み行を4種の日次テーブルへupsertします。入力は `{ "forceDuplicate": false }`。同一ハッシュの完了済み取込は明示的な再処理なしでは拒否します。

## GET /api/imports/{id}/file

保存済み元XLSX/CSVをADMINへ返します。公開ディレクトリは使用せず、レスポンスは`private, no-store`です。

## Server Actions

既存の認証・マスタ更新はServer Actionsです。CTI/Townのファイル解析・取込処理は再利用可能なサービス層へ分離し、Route Handlerは認証、同一オリジン検証、入力受領、レスポンスに限定しています。タウン分析画面はADMIN/VIEWERが閲覧でき、タウン取込APIはADMINだけが利用できます。

`updateCastDisplayNameAction`はADMIN専用です。`id`、`displayName`、任意の`reason`、重複候補確認済みを示す`confirmDuplicate`を受け取ります。同じ正規化名の別キャストがある場合、初回は更新せず候補・在籍期間重複情報を返します。確認後はCast UUIDを変えずに表示名・正規化名を更新し、同一トランザクションで`CastNameHistory`を作成します。

`executeCastMergeAction`はADMIN専用です。source/target ID、プレビューフィンガープリント、統合後の表示名・主所属・在籍期間・メモ、理由、確認文字列`MERGE`を受け取ります。実行時に全データを再検証し、フィンガープリント不一致、統合済みCast、同一ID、値が異なる衝突を拒否します。成功時はSerializableトランザクションで関連データ移行、source統合状態、`CastMergeHistory`を確定します。
