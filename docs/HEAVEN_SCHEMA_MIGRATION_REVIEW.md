# Heavenスキーマ／migration実装前レビュー

作成日: 2026-07-22  
状態: **提案のみ。schema.prisma反映、migration生成・実行、DB変更は未実施**

## 1. 推奨方針

次の2つの長形式factテーブルを追加します。

- `heaven_shop_daily`: 1日・1店舗・1指標
- `heaven_cast_daily`: 1日・1店舗・1キャスト・1指標

CSVは日次イベントと累積スナップショットが混在するため、raw値を保持し、累積指標の前日差分は派生値として別保存します。

## 2. Prisma schema案

### 2.1 追加enum

```prisma
enum HeavenMetricValueKind {
  DAILY_EVENT
  SNAPSHOT
}

enum HeavenRawValueStatus {
  VALUE
  BLANK
  NOT_APPLICABLE
}
```

### 2.2 HeavenShopDaily

```prisma
model HeavenShopDaily {
  id              String                @id @default(uuid()) @db.Uuid
  date            DateTime              @db.Date
  storeId         String                @map("store_id") @db.Uuid
  importBatchId   String                @map("import_batch_id") @db.Uuid
  metricKey       String                @map("metric_key") @db.VarChar(100)
  rawValue        Decimal?              @map("raw_value") @db.Decimal(18, 6)
  valueKind       HeavenMetricValueKind @map("value_kind")
  deltaValue      Decimal?              @map("delta_value") @db.Decimal(18, 6)
  rawStatus       HeavenRawValueStatus  @map("raw_status")
  sourceColumn    String                @map("source_column") @db.VarChar(255)
  sourceRowNumber Int                   @map("source_row_number")
  createdAt       DateTime              @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime              @updatedAt @map("updated_at") @db.Timestamptz(3)
  store           Store                 @relation(fields: [storeId], references: [id], onDelete: Restrict)
  importBatch     ImportBatch           @relation(fields: [importBatchId], references: [id], onDelete: Restrict)

  @@unique([date, storeId, metricKey])
  @@index([storeId, date])
  @@index([importBatchId])
  @@index([metricKey, date])
  @@map("heaven_shop_daily")
}
```

### 2.3 HeavenCastDaily

未紐付け行でも自然キーを安定させるため、`resolutionKey`を持たせます。解決済みは`cast:<Cast UUID>`、未解決は`name:<normalizedSourceCastName>`です。PostgreSQLのNULL一意性には依存しません。

```prisma
model HeavenCastDaily {
  id                       String                @id @default(uuid()) @db.Uuid
  date                     DateTime              @db.Date
  storeId                  String                @map("store_id") @db.Uuid
  castId                   String?               @map("cast_id") @db.Uuid
  sourceCastName           String                @map("source_cast_name") @db.VarChar(100)
  normalizedSourceCastName String                @map("normalized_source_cast_name") @db.VarChar(100)
  resolutionKey            String                @map("resolution_key") @db.VarChar(180)
  importBatchId            String                @map("import_batch_id") @db.Uuid
  metricKey                String                @map("metric_key") @db.VarChar(100)
  rawValue                 Decimal?              @map("raw_value") @db.Decimal(18, 6)
  valueKind                HeavenMetricValueKind @map("value_kind")
  deltaValue               Decimal?              @map("delta_value") @db.Decimal(18, 6)
  rawStatus                HeavenRawValueStatus  @map("raw_status")
  sourceColumn             String                @map("source_column") @db.VarChar(255)
  sourceRowNumber          Int                   @map("source_row_number")
  createdAt                DateTime              @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt                DateTime              @updatedAt @map("updated_at") @db.Timestamptz(3)
  store                    Store                 @relation(fields: [storeId], references: [id], onDelete: Restrict)
  cast                     Cast?                 @relation(fields: [castId], references: [id], onDelete: SetNull)
  importBatch              ImportBatch           @relation(fields: [importBatchId], references: [id], onDelete: Restrict)

  @@unique([date, storeId, metricKey, resolutionKey])
  @@index([castId, date])
  @@index([storeId, date])
  @@index([importBatchId])
  @@index([normalizedSourceCastName, storeId, date])
  @@map("heaven_cast_daily")
}
```

### 2.4 既存モデルへの変更案

既存カラムは変更せず、次のrelationのみを追加します。

```prisma
// Store
heavenShopDailies HeavenShopDaily[]
heavenCastDailies HeavenCastDaily[]

// Cast
heavenCastDailies HeavenCastDaily[]

// ImportBatch
heavenShopDailies HeavenShopDaily[]
heavenCastDailies HeavenCastDaily[]
```

`ImportDataType.HEAVEN_STORE`、`ImportDataType.HEAVEN_CAST`、`MediaType.HEAVEN`は既存enumに存在します。CastAliasも既存のHEAVEN媒体・店舗・期間・正規化名で利用できるため、新Aliasテーブルは不要です。

## 3. migration案（実行しないSQL草案）

```sql
-- レビュー用草案。実行禁止。
CREATE TYPE "HeavenMetricValueKind" AS ENUM ('DAILY_EVENT', 'SNAPSHOT');
CREATE TYPE "HeavenRawValueStatus" AS ENUM ('VALUE', 'BLANK', 'NOT_APPLICABLE');

CREATE TABLE "heaven_shop_daily" (
  "id" uuid PRIMARY KEY,
  "date" date NOT NULL,
  "store_id" uuid NOT NULL,
  "import_batch_id" uuid NOT NULL,
  "metric_key" varchar(100) NOT NULL,
  "raw_value" numeric(18,6),
  "value_kind" "HeavenMetricValueKind" NOT NULL,
  "delta_value" numeric(18,6),
  "raw_status" "HeavenRawValueStatus" NOT NULL,
  "source_column" varchar(255) NOT NULL,
  "source_row_number" integer NOT NULL,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(3) NOT NULL
);
CREATE UNIQUE INDEX "heaven_shop_daily_date_store_metric_key"
  ON "heaven_shop_daily" ("date", "store_id", "metric_key");
CREATE INDEX "heaven_shop_daily_store_date_idx"
  ON "heaven_shop_daily" ("store_id", "date");
CREATE INDEX "heaven_shop_daily_import_batch_idx"
  ON "heaven_shop_daily" ("import_batch_id");
CREATE INDEX "heaven_shop_daily_metric_date_idx"
  ON "heaven_shop_daily" ("metric_key", "date");

CREATE TABLE "heaven_cast_daily" (
  "id" uuid PRIMARY KEY,
  "date" date NOT NULL,
  "store_id" uuid NOT NULL,
  "cast_id" uuid,
  "source_cast_name" varchar(100) NOT NULL,
  "normalized_source_cast_name" varchar(100) NOT NULL,
  "resolution_key" varchar(180) NOT NULL,
  "import_batch_id" uuid NOT NULL,
  "metric_key" varchar(100) NOT NULL,
  "raw_value" numeric(18,6),
  "value_kind" "HeavenMetricValueKind" NOT NULL,
  "delta_value" numeric(18,6),
  "raw_status" "HeavenRawValueStatus" NOT NULL,
  "source_column" varchar(255) NOT NULL,
  "source_row_number" integer NOT NULL,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(3) NOT NULL
);
CREATE UNIQUE INDEX "heaven_cast_daily_date_store_metric_resolution_key"
  ON "heaven_cast_daily" ("date", "store_id", "metric_key", "resolution_key");
CREATE INDEX "heaven_cast_daily_cast_date_idx"
  ON "heaven_cast_daily" ("cast_id", "date");
CREATE INDEX "heaven_cast_daily_store_date_idx"
  ON "heaven_cast_daily" ("store_id", "date");
CREATE INDEX "heaven_cast_daily_import_batch_idx"
  ON "heaven_cast_daily" ("import_batch_id");
CREATE INDEX "heaven_cast_daily_name_store_date_idx"
  ON "heaven_cast_daily" ("normalized_source_cast_name", "store_id", "date");

ALTER TABLE "heaven_shop_daily"
  ADD CONSTRAINT "heaven_shop_daily_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "heaven_shop_daily_import_batch_id_fkey"
  FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "heaven_cast_daily"
  ADD CONSTRAINT "heaven_cast_daily_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "heaven_cast_daily_cast_id_fkey"
  FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "heaven_cast_daily_import_batch_id_fkey"
  FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

## 4. ImportBatch、Preview、確定処理

- `dataType`: `HEAVEN_STORE`または`HEAVEN_CAST`
- `importMode`: `MONTH_TO_DATE`または`MONTHLY_FINAL`
- `targetFrom/targetTo`: 日次行の最小/最大日
- `detectedColumns`: 元列名と内部metricKey
- `metadata`: 月次summary、値種別、rawStatus件数、fingerprint、resolver結果
- `合計`等のsummary行は日次factへ入れず、metadataへraw保存
- 未紐付けがあれば`WAITING_FOR_CAST_LINK`
- 確定は自然キーupsert。既存行を単純加算しない
- 同一SHAは重複スキップ、同月・店舗・種別の別SHAは修正版候補として停止

## 5. 値の計算方針

- `DAILY_EVENT`: rawValueを日次値として使用、deltaValueはNULL
- `SNAPSHOT`: rawValueを保存し、deltaValue=当日raw−前日raw
- 初日・前日欠落・リセット検知時のdeltaValueはNULL＋WARNING
- 累積値の減少は解除等の可能性があるため、0へ丸めない
- 月次分析ではイベント型をSUM、スナップショット型を指定日のLAST_VALUEで扱う

## 6. Alias・未紐付け

既存`CastAlias(mediaType=HEAVEN)`を使用し、店舗・期間・正規化名を検査します。候補0/複数、期間外、統合済みsourceCastは自動解決しません。新規Cast自動作成は禁止し、ADMINの明示操作だけを許可します。未紐付け行はPreviewに保持し、後日のAlias追加時に未保存行だけをupsertします。

## 7. migration影響・ロールバック

- 既存CTI/Townの行・集計・Aliasは変更しない
- 既存enum値は変更不要
- 初回migrationは空テーブルとenumの作成のみ
- 既存ImportBatchのデータ移行は不要
- 実データ投入後のdown migrationは自動実行せず、バックアップからの復元を優先する
- DDL適用前にバックアップ、適用後に制約・index・Prisma生成物を検証する

## 8. 承認事項

1. 長形式fact案の採用
2. 月次summaryをImportBatch.metadataへ保存する方針
3. `heaven_girl_diary_notice`と`tokeiGirl`の正式指標名
4. 店舗をADMIN明示選択必須とする方針
5. 前月末値なしの初日deltaをNULLとする方針

承認後にのみschema反映、migration生成、テストフィクスチャ作成へ進みます。

## 9. 追加レビュー結果

### 9.1 HeavenMetricValueKindはDB保存するか

アプリ側の`metricKey`辞書だけから毎回判定することもできますが、DB保存を推奨します。

理由:

- 指標定義が将来変更されても、過去取込時の意味を再現できる
- `SNAPSHOT`をSUMしてしまう事故をクエリ側で検査できる
- 再解析・再取込時の判定差分を監査できる
- 将来の指標辞書バージョンを追加しやすい

ただし、各行へのenum保存を避けたい場合は、将来`HeavenMetricDefinition(metricKey, valueKind, definitionVersion)`を追加し、fact側はmetricKeyだけにする代案があります。今回の初回migrationでは追加テーブルを増やさず、fact側のenumを保持する案を採用します。

### 9.2 HeavenRawValueStatusの用途

`rawValue = NULL`だけでは、CSVの空欄と`---`を区別できません。

- `VALUE`: 数値が存在
- `BLANK`: セルが空欄。未入力またはデータ欠損
- `NOT_APPLICABLE`: `---`。対象外または提供元が値なしと明示

この区別は、0への誤変換防止、欠損率集計、再取込差分、監査表示に必要です。DB保存を省略してraw JSONだけにする代案はありますが、分析時に毎回JSONを解釈するため、現案ではenum保存を維持します。

### 9.3 resolutionKeyの生成ルール

既存の名前normalizerを使用し、次の順で生成します。

1. `sourceCastName`をUnicode NFKC化
2. 前後空白・全角空白を除去
3. 連続空白を1つへ統一
4. 既存Cast/Area resolverと同じ正規化処理を適用し、`normalizedSourceCastName`を得る
5. 解決済みの場合: `cast:` + 小文字UUID（例: `cast:44a8...`）
6. 未解決の場合: `name:` + `normalizedSourceCastName`（例: `name:ゆあな`）

店舗・日付・metricKeyはunique制約側に含めるため、resolutionKeyへ重複して埋め込まない。将来Heaven外部IDが提供された場合は、`external:` + provider + `:` + externalIdを優先し、名前だけのkeyから置き換える。

未解決から解決済みへ移行する際は、同一日・店舗・metricKeyの解決済み行が既に存在しないことをトランザクション内で確認し、存在する場合は自動加算せず衝突停止する。

### 9.4 自然キー・一意制約

#### HeavenShopDaily

自然キーは次の3項目です。

```text
date + storeId + metricKey
```

DB unique: `@@unique([date, storeId, metricKey])`。ImportBatch IDは自然キーに含めないため、同じ日・店舗・指標を再取込しても1行にupsertします。

#### HeavenCastDaily

解決済みの論理的な自然キーは次の4項目です。

```text
date + storeId + castId + metricKey
```

未解決行ではcastIdがNULLになるため、実DBのuniqueは次の4項目で安定化します。

```text
date + storeId + metricKey + resolutionKey
```

DB unique: `@@unique([date, storeId, metricKey, resolutionKey])`。resolutionKeyは解決時に`name:`から`cast:`へ更新します。

### 9.5 同じ月CSVを再投入する場合

1. **同一SHA-256**: 完了済みImportBatchなら`SKIPPED_DUPLICATE`相当として処理せず、既存factを変更しない
2. **同一月・店舗・種別で別SHA**: 修正版候補として停止し、自動上書きしない
3. **管理者が修正版を明示採用**: Serializable transaction内で自然キーupsertし、値を加算しない。`rawValue`、`valueKind`、`rawStatus`、`deltaValue`を新ファイルの値へ置き換える
4. 新ファイルに存在しない旧factは自動削除しない。削除・無効化が必要なら別の明示的なrevision設計を先に承認する
5. 修正版採用イベントには旧SHA、新SHA、更新行、追加行、未変更行、衝突を`metadata.importEvents`へ記録する

このため、通常の再取込は「同一SHAは無処理」「別SHAは要確認」であり、勝手に過去の確定値を上書きしません。
