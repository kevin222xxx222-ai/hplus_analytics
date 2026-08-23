CREATE TYPE "CastMembershipReviewClassification" AS ENUM ('EXPECTED_NON_REGULAR', 'MEMBERSHIP_REQUIRED', 'REENTRY_REQUIRED', 'DATA_CONFLICT', 'OTHER_REVIEW');

CREATE TABLE "cast_store_membership_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cast_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "classification" "CastMembershipReviewClassification" NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence_snapshot" JSONB,
    "confirmed_by_user_id" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cast_store_membership_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cast_store_membership_reviews_cast_id_store_id_is_active_idx" ON "cast_store_membership_reviews"("cast_id", "store_id", "is_active");
CREATE INDEX "cast_store_membership_reviews_classification_is_active_idx" ON "cast_store_membership_reviews"("classification", "is_active");
CREATE UNIQUE INDEX "cast_store_membership_reviews_active_unique" ON "cast_store_membership_reviews"("cast_id", "store_id") WHERE "is_active" = true;

ALTER TABLE "cast_store_membership_reviews"
ADD CONSTRAINT "cast_store_membership_reviews_cast_id_fkey"
FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cast_store_membership_reviews"
ADD CONSTRAINT "cast_store_membership_reviews_store_id_fkey"
FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cast_store_membership_reviews"
ADD CONSTRAINT "cast_store_membership_reviews_confirmed_by_user_id_fkey"
FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
