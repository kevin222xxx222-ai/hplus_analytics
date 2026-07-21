ALTER TABLE "casts"
ADD COLUMN "merged_into_cast_id" UUID,
ADD COLUMN "merged_at" TIMESTAMPTZ(3);

CREATE INDEX "casts_merged_into_cast_id_idx" ON "casts"("merged_into_cast_id");

ALTER TABLE "casts"
ADD CONSTRAINT "casts_merged_into_cast_id_fkey"
FOREIGN KEY ("merged_into_cast_id") REFERENCES "casts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "casts"
ADD CONSTRAINT "casts_merge_state_consistent"
CHECK (
  ("merged_into_cast_id" IS NULL AND "merged_at" IS NULL)
  OR
  ("merged_into_cast_id" IS NOT NULL AND "merged_at" IS NOT NULL)
);

ALTER TABLE "casts"
ADD CONSTRAINT "casts_cannot_merge_into_self"
CHECK ("merged_into_cast_id" IS NULL OR "merged_into_cast_id" <> "id");

CREATE TABLE "cast_merge_histories" (
    "id" UUID NOT NULL,
    "source_cast_id" UUID NOT NULL,
    "target_cast_id" UUID NOT NULL,
    "source_snapshot" JSONB NOT NULL,
    "target_snapshot_before" JSONB NOT NULL,
    "target_snapshot_after" JSONB NOT NULL,
    "conflict_summary" JSONB NOT NULL,
    "merged_by_user_id" UUID NOT NULL,
    "merged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "cast_merge_histories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cast_merge_histories_distinct_casts" CHECK ("source_cast_id" <> "target_cast_id")
);

CREATE INDEX "cast_merge_histories_source_cast_id_merged_at_idx" ON "cast_merge_histories"("source_cast_id", "merged_at");
CREATE INDEX "cast_merge_histories_target_cast_id_merged_at_idx" ON "cast_merge_histories"("target_cast_id", "merged_at");
CREATE INDEX "cast_merge_histories_merged_by_user_id_merged_at_idx" ON "cast_merge_histories"("merged_by_user_id", "merged_at");

ALTER TABLE "cast_merge_histories"
ADD CONSTRAINT "cast_merge_histories_source_cast_id_fkey"
FOREIGN KEY ("source_cast_id") REFERENCES "casts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cast_merge_histories"
ADD CONSTRAINT "cast_merge_histories_target_cast_id_fkey"
FOREIGN KEY ("target_cast_id") REFERENCES "casts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cast_merge_histories"
ADD CONSTRAINT "cast_merge_histories_merged_by_user_id_fkey"
FOREIGN KEY ("merged_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
