#!/usr/bin/env bash
set -Eeuo pipefail

readonly DEPLOY_DIR="/opt/hplus-analytics"
readonly ENV_FILE=".env.production"
readonly COMPOSE_FILE="docker-compose.production.yml"
readonly HEALTH_URL="http://127.0.0.1:3001/api/health"
readonly HEALTH_RETRIES=30
readonly HEALTH_WAIT_SECONDS=2

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[[ "$(pwd)" == "$DEPLOY_DIR" ]] || fail "実行ディレクトリは ${DEPLOY_DIR} である必要があります。"
[[ -f "$ENV_FILE" ]] || fail "${ENV_FILE} がありません。"
[[ -f "$COMPOSE_FILE" ]] || fail "${COMPOSE_FILE} がありません。"

branch="$(git branch --show-current)"
[[ "$branch" == "main" ]] || fail "main以外のbranchではdeployできません（現在: ${branch:-detached}）。"

status="$(git status --porcelain --untracked-files=no)"
[[ -z "$status" ]] || fail "tracked fileに未コミット変更があります。"

start_commit="$(git rev-parse HEAD)"
printf 'Deploy start commit: %s\n' "$start_commit"

git fetch origin
git pull --ff-only origin main

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
"${compose[@]}" config --quiet
"${compose[@]}" build app
"${compose[@]}" up -d db

db_id="$("${compose[@]}" ps -q db)"
[[ -n "$db_id" ]] || fail "DBコンテナが起動していません。"
for _ in $(seq 1 "$HEALTH_RETRIES"); do
  db_health="$(docker inspect --format '{{.State.Health.Status}}' "$db_id" 2>/dev/null || true)"
  [[ "$db_health" == "healthy" ]] && break
  sleep "$HEALTH_WAIT_SECONDS"
done
[[ "${db_health:-}" == "healthy" ]] || fail "DBがhealthyになりませんでした（状態: ${db_health:-unknown}）。"

"${compose[@]}" run --rm --no-deps -T app npx prisma migrate deploy
"${compose[@]}" up -d app
"${compose[@]}" ps

health_file="$(mktemp)"
cleanup() { rm -f "$health_file"; }
trap cleanup EXIT
health_code=""
health_body=""
for _ in $(seq 1 "$HEALTH_RETRIES"); do
  health_code="$(curl -sS -o "$health_file" -w '%{http_code}' "$HEALTH_URL" || true)"
  health_body="$(cat "$health_file" 2>/dev/null || true)"
  if [[ "$health_code" == "200" ]] && grep -q '"status":"ok"' <<<"$health_body" && grep -q '"database":"connected"' <<<"$health_body"; then
    break
  fi
  sleep "$HEALTH_WAIT_SECONDS"
done

if [[ "$health_code" != "200" ]] || ! grep -q '"status":"ok"' <<<"$health_body" || ! grep -q '"database":"connected"' <<<"$health_body"; then
  printf 'Health check failed (HTTP %s): %s\n' "$health_code" "$health_body" >&2
  exit 1
fi

printf 'Deploy commit: %s\n' "$(git rev-parse HEAD)"
printf 'Health (%s): %s\n' "$HEALTH_URL" "$health_body"
