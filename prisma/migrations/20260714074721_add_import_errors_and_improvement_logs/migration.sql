-- CreateEnum
CREATE TYPE "ImportErrorLevel" AS ENUM ('WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "ImportErrorStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ImprovementType" AS ENUM ('EXPOSURE_SHORTAGE', 'PAGE_CONVERSION_DECLINE', 'REPEAT_IMPROVEMENT', 'ATTENDANCE_OPPORTUNITY_LOSS', 'SHARP_DECLINE', 'GROWING');

-- CreateEnum
CREATE TYPE "ImprovementLogStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "import_errors" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "import_source_id" UUID,
    "file_name" VARCHAR(255) NOT NULL,
    "file_hash" CHAR(64),
    "sheet_name" VARCHAR(255),
    "row_number" INTEGER,
    "column_name" VARCHAR(255),
    "error_code" VARCHAR(100) NOT NULL,
    "level" "ImportErrorLevel" NOT NULL DEFAULT 'ERROR',
    "status" "ImportErrorStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "raw_data" JSONB,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "improvement_logs" (
    "id" UUID NOT NULL,
    "cast_id" UUID,
    "store_id" UUID,
    "type" "ImprovementType" NOT NULL,
    "status" "ImprovementLogStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" VARCHAR(160) NOT NULL,
    "message" TEXT NOT NULL,
    "rule_version" VARCHAR(50) NOT NULL,
    "observed_from" DATE NOT NULL,
    "observed_to" DATE NOT NULL,
    "detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence" JSONB,
    "comparison_context" JSONB,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "improvement_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_errors_run_id_idx" ON "import_errors"("run_id");

-- CreateIndex
CREATE INDEX "import_errors_import_source_id_status_idx" ON "import_errors"("import_source_id", "status");

-- CreateIndex
CREATE INDEX "import_errors_file_hash_idx" ON "import_errors"("file_hash");

-- CreateIndex
CREATE INDEX "import_errors_status_created_at_idx" ON "import_errors"("status", "created_at");

-- CreateIndex
CREATE INDEX "improvement_logs_cast_id_status_detected_at_idx" ON "improvement_logs"("cast_id", "status", "detected_at");

-- CreateIndex
CREATE INDEX "improvement_logs_store_id_type_status_idx" ON "improvement_logs"("store_id", "type", "status");

-- CreateIndex
CREATE INDEX "improvement_logs_observed_from_observed_to_idx" ON "improvement_logs"("observed_from", "observed_to");

-- AddForeignKey
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_import_source_id_fkey" FOREIGN KEY ("import_source_id") REFERENCES "import_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_logs" ADD CONSTRAINT "improvement_logs_cast_id_fkey" FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_logs" ADD CONSTRAINT "improvement_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
