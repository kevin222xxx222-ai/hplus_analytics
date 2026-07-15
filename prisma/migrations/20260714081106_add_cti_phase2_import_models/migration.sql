-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'PREVIEW_READY', 'WAITING_FOR_CAST_LINK', 'IMPORTING', 'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportMode" AS ENUM ('DAILY', 'MONTH_TO_DATE', 'MONTHLY_FINAL', 'UNKNOWN');

-- AlterTable
ALTER TABLE "import_errors" ADD COLUMN     "import_batch_id" UUID;

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "import_source_id" UUID NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "stored_filename" VARCHAR(255) NOT NULL,
    "storage_path" VARCHAR(1000) NOT NULL,
    "file_hash" CHAR(64) NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "data_type" "ImportDataType" NOT NULL,
    "import_mode" "ImportMode" NOT NULL,
    "target_from" DATE NOT NULL,
    "target_to" DATE NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "uploaded_by_user_id" UUID,
    "inserted_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "pending_count" INTEGER NOT NULL DEFAULT 0,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "source_sheet_names" JSONB,
    "detected_columns" JSONB,
    "metadata" JSONB,
    "failure_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cti_cast_daily" (
    "id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "store_id" UUID NOT NULL,
    "cast_id" UUID NOT NULL,
    "import_batch_id" UUID NOT NULL,
    "source_sheet_name" VARCHAR(255) NOT NULL,
    "source_row_number" INTEGER NOT NULL,
    "attendance_count" INTEGER NOT NULL,
    "attendance_minutes" INTEGER NOT NULL,
    "same_day_absence_count" INTEGER NOT NULL,
    "reservation_count" INTEGER NOT NULL,
    "cancellation_count" INTEGER NOT NULL,
    "service_count" INTEGER NOT NULL,
    "source_service_count" INTEGER,
    "regular_nomination_count" INTEGER NOT NULL,
    "photo_nomination_count" INTEGER NOT NULL,
    "free_count" INTEGER NOT NULL,
    "contract_count" INTEGER NOT NULL,
    "source_contract_count" INTEGER,
    "new_count" INTEGER NOT NULL,
    "repeat_count" INTEGER NOT NULL,
    "sales_amount" INTEGER NOT NULL,
    "cast_reward_amount" INTEGER NOT NULL,
    "cti_profit_amount" INTEGER NOT NULL,
    "payout_after_reward_amount" INTEGER NOT NULL,
    "diary_count_cti" INTEGER NOT NULL,
    "paid_option_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cti_cast_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_run_id_key" ON "import_batches"("run_id");

-- CreateIndex
CREATE INDEX "import_batches_file_hash_status_idx" ON "import_batches"("file_hash", "status");

-- CreateIndex
CREATE INDEX "import_batches_data_type_target_from_target_to_idx" ON "import_batches"("data_type", "target_from", "target_to");

-- CreateIndex
CREATE INDEX "import_batches_status_created_at_idx" ON "import_batches"("status", "created_at");

-- CreateIndex
CREATE INDEX "import_batches_uploaded_by_user_id_idx" ON "import_batches"("uploaded_by_user_id");

-- CreateIndex
CREATE INDEX "cti_cast_daily_cast_id_business_date_idx" ON "cti_cast_daily"("cast_id", "business_date");

-- CreateIndex
CREATE INDEX "cti_cast_daily_store_id_business_date_idx" ON "cti_cast_daily"("store_id", "business_date");

-- CreateIndex
CREATE INDEX "cti_cast_daily_import_batch_id_idx" ON "cti_cast_daily"("import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "cti_cast_daily_business_date_store_id_cast_id_key" ON "cti_cast_daily"("business_date", "store_id", "cast_id");

-- CreateIndex
CREATE INDEX "import_errors_import_batch_id_level_idx" ON "import_errors"("import_batch_id", "level");

-- AddForeignKey
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_import_source_id_fkey" FOREIGN KEY ("import_source_id") REFERENCES "import_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cti_cast_daily" ADD CONSTRAINT "cti_cast_daily_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cti_cast_daily" ADD CONSTRAINT "cti_cast_daily_cast_id_fkey" FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cti_cast_daily" ADD CONSTRAINT "cti_cast_daily_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
