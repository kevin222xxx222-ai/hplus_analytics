# HPLUS Analytics データベース設計

更新日: 2026-07-14  
対象: Phase 2 CTI女子別レポート取込実装後

## 基本方針

- PostgreSQL 18とPrisma ORM 7を使用する。
- 業務エンティティの主キーはUUID v4とし、DBの `uuid` 型で保持する。
- 日付だけを表す値は `date`、時刻を含む値はタイムゾーン付き `timestamptz(3)` を使用する。
- テーブル名とカラム名はDB上ではsnake_case、Prisma上ではTypeScript向けcamelCaseとする。
- 既存のドライバー管理システムとはDB、スキーマ、マイグレーション、認証、セッションを共有しない。

## cast_idの生成方式

`casts.id` はPrismaの `@default(uuid())` で生成するUUID v4です。CUIDは使用していません。DB型はPostgreSQLのネイティブ `uuid` です。

キャスト名は主キーにしません。同名が将来別人へ再利用された場合も、新しいUUIDと在籍期間を持つ別レコードとして登録します。

## Prismaモデル全一覧

| Prismaモデル | DBテーブル | 目的 |
| --- | --- | --- |
| `User` | `users` | 独自認証ユーザーとADMIN/VIEWER権限 |
| `Session` | `sessions` | ログインセッション、有効期限、端末情報 |
| `Store` | `stores` | 春日部・越谷・野田の店舗マスタ |
| `Cast` | `casts` | 内部UUIDを持つキャストマスタ |
| `CastAlias` | `cast_aliases` | CTI/TOWN/HEAVEN上の名前と内部キャストの対応 |
| `MediaListing` | `media_listings` | キャストの店舗・媒体別掲載状態 |
| `ImportSource` | `import_sources` | 媒体、店舗、データ種別、取込元設定 |
| `ImportBatch` | `import_batches` | 取込1回ごとのファイル、期間、状態、件数、実行結果 |
| `ImportError` | `import_errors` | ファイル取込時の警告・エラー明細 |
| `CtiCastDaily` | `cti_cast_daily` | キャスト・店舗・営業日単位のCTI実績 |
| `ImprovementLog` | `improvement_logs` | 自動判定の根拠・比較条件・解決状態の履歴 |

## モデル詳細

### User / users

- UUID主キー
- ログインIDとメールはそれぞれ一意
- パスワードはbcryptハッシュのみ保存
- `ADMIN` / `VIEWER` と有効状態を保持
- User削除時は関連Sessionを削除

### Session / sessions

- UUID主キー
- ブラウザへ渡したランダムトークンそのものは保存せず、SHA-256ハッシュを保存
- `expires_at`、作成日時、最終利用日時、IP、User-Agentを保持
- 有効期限は `SESSION_DURATION_DAYS` で設定し、既定7日、許容範囲1〜30日
- `user_id` と `expires_at` にインデックス

### Store / stores

- UUID主キー
- `KASUKABE`、`KOSHIGAYA`、`NODA` の店舗コードを一意に保持
- 経営実績対象と集客分析対象を別フラグで保持
- 集客対象は春日部・越谷、経営実績対象は3店舗

### Cast / casts

- `id` はUUID v4
- 表示名と正規化名を分離
- 在籍開始日、終了日、在籍状態、主所属店舗を保持
- 全角・半角スペース等は正規化するが、ひらがな・カタカナは自動変換しない

### CastAlias / cast_aliases

- CTI/TOWN/HEAVENごとの媒体上の名前を保持
- 店舗、内部キャスト、有効期間を任意で関連付け
- `PENDING`、`MAPPED`、`IGNORED` で管理者確認状態を保持
- 未紐付けデータからキャストを自動生成しない

### MediaListing / media_listings

1行を「キャスト × 店舗 × 媒体」の現在の掲載単位として保持します。

主要カラム:

- `cast_id`: 内部キャストUUID
- `store_id`: 掲載店舗UUID
- `media_type`: `TOWN` または `HEAVEN` などの媒体
- `is_listed`: 掲載中かどうか
- `listed_from` / `listed_to`: 掲載期間

`cast_id + store_id + media_type` は一意です。そのため同じキャストについて、以下は独立した3行になります。

| 掲載先 | store_id | media_type | is_listed |
| --- | --- | --- | --- |
| Town春日部 | 春日部 | `TOWN` | 個別に保持 |
| Town越谷 | 越谷 | `TOWN` | 個別に保持 |
| Heaven春日部 | 春日部 | `HEAVEN` | 個別に保持 |

例としてTown越谷へ掲載されていないキャストは、Town越谷の行を `is_listed=false` として保持します。アクセス実績が0の場合は掲載状態を変更せず、後続Phaseのアクセス実績テーブルで数値0として保持します。したがって「非掲載」と「掲載中だがアクセス0」を区別できます。

現スキーマは将来の媒体追加を考慮して組み合わせ自体は柔軟です。第一版の「Heavenは春日部のみ」という制約は、取込元設定とPhase 2以降の登録サービスで検証します。

### ImportSource / import_sources

- 手動アップロードとGoogle Driveの取込元を共通管理
- 媒体、店舗、データ種別、metricType、フォルダパス、有効状態を保持
- Phase 2のCTI取込では `CTI_CAST_REPORT` を使用

### ImportBatch / import_batches

取込1回を1行で管理する実行履歴です。

- `run_id`: UUID v4の実行識別子
- 元ファイル名、非公開保存名、保存先、SHA-256、ファイルサイズ
- データ種別、日次/月途中累計/月次確定の取込モード、対象期間
- アップロード、検証、紐付け待ち、取込中、完了、警告付き完了、失敗等の状態
- 登録、更新、除外、未紐付け、警告、エラー件数
- 対象シート、検出列、差分等のメタデータ
- 実行ユーザー、開始・完了日時

元XLSXとプレビューJSONは公開ディレクトリへ置かず、`UPLOAD_DIR` 配下のバッチ別ディレクトリへ保存します。

### ImportError / import_errors

取込エラー・警告明細です。

- `run_id`: 1回の取込試行をまとめるUUID
- `import_batch_id`: `import_batches` への外部キー。Phase 1由来データとの互換性のためnullable
- 取込元、ファイル名、SHA-256ファイルハッシュ、シート名、行番号、列名
- エラーコード、警告/エラーレベル、メッセージ
- 問題行の値を `jsonb` で保存可能
- `OPEN`、`RESOLVED`、`IGNORED` と解決日時を保持
- `run_id`、取込元と状態、ファイルハッシュ、状態と作成日時にインデックス


### CtiCastDaily / cti_cast_daily

日次取込を「営業日 × 店舗 × 内部キャスト」の一意キーで保持します。同じキャストが複数店舗へ出勤した場合は店舗ごとに別行です。

- 出勤回数、出勤時間（分）、当欠、予約、キャンセル
- 接客、本指名、写真指名、フリー、契約、新規成約、リピート成約（新規/リピート成約は列欠損時nullable）
- 売上、キャスト報酬、CTI利益、報酬差引後金額
- CTI写メ日記、有料オプション
- 元シート、元行、取込バッチ
- 元ファイル上の接客・契約値を `source_service_count` / `source_contract_count` として検算用に保持

同一キーの再取込はupsertし、最終取込バッチへ参照を更新します。月途中累計・月次確定ファイルは差分化せず、現段階ではプレビューのみです。

### ImprovementLog / improvement_logs

画面なしで先行追加した自動判定履歴です。

- 判定タイプ: 露出不足、ページ転換率低下、リピート改善候補、出勤機会損失、急落、成長中
- キャストと店舗は任意関連。店舗全体判定にも対応
- 判定対象期間、検出日時、ルールバージョンを保持
- `evidence` に指標と母数、`comparison_context` に店舗中央値・本人過去・同曜日等の比較条件を `jsonb` で保存
- `ACTIVE`、`RESOLVED`、`DISMISSED` と解決日時を保持
- `message` は原因断定ではなく「可能性」「確認候補」として生成する前提

## Enum一覧

- `UserRole`: ADMIN / VIEWER
- `StoreCode`: KASUKABE / KOSHIGAYA / NODA
- `CastStatus`: ACTIVE / INACTIVE
- `MediaType`: CTI / TOWN / HEAVEN
- `AliasReviewStatus`: PENDING / MAPPED / IGNORED
- `ImportSourceKind`: MANUAL_UPLOAD / GOOGLE_DRIVE
- `ImportDataType`: CTI_CAST_REPORT / TOWN_STORE / TOWN_CAST / TOWN_URL / TOWN_LP / HEAVEN_STORE / HEAVEN_CAST
- `ImportBatchStatus`: UPLOADED / VALIDATING / PREVIEW_READY / WAITING_FOR_CAST_LINK / IMPORTING / COMPLETED / COMPLETED_WITH_WARNINGS / FAILED / CANCELLED
- `ImportMode`: DAILY / MONTH_TO_DATE / MONTHLY_FINAL / UNKNOWN
- `ImportErrorLevel`: WARNING / ERROR
- `ImportErrorStatus`: OPEN / RESOLVED / IGNORED
- `ImprovementType`: EXPOSURE_SHORTAGE / PAGE_CONVERSION_DECLINE / REPEAT_IMPROVEMENT / ATTENDANCE_OPPORTUNITY_LOSS / SHARP_DECLINE / GROWING
- `ImprovementLogStatus`: ACTIVE / RESOLVED / DISMISSED

## マイグレーション運用

- 開発: `npm run db:migrate`
- 本番適用: `npm run db:deploy`
- Prisma Client生成: `npm run db:generate`
- マイグレーションファイルはGit管理し、本番で `migrate dev` は使用しない
