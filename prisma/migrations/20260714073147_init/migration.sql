-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "StoreCode" AS ENUM ('KASUKABE', 'KOSHIGAYA', 'NODA');

-- CreateEnum
CREATE TYPE "CastStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('CTI', 'TOWN', 'HEAVEN');

-- CreateEnum
CREATE TYPE "AliasReviewStatus" AS ENUM ('PENDING', 'MAPPED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ImportSourceKind" AS ENUM ('MANUAL_UPLOAD', 'GOOGLE_DRIVE');

-- CreateEnum
CREATE TYPE "ImportDataType" AS ENUM ('CTI_CAST_REPORT', 'TOWN_STORE', 'TOWN_CAST', 'TOWN_URL', 'TOWN_LP', 'HEAVEN_STORE', 'HEAVEN_CAST');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "login_id" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255),
    "display_name" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "code" "StoreCode" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "short_name" VARCHAR(50) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "has_management_metrics" BOOLEAN NOT NULL DEFAULT true,
    "has_acquisition_metrics" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casts" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "normalized_name" VARCHAR(100) NOT NULL,
    "status" "CastStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_on" DATE NOT NULL,
    "ended_on" DATE,
    "primary_store_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "casts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cast_aliases" (
    "id" UUID NOT NULL,
    "media_type" "MediaType" NOT NULL,
    "alias_name" VARCHAR(100) NOT NULL,
    "normalized_alias" VARCHAR(100) NOT NULL,
    "review_status" "AliasReviewStatus" NOT NULL DEFAULT 'PENDING',
    "cast_id" UUID,
    "store_id" UUID,
    "valid_from" DATE,
    "valid_to" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cast_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_listings" (
    "id" UUID NOT NULL,
    "cast_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "media_type" "MediaType" NOT NULL,
    "is_listed" BOOLEAN NOT NULL DEFAULT true,
    "listed_from" DATE,
    "listed_to" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "media_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_sources" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "ImportSourceKind" NOT NULL DEFAULT 'MANUAL_UPLOAD',
    "media_type" "MediaType" NOT NULL,
    "data_type" "ImportDataType" NOT NULL,
    "metric_type" VARCHAR(100),
    "store_id" UUID,
    "folder_path" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "stores_code_key" ON "stores"("code");

-- CreateIndex
CREATE INDEX "casts_normalized_name_idx" ON "casts"("normalized_name");

-- CreateIndex
CREATE INDEX "casts_primary_store_id_status_idx" ON "casts"("primary_store_id", "status");

-- CreateIndex
CREATE INDEX "cast_aliases_review_status_idx" ON "cast_aliases"("review_status");

-- CreateIndex
CREATE INDEX "cast_aliases_cast_id_idx" ON "cast_aliases"("cast_id");

-- CreateIndex
CREATE UNIQUE INDEX "cast_aliases_media_type_store_id_normalized_alias_valid_fro_key" ON "cast_aliases"("media_type", "store_id", "normalized_alias", "valid_from");

-- CreateIndex
CREATE INDEX "media_listings_store_id_media_type_is_listed_idx" ON "media_listings"("store_id", "media_type", "is_listed");

-- CreateIndex
CREATE UNIQUE INDEX "media_listings_cast_id_store_id_media_type_key" ON "media_listings"("cast_id", "store_id", "media_type");

-- CreateIndex
CREATE INDEX "import_sources_media_type_data_type_store_id_idx" ON "import_sources"("media_type", "data_type", "store_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_sources_name_key" ON "import_sources"("name");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casts" ADD CONSTRAINT "casts_primary_store_id_fkey" FOREIGN KEY ("primary_store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cast_aliases" ADD CONSTRAINT "cast_aliases_cast_id_fkey" FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cast_aliases" ADD CONSTRAINT "cast_aliases_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_listings" ADD CONSTRAINT "media_listings_cast_id_fkey" FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_listings" ADD CONSTRAINT "media_listings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
