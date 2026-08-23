-- Re-entry keeps the current MediaListing row while preserving its prior period.
CREATE TABLE "media_listing_histories" (
  "id" UUID NOT NULL,
  "cast_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "media_type" "MediaType" NOT NULL,
  "listed_from" DATE,
  "listed_to" DATE,
  "source" VARCHAR(100),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_listing_histories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_listing_histories_cast_id_fkey" FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "media_listing_histories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "media_listing_histories_cast_id_store_id_media_type_idx" ON "media_listing_histories"("cast_id", "store_id", "media_type");
CREATE INDEX "media_listing_histories_listed_from_listed_to_idx" ON "media_listing_histories"("listed_from", "listed_to");
