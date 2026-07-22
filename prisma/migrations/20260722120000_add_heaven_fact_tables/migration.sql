-- Heaven Phase 1 fact tables.
-- Generated for review; apply only after explicit migration approval.

CREATE TYPE "HeavenMetricValueKind" AS ENUM ('DAILY_EVENT', 'SNAPSHOT');
CREATE TYPE "HeavenRawValueStatus" AS ENUM ('VALUE', 'BLANK', 'NOT_APPLICABLE');

CREATE TABLE "heaven_shop_daily" (
    "id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "store_id" UUID NOT NULL,
    "import_batch_id" UUID NOT NULL,
    "metric_key" VARCHAR(100) NOT NULL,
    "raw_value" DECIMAL(18,6),
    "value_kind" "HeavenMetricValueKind" NOT NULL,
    "raw_value_status" "HeavenRawValueStatus" NOT NULL,
    "delta_value" DECIMAL(18,6),
    "source_column" VARCHAR(255) NOT NULL,
    "source_row_number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "heaven_shop_daily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "heaven_cast_daily" (
    "id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "store_id" UUID NOT NULL,
    "cast_id" UUID,
    "source_cast_name" VARCHAR(100) NOT NULL,
    "normalized_source_cast_name" VARCHAR(100) NOT NULL,
    "resolution_key" VARCHAR(180) NOT NULL,
    "import_batch_id" UUID NOT NULL,
    "metric_key" VARCHAR(100) NOT NULL,
    "raw_value" DECIMAL(18,6),
    "value_kind" "HeavenMetricValueKind" NOT NULL,
    "raw_value_status" "HeavenRawValueStatus" NOT NULL,
    "delta_value" DECIMAL(18,6),
    "source_column" VARCHAR(255) NOT NULL,
    "source_row_number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "heaven_cast_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "heaven_shop_daily_business_date_store_id_metric_key_key"
ON "heaven_shop_daily"("business_date", "store_id", "metric_key");
CREATE INDEX "heaven_shop_daily_store_id_business_date_idx"
ON "heaven_shop_daily"("store_id", "business_date");
CREATE INDEX "heaven_shop_daily_import_batch_id_idx"
ON "heaven_shop_daily"("import_batch_id");
CREATE INDEX "heaven_shop_daily_metric_key_business_date_idx"
ON "heaven_shop_daily"("metric_key", "business_date");

CREATE UNIQUE INDEX "heaven_cast_daily_business_date_store_id_metric_key_resolution_key_key"
ON "heaven_cast_daily"("business_date", "store_id", "metric_key", "resolution_key");
CREATE INDEX "heaven_cast_daily_cast_id_business_date_idx"
ON "heaven_cast_daily"("cast_id", "business_date");
CREATE INDEX "heaven_cast_daily_store_id_business_date_idx"
ON "heaven_cast_daily"("store_id", "business_date");
CREATE INDEX "heaven_cast_daily_import_batch_id_idx"
ON "heaven_cast_daily"("import_batch_id");
CREATE INDEX "heaven_cast_daily_normalized_source_cast_name_store_id_business_date_idx"
ON "heaven_cast_daily"("normalized_source_cast_name", "store_id", "business_date");

ALTER TABLE "heaven_shop_daily"
ADD CONSTRAINT "heaven_shop_daily_store_id_fkey"
FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "heaven_shop_daily"
ADD CONSTRAINT "heaven_shop_daily_import_batch_id_fkey"
FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "heaven_cast_daily"
ADD CONSTRAINT "heaven_cast_daily_store_id_fkey"
FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "heaven_cast_daily"
ADD CONSTRAINT "heaven_cast_daily_cast_id_fkey"
FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "heaven_cast_daily"
ADD CONSTRAINT "heaven_cast_daily_import_batch_id_fkey"
FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
