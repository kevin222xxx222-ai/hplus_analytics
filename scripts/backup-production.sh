#!/usr/bin/env bash
set -Eeuo pipefail

readonly DEPLOY_DIR="/opt/hplus-analytics"
readonly ENV_FILE=".env.production"
readonly COMPOSE_FILE="docker-compose.production.yml"
readonly MIN_DUMP_BYTES=1024

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[[ "$(pwd)" == "$DEPLOY_DIR" ]] || fail "実行ディレクトリは ${DEPLOY_DIR} である必要があります。"
[[ -f "$ENV_FILE" ]] || fail "${ENV_FILE} がありません。"
[[ -f "$COMPOSE_FILE" ]] || fail "${COMPOSE_FILE} がありません。"

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
"${compose[@]}" config --quiet

mkdir -p backups
chmod 700 backups 2>/dev/null || true

db_id="$("${compose[@]}" ps -q db)"
[[ -n "$db_id" ]] || fail "DBコンテナが起動していません。"

running="$(docker inspect --format '{{.State.Running}}' "$db_id" 2>/dev/null || true)"
[[ "$running" == "true" ]] || fail "DBコンテナが起動中ではありません。"

health="$(docker inspect --format '{{.State.Health.Status}}' "$db_id" 2>/dev/null || true)"
[[ "$health" == "healthy" ]] || fail "DBがhealthyではありません（状態: ${health:-unknown}）。"

timestamp="$(TZ=Asia/Tokyo date '+%Y%m%d_%H%M%S')"
dump_path="backups/hplus_analytics_${timestamp}.dump"
checksum_path="${dump_path}.sha256"

printf 'Creating PostgreSQL backup: %s\n' "$dump_path"
# POSTGRES_DB/POSTGRES_USER are read inside the Compose-managed DB container.
# --no-owner/--no-acl keeps restore independent from source role/privilege names.
docker exec -i "$db_id" sh -c 'pg_dump -Fc --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$dump_path"

file_size="$(wc -c < "$dump_path" | tr -d '[:space:]')"
[[ "$file_size" =~ ^[0-9]+$ ]] || fail "バックアップサイズを取得できませんでした。"
(( file_size >= MIN_DUMP_BYTES )) || fail "バックアップファイルが空、または異常に小さいです（${file_size} bytes）。"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$dump_path" > "$checksum_path"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$dump_path" > "$checksum_path"
else
  fail "SHA-256コマンド（sha256sum/shasum）がありません。"
fi

# Validate the archive using pg_restore in the same PostgreSQL image.
docker exec -i "$db_id" pg_restore -l - < "$dump_path" >/dev/null

printf 'Backup completed successfully.\n'
printf 'dump path: %s\n' "$dump_path"
printf 'file size: %s bytes\n' "$file_size"
printf 'SHA-256: %s\n' "$(awk '{print $1}' "$checksum_path")"
printf 'backup timestamp: %s\n' "$timestamp"
