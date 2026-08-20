CREATE TYPE "CastMembershipStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'LEFT');

CREATE TYPE "CastMembershipSourceConfidence" AS ENUM ('CONFIRMED', 'INFERRED', 'UNKNOWN');

CREATE TABLE "cast_store_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cast_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "joined_at" DATE,
    "left_at" DATE,
    "status" "CastMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" VARCHAR(100),
    "source_confidence" "CastMembershipSourceConfidence",
    "note" TEXT,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cast_store_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cast_store_memberships_date_order_check" CHECK ("joined_at" IS NULL OR "left_at" IS NULL OR "joined_at" <= "left_at"),
    CONSTRAINT "cast_store_memberships_status_dates_check" CHECK (
      ("status" = 'LEFT' AND "left_at" IS NOT NULL)
      OR ("status" IN ('ACTIVE', 'ON_LEAVE') AND "left_at" IS NULL)
    )
);

CREATE INDEX "cast_store_memberships_cast_id_idx" ON "cast_store_memberships"("cast_id");
CREATE INDEX "cast_store_memberships_store_id_idx" ON "cast_store_memberships"("store_id");
CREATE INDEX "cast_store_memberships_cast_id_store_id_idx" ON "cast_store_memberships"("cast_id", "store_id");
CREATE INDEX "cast_store_memberships_status_idx" ON "cast_store_memberships"("status");
CREATE INDEX "cast_store_memberships_joined_at_idx" ON "cast_store_memberships"("joined_at");
CREATE INDEX "cast_store_memberships_left_at_idx" ON "cast_store_memberships"("left_at");
CREATE INDEX "cast_store_memberships_store_status_dates_idx" ON "cast_store_memberships"("store_id", "status", "joined_at", "left_at");

ALTER TABLE "cast_store_memberships"
ADD CONSTRAINT "cast_store_memberships_cast_id_fkey"
FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cast_store_memberships"
ADD CONSTRAINT "cast_store_memberships_store_id_fkey"
FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cast_store_memberships"
ADD CONSTRAINT "cast_store_memberships_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cast_store_memberships"
ADD CONSTRAINT "cast_store_memberships_updated_by_user_id_fkey"
FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
