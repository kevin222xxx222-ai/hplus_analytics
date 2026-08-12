#!/usr/bin/env bash
set -Eeuo pipefail

readonly DEPLOY_DIR="/opt/hplus-analytics"
readonly BACKUP_DIR="backups"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[[ "$(pwd)" == "$DEPLOY_DIR" ]] || fail "実行ディレクトリは ${DEPLOY_DIR} である必要があります。"
[[ -d "$BACKUP_DIR" ]] || fail "${BACKUP_DIR}/ がありません。"

retention_days="${BACKUP_RETENTION_DAYS:-14}"
apply=0
for arg in "$@"; do
  case "$arg" in
    --apply) apply=1 ;;
    ''|*[!0-9]*) fail "保持日数は正の整数で指定してください: ${arg}" ;;
    *) retention_days="$arg" ;;
  esac
done
[[ "$retention_days" =~ ^[1-9][0-9]*$ ]] || fail "BACKUP_RETENTION_DAYSは1以上の整数で指定してください。"

# Linux VPS production uses GNU find. Restrict the scan to direct regular
# files under backups/ and the two exact backup filename families.
mapfile -t old_files < <(find -P "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'hplus_analytics_*.dump' -o -name 'hplus_analytics_*.dump.sha256' \) -mtime "+${retention_days}" -print | sort)

latest_dump=""
mapfile -t dump_files < <(find -P "$BACKUP_DIR" -maxdepth 1 -type f -name 'hplus_analytics_*.dump' -print)
if (( ${#dump_files[@]} > 0 )); then
  latest_dump="$(for file in "${dump_files[@]}"; do stat -c '%Y %n' "$file"; done | sort -nr | head -n 1 | cut -d' ' -f2-)"
fi

if [[ -n "$latest_dump" ]]; then
  latest_checksum="${latest_dump}.sha256"
  filtered_files=()
  for file in "${old_files[@]}"; do
    [[ "$file" == "$latest_dump" || "$file" == "$latest_checksum" ]] && continue
    filtered_files+=("$file")
  done
  old_files=("${filtered_files[@]}")
fi

printf 'Backup retention: %s days\n' "$retention_days"
printf 'Mode: %s\n' "$([[ "$apply" == 1 ]] && echo apply || echo dry-run)"
printf 'Latest dump protected: %s\n' "${latest_dump:-none}"
printf 'Deletion candidates:\n'
if (( ${#old_files[@]} == 0 )); then
  printf '  (none)\n'
else
  printf '  %s\n' "${old_files[@]}"
fi

if (( apply == 0 )); then
  printf 'Dry-run only. Re-run with --apply to delete the listed files.\n'
  exit 0
fi

deleted=0
for file in "${old_files[@]}"; do
  [[ -f "$file" ]] || fail "削除対象が通常ファイルではありません: ${file}"
  rm -- "$file"
  deleted=$((deleted + 1))
  printf 'Deleted: %s\n' "$file"
done
printf 'Deleted files: %s\n' "$deleted"
