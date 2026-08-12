#!/usr/bin/env bash
set -Eeuo pipefail

readonly DEPLOY_DIR="/opt/hplus-analytics"
readonly ENV_FILE=".env.production"
readonly COMPOSE_FILE="docker-compose.production.yml"
readonly MIN_DUMP_BYTES=1024

stage="initialization"
pre_restore_backup=""
target_dump=""
app_stopped=0

fail() {
  printf 'ERROR (stage: %s): %s\n' "$stage" "$*" >&2
  printf 'pre-restore backup: %s\n' "${pre_restore_backup:-not created}" >&2
  printf 'target dump: %s\n' "${target_dump:-not selected}" >&2
  exit 1
}

on_exit() {
  status=$?
  docker exec "${db_id:-}" rm -f "${container_dump:-}" >/dev/null 2>&1 || true
  if (( status != 0 )); then
    printf 'Restore stopped without automatic rollback. App stopped: %s\n' "$app_stopped" >&2
    printf 'Manual recovery must use the pre-restore backup after review.\n' >&2
  fi
}
trap on_exit EXIT

[[ "$(pwd)" == "$DEPLOY_DIR" ]] || fail "実行ディレクトリは ${DEPLOY_DIR} である必要があります。"
[[ -f "$ENV_FILE" ]] || fail "${ENV_FILE} がありません。"
[[ -f "$COMPOSE_FILE" ]] || fail "${COMPOSE_FILE} がありません。"
[[ $# -eq 1 ]] || fail "dumpファイルを1つ指定してください。"

target_dump="$1"
[[ "$target_dump" == *.dump ]] || fail "dumpファイルの拡張子は .dump である必要があります。"
[[ -f "$target_dump" ]] || fail "dumpファイルがありません: ${target_dump}"

target_dump="$(cd "$(dirname "$target_dump")" && pwd)/$(basename "$target_dump")"
checksum_path="${target_dump}.sha256"
[[ -f "$checksum_path" ]] || fail "checksumファイルが必須です: ${checksum_path}"

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
stage="compose validation"
"${compose[@]}" config --quiet || fail "Compose設定が不正です。"

stage="database inspection"
db_id="$("${compose[@]}" ps -q db)"
[[ -n "$db_id" ]] || fail "DBコンテナが起動していません。"
running="$(docker inspect --format '{{.State.Running}}' "$db_id" 2>/dev/null || true)"
[[ "$running" == "true" ]] || fail "DBコンテナが起動中ではありません。"
health="$(docker inspect --format '{{.State.Health.Status}}' "$db_id" 2>/dev/null || true)"
[[ "$health" == "healthy" ]] || fail "DBがhealthyではありません（状態: ${health:-unknown}）。"

file_size="$(wc -c < "$target_dump" | tr -d '[:space:]')"
[[ "$file_size" =~ ^[0-9]+$ ]] || fail "dumpサイズを取得できません。"
(( file_size >= MIN_DUMP_BYTES )) || fail "dumpが空、または異常に小さいです（${file_size} bytes）。"
dump_timestamp="$(stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S %Z' "$target_dump" 2>/dev/null || stat -c '%y' "$target_dump")"
db_size="$(docker exec "$db_id" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select pg_size_pretty(pg_database_size(current_database()))"')"

stage="checksum verification"
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$(dirname "$checksum_path")" && sha256sum -c "$(basename "$checksum_path")") || fail "SHA-256検証に失敗しました。"
elif command -v shasum >/dev/null 2>&1; then
  expected="$(awk '{print $1}' "$checksum_path")"
  actual="$(shasum -a 256 "$target_dump" | awk '{print $1}')"
  [[ -n "$expected" && "$expected" == "$actual" ]] || fail "SHA-256検証に失敗しました。"
else
  fail "SHA-256コマンド（sha256sum/shasum）がありません。"
fi

container_dump="/tmp/restore-$(basename "$target_dump").$$"

stage="archive inspection"
docker cp "$target_dump" "$db_id:$container_dump"
docker exec "$db_id" pg_restore -l "$container_dump" >/dev/null || fail "pg_restore -lによる事前検証に失敗しました。"

printf '\n対象DB: %s\n' "$(docker exec "$db_id" sh -c 'printf "%s" "$POSTGRES_DB"')"
printf '対象dump: %s\n' "$target_dump"
printf 'dumpサイズ: %s bytes\n' "$file_size"
printf 'dump timestamp: %s\n' "$dump_timestamp"
printf '現在DBサイズ: %s\n' "$db_size"
printf '\n破壊的なRestoreを実行します。既存public schemaは削除されます。\n'
printf '続行するには RESTORE と完全に入力してください: '
read -r confirmation
[[ "$confirmation" == "RESTORE" ]] || fail "確認語が一致しないため中止しました。"

stage="pre-restore backup"
backup_output="$(./scripts/backup-production.sh 2>&1)" || { printf '%s\n' "$backup_output" >&2; fail "pre-restore backupに失敗しました。"; }
printf '%s\n' "$backup_output"
pre_restore_backup="$(printf '%s\n' "$backup_output" | sed -n 's/^dump path: //p' | tail -n 1)"
[[ -n "$pre_restore_backup" && -f "$pre_restore_backup" ]] || fail "pre-restore backup pathを確認できません。"

stage="app stop"
"${compose[@]}" stop app || fail "app停止に失敗しました。"
app_stopped=1

stage="schema reset"
docker exec "$db_id" sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"' || fail "public schemaの再作成に失敗しました。"

stage="restore"
docker exec "$db_id" pg_restore --exit-on-error --no-owner --no-privileges -d "$(docker exec "$db_id" sh -c 'printf "%s" "$POSTGRES_DB"')" "$container_dump" || fail "pg_restoreに失敗しました。"

stage="post-restore database validation"
table_count="$(docker exec "$db_id" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from pg_catalog.pg_tables where schemaname = '\''public'\''"')"
[[ "$table_count" =~ ^[0-9]+$ && "$table_count" -gt 0 ]] || fail "public tableが存在しません。"
docker exec "$db_id" sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select 1 from pg_catalog.pg_tables where schemaname = '\''public'\'' and tablename = '\''_prisma_migrations'\''"' | grep -q 1 || fail "_prisma_migrationsが存在しません。"
"${compose[@]}" run --rm --no-deps -T app npx prisma migrate status || fail "migration status確認に失敗しました。"

stage="app start"
"${compose[@]}" start app || fail "app再起動に失敗しました。"
app_stopped=0
"${compose[@]}" ps

stage="health check"
health_body=""
health_code=""
for _ in $(seq 1 30); do
  health_body="$(curl -sS http://127.0.0.1:3001/api/health 2>/dev/null || true)"
  health_code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health 2>/dev/null || true)"
  if [[ "$health_code" == "200" ]] && grep -q '"database":"connected"' <<<"$health_body"; then break; fi
  sleep 2
done
[[ "$health_code" == "200" ]] || fail "healthcheckがHTTP 200ではありません。"
grep -q '"database":"connected"' <<<"$health_body" || fail "healthcheckのdatabaseがconnectedではありません。"

stage="completed"
printf 'Restore completed successfully.\n'
printf 'pre-restore backup: %s\n' "$pre_restore_backup"
printf 'restored dump: %s\n' "$target_dump"
printf 'public table count: %s\n' "$table_count"
printf 'health: %s\n' "$health_body"
