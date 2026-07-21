CREATE TABLE "cast_start_date_bulk_change_histories" (
    "id" UUID NOT NULL,
    "target_date" DATE NOT NULL,
    "media_scope" VARCHAR(20) NOT NULL,
    "cast_changes" JSONB NOT NULL,
    "alias_changes" JSONB NOT NULL,
    "cast_count" INTEGER NOT NULL,
    "alias_count" INTEGER NOT NULL,
    "changed_by_user_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,

    CONSTRAINT "cast_start_date_bulk_change_histories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cast_start_date_bulk_change_histories_changed_at_idx"
ON "cast_start_date_bulk_change_histories"("changed_at");

CREATE INDEX "cast_start_date_bulk_change_histories_changed_by_user_id_changed_at_idx"
ON "cast_start_date_bulk_change_histories"("changed_by_user_id", "changed_at");

ALTER TABLE "cast_start_date_bulk_change_histories"
ADD CONSTRAINT "cast_start_date_bulk_change_histories_changed_by_user_id_fkey"
FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
