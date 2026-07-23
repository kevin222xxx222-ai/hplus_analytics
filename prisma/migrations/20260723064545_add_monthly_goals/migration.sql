-- CreateEnum
CREATE TYPE "GoalScopeType" AS ENUM ('OVERALL', 'STORE');

-- CreateTable
CREATE TABLE "monthly_goals" (
    "id" UUID NOT NULL,
    "target_month" DATE NOT NULL,
    "scope_type" "GoalScopeType" NOT NULL,
    "scope_key" VARCHAR(120) NOT NULL,
    "store_id" UUID,
    "sales_target" DECIMAL(16,2),
    "contracts_target" INTEGER,
    "average_active_casts_target" DECIMAL(10,2),
    "nomination_rate_target" DECIMAL(8,5),
    "cast_payout_target" DECIMAL(16,2),
    "average_unit_price_target" DECIMAL(16,2),
    "working_hours_target" DECIMAL(12,2),
    "town_pv_target" INTEGER,
    "town_uu_target" INTEGER,
    "town_tel_target" INTEGER,
    "heaven_page_access_target" INTEGER,
    "note" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "monthly_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_goal_change_history" (
    "id" UUID NOT NULL,
    "monthly_goal_id" UUID NOT NULL,
    "before_values" JSONB,
    "after_values" JSONB NOT NULL,
    "changed_by_user_id" UUID NOT NULL,
    "reason" TEXT,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_goal_change_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monthly_goals_target_month_scope_type_idx" ON "monthly_goals"("target_month", "scope_type");

-- CreateIndex
CREATE INDEX "monthly_goals_store_id_target_month_idx" ON "monthly_goals"("store_id", "target_month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_goals_target_month_scope_key_key" ON "monthly_goals"("target_month", "scope_key");

-- CreateIndex
CREATE INDEX "monthly_goal_change_history_monthly_goal_id_changed_at_idx" ON "monthly_goal_change_history"("monthly_goal_id", "changed_at");

-- CreateIndex
CREATE INDEX "monthly_goal_change_history_changed_by_user_id_changed_at_idx" ON "monthly_goal_change_history"("changed_by_user_id", "changed_at");

-- AddForeignKey
ALTER TABLE "monthly_goals" ADD CONSTRAINT "monthly_goals_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_goals" ADD CONSTRAINT "monthly_goals_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_goals" ADD CONSTRAINT "monthly_goals_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_goal_change_history" ADD CONSTRAINT "monthly_goal_change_history_monthly_goal_id_fkey" FOREIGN KEY ("monthly_goal_id") REFERENCES "monthly_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_goal_change_history" ADD CONSTRAINT "monthly_goal_change_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
