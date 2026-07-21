CREATE TABLE "cast_name_histories" (
    "id" UUID NOT NULL,
    "cast_id" UUID NOT NULL,
    "old_name" VARCHAR(100) NOT NULL,
    "new_name" VARCHAR(100) NOT NULL,
    "changed_by_user_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "cast_name_histories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cast_name_histories_cast_id_changed_at_idx" ON "cast_name_histories"("cast_id", "changed_at");
CREATE INDEX "cast_name_histories_changed_by_user_id_idx" ON "cast_name_histories"("changed_by_user_id");

ALTER TABLE "cast_name_histories"
ADD CONSTRAINT "cast_name_histories_cast_id_fkey"
FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cast_name_histories"
ADD CONSTRAINT "cast_name_histories_changed_by_user_id_fkey"
FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
