-- CreateEnum
CREATE TYPE "DriveFolderMappingPriority" AS ENUM ('REQUIRED', 'OPTIONAL', 'FUTURE');

-- CreateTable
CREATE TABLE "drive_folder_mappings" (
    "id" UUID NOT NULL,
    "drive_folder_id" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "import_source_id" UUID NOT NULL,
    "store_id" UUID,
    "import_data_type" "ImportDataType" NOT NULL,
    "metric_hint" VARCHAR(100),
    "priority" "DriveFolderMappingPriority" NOT NULL DEFAULT 'REQUIRED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_future" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "drive_folder_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drive_folder_mappings_drive_folder_id_key" ON "drive_folder_mappings"("drive_folder_id");

-- CreateIndex
CREATE INDEX "drive_folder_mappings_import_source_id_idx" ON "drive_folder_mappings"("import_source_id");

-- CreateIndex
CREATE INDEX "drive_folder_mappings_is_active_is_future_idx" ON "drive_folder_mappings"("is_active", "is_future");

-- AddForeignKey
ALTER TABLE "drive_folder_mappings" ADD CONSTRAINT "drive_folder_mappings_import_source_id_fkey" FOREIGN KEY ("import_source_id") REFERENCES "import_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_folder_mappings" ADD CONSTRAINT "drive_folder_mappings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
