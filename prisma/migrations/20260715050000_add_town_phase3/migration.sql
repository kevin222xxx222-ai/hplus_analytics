-- Preserve any pre-existing Phase 1 placeholder values while adopting the
-- Phase 3 public name used by the upload API.
ALTER TYPE "ImportDataType" RENAME VALUE 'TOWN_LP' TO 'TOWN_LANDING';

CREATE TYPE "TownPageType" AS ENUM (
  'STORE_TOP', 'SCHEDULE', 'GIRL_LIST', 'SHOP_DIARY',
  'CAST_PROFILE', 'CAST_DIARY', 'EVENT', 'OTHER'
);

CREATE TABLE "town_store_daily" (
  "id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "store_id" UUID NOT NULL,
  "import_batch_id" UUID NOT NULL,
  "pv" INTEGER NOT NULL,
  "uu" INTEGER NOT NULL,
  "average_pv" DECIMAL(12,6),
  "source_average_pv" DECIMAL(12,6),
  "bounce_rate" DECIMAL(12,8),
  "tel_tap_uu" INTEGER NOT NULL,
  "conversion_rate" DECIMAL(12,8),
  "source_conversion_rate" DECIMAL(12,8),
  "source_row_number" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "town_store_daily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "town_cast_daily" (
  "id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "store_id" UUID NOT NULL,
  "cast_id" UUID NOT NULL,
  "import_batch_id" UUID NOT NULL,
  "source_cast_name" VARCHAR(100) NOT NULL,
  "pv" INTEGER NOT NULL,
  "uu" INTEGER NOT NULL,
  "average_pv" DECIMAL(12,6),
  "source_average_pv" DECIMAL(12,6),
  "tel_tap_uu" INTEGER NOT NULL,
  "conversion_rate" DECIMAL(12,8),
  "source_conversion_rate" DECIMAL(12,8),
  "is_listed" BOOLEAN NOT NULL DEFAULT true,
  "source_row_number" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "town_cast_daily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "town_url_daily" (
  "id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "store_id" UUID NOT NULL,
  "import_batch_id" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "normalized_url" TEXT NOT NULL,
  "external_store_id" VARCHAR(50),
  "external_cast_id" VARCHAR(50),
  "cast_id" UUID,
  "source_cast_name" VARCHAR(100),
  "page_type" "TownPageType" NOT NULL,
  "pv" INTEGER NOT NULL,
  "uu" INTEGER NOT NULL,
  "average_pv" DECIMAL(12,6),
  "source_average_pv" DECIMAL(12,6),
  "tel_tap_uu" INTEGER NOT NULL,
  "conversion_rate" DECIMAL(12,8),
  "source_conversion_rate" DECIMAL(12,8),
  "source_row_number" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "town_url_daily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "town_landing_daily" (
  "id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "store_id" UUID NOT NULL,
  "import_batch_id" UUID NOT NULL,
  "landing_url" TEXT NOT NULL,
  "normalized_url" TEXT NOT NULL,
  "external_store_id" VARCHAR(50),
  "external_cast_id" VARCHAR(50),
  "cast_id" UUID,
  "source_cast_name" VARCHAR(100),
  "page_type" "TownPageType" NOT NULL,
  "uu" INTEGER NOT NULL,
  "bounce_rate" DECIMAL(12,8),
  "tel_tap_uu" INTEGER NOT NULL,
  "conversion_rate" DECIMAL(12,8),
  "source_conversion_rate" DECIMAL(12,8),
  "source_row_number" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "town_landing_daily_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "town_store_daily_store_id_date_idx" ON "town_store_daily"("store_id", "date");
CREATE INDEX "town_store_daily_import_batch_id_idx" ON "town_store_daily"("import_batch_id");
CREATE UNIQUE INDEX "town_store_daily_date_store_id_key" ON "town_store_daily"("date", "store_id");

CREATE INDEX "town_cast_daily_cast_id_date_idx" ON "town_cast_daily"("cast_id", "date");
CREATE INDEX "town_cast_daily_store_id_date_idx" ON "town_cast_daily"("store_id", "date");
CREATE INDEX "town_cast_daily_import_batch_id_idx" ON "town_cast_daily"("import_batch_id");
CREATE UNIQUE INDEX "town_cast_daily_date_store_id_cast_id_key" ON "town_cast_daily"("date", "store_id", "cast_id");

CREATE INDEX "town_url_daily_store_id_date_page_type_idx" ON "town_url_daily"("store_id", "date", "page_type");
CREATE INDEX "town_url_daily_cast_id_date_idx" ON "town_url_daily"("cast_id", "date");
CREATE INDEX "town_url_daily_import_batch_id_idx" ON "town_url_daily"("import_batch_id");
CREATE UNIQUE INDEX "town_url_daily_date_store_id_normalized_url_key" ON "town_url_daily"("date", "store_id", "normalized_url");

CREATE INDEX "town_landing_daily_store_id_date_page_type_idx" ON "town_landing_daily"("store_id", "date", "page_type");
CREATE INDEX "town_landing_daily_cast_id_date_idx" ON "town_landing_daily"("cast_id", "date");
CREATE INDEX "town_landing_daily_import_batch_id_idx" ON "town_landing_daily"("import_batch_id");
CREATE UNIQUE INDEX "town_landing_daily_date_store_id_normalized_url_key" ON "town_landing_daily"("date", "store_id", "normalized_url");

ALTER TABLE "town_store_daily" ADD CONSTRAINT "town_store_daily_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "town_store_daily" ADD CONSTRAINT "town_store_daily_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "town_cast_daily" ADD CONSTRAINT "town_cast_daily_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "town_cast_daily" ADD CONSTRAINT "town_cast_daily_cast_id_fkey" FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "town_cast_daily" ADD CONSTRAINT "town_cast_daily_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "town_url_daily" ADD CONSTRAINT "town_url_daily_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "town_url_daily" ADD CONSTRAINT "town_url_daily_cast_id_fkey" FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "town_url_daily" ADD CONSTRAINT "town_url_daily_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "town_landing_daily" ADD CONSTRAINT "town_landing_daily_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "town_landing_daily" ADD CONSTRAINT "town_landing_daily_cast_id_fkey" FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "town_landing_daily" ADD CONSTRAINT "town_landing_daily_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
