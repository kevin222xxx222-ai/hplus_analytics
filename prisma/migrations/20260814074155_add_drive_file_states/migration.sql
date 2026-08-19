-- CreateEnum
CREATE TYPE "DriveFileStatus" AS ENUM ('DETECTED', 'DOWNLOADING', 'READY', 'IMPORTING', 'IMPORTED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'UNMAPPED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "DriveFailureCategory" AS ENUM ('AUTH', 'PERMISSION', 'FOLDER_NOT_FOUND', 'FILE_NOT_FOUND', 'DOWNLOAD', 'CHECKSUM', 'VALIDATION', 'IMPORT', 'TRANSIENT_API', 'RATE_LIMIT', 'DISK', 'UNKNOWN');

-- CreateTable
CREATE TABLE "drive_file_states" (
    "id" UUID NOT NULL,
    "drive_file_id" VARCHAR(255) NOT NULL,
    "folder_id" VARCHAR(255) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(255) NOT NULL,
    "size_bytes" BIGINT,
    "drive_md5_checksum" CHAR(32),
    "sha256" CHAR(64),
    "drive_created_time" TIMESTAMPTZ(3) NOT NULL,
    "drive_modified_time" TIMESTAMPTZ(3) NOT NULL,
    "first_detected_at" TIMESTAMPTZ(3) NOT NULL,
    "last_detected_at" TIMESTAMPTZ(3) NOT NULL,
    "last_downloaded_at" TIMESTAMPTZ(3),
    "last_import_attempt_at" TIMESTAMPTZ(3),
    "last_imported_at" TIMESTAMPTZ(3),
    "status" "DriveFileStatus" NOT NULL DEFAULT 'DETECTED',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(3),
    "last_error_category" "DriveFailureCategory",
    "last_error_code" VARCHAR(100),
    "last_error_message" TEXT,
    "drive_folder_mapping_id" UUID,
    "last_import_batch_id" UUID,
    "last_successful_import_batch_id" UUID,
    "is_trashed" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "drive_file_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drive_file_states_drive_file_id_key" ON "drive_file_states"("drive_file_id");

-- CreateIndex
CREATE INDEX "drive_file_states_status_next_retry_at_idx" ON "drive_file_states"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "drive_file_states_folder_id_status_idx" ON "drive_file_states"("folder_id", "status");

-- CreateIndex
CREATE INDEX "drive_file_states_drive_folder_mapping_id_status_idx" ON "drive_file_states"("drive_folder_mapping_id", "status");

-- CreateIndex
CREATE INDEX "drive_file_states_drive_modified_time_last_detected_at_idx" ON "drive_file_states"("drive_modified_time", "last_detected_at");

-- AddForeignKey
ALTER TABLE "drive_file_states" ADD CONSTRAINT "drive_file_states_drive_folder_mapping_id_fkey" FOREIGN KEY ("drive_folder_mapping_id") REFERENCES "drive_folder_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_file_states" ADD CONSTRAINT "drive_file_states_last_import_batch_id_fkey" FOREIGN KEY ("last_import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_file_states" ADD CONSTRAINT "drive_file_states_last_successful_import_batch_id_fkey" FOREIGN KEY ("last_successful_import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
