# Phase H H8: Lock and Retry Automation

## Purpose

H8 adds a safe, one-shot polling foundation to H7. It prevents overlapping scans, records retry metadata, and emits cron-friendly structured logs. Import execution remains disabled: dispatch is always `RESOLVE_ONLY`, no `ImportBatch` is created, and no AUTO confirmation occurs.

## Advisory locks

PostgreSQL advisory locks are the concurrency boundary; `DriveFileState.status` is not used as a lock. A deterministic SHA-256-derived pair of signed 32-bit keys is used with `pg_try_advisory_lock(integer, integer)`. Lock acquisition never waits. A busy lock returns a safe skip and the connection is always unlocked and closed in `finally`.

H8 adopts both:

- Global lock: `HPLUS_DRIVE_SCAN_LOCK`, preventing overlapping cron scans.
- File lock: `HPLUS_DRIVE_FILE:<driveFileId>`, protecting each file if a caller processes files outside the global scan.

The global lock is intentionally lightweight and avoids duplicate folder scans during a slow run; the file lock remains an explicit invariant for future parallelism.

## Retry policy

`DriveFileState.retryCount`, `nextRetryAt`, `lastErrorCategory`, and `FAILED_RETRYABLE` are used. Retryable download/transient failures use this schedule:

`listPendingDriveFileStates()` is the broad processing-candidate query used by the scan. `listRetryPendingDriveFileStates()` is the observability/retry-only query used by `drive:poll-once`; it counts only `FAILED_RETRYABLE` rows whose `nextRetryAt` is null or due.

| Retry number | Delay |
| ---: | ---: |
| 1 | 5 minutes |
| 2 | 15 minutes |
| 3 | 60 minutes |
| 4 | 6 hours |
| 5 | `FAILED_FINAL` |

`TRANSIENT_API`, `RATE_LIMIT`, `DOWNLOAD`, and temporary `DISK` failures may be retryable. Authentication, permission, validation, unsupported, and other final failures must not be retried automatically. A pending query includes only `DETECTED`, `READY`, and due `FAILED_RETRYABLE` rows (`nextRetryAt <= now`; a null retry time is immediately eligible).

## Poll flow

1. Verify the automation environment.
2. Acquire the global advisory lock; busy means successful safe skip.
3. Query pending state rows.
4. Run the H7 active-mapping folder scan.
5. Acquire a file lock before processing each file.
6. Detect/upsert, download, hash, transition to `READY`, and resolve with `RESOLVE_ONLY`.
7. Record retry metadata on file-level failures and continue with other files.
8. Clean temporary files and emit a summary.

There is no resident worker, queue, Drive write, archive/error move, migration, seed, or Production rollout in H8.

## CLI and cron example

```bash
GOOGLE_DRIVE_AUTOMATION_ENV=development \
GOOGLE_DRIVE_CREDENTIALS_PATH=/secure/path/service-account.json \
npm run drive:poll-once
```

The command runs once and exits, so it can later be scheduled every ten minutes:

```cron
*/10 * * * * cd /opt/hplus-analytics && GOOGLE_DRIVE_AUTOMATION_ENV=production GOOGLE_DRIVE_AUTOMATION_ENABLED=true npm run drive:poll-once >> /var/log/hplus-drive-poll.log 2>&1
```

Do not register this cron or configure Production credentials as part of H8.

## Logging and exit codes

The CLI writes one JSON object per lifecycle event with timestamp, environment, counts, duration, result, and a concise error. Credentials, private keys, and folder IDs are never logged.

- `0`: scan completed, no files, or global lock safely skipped.
- `1`: authentication, database, mapping/folder, or other fatal error.

File-level retryable failures do not stop the scan; they are included in `failed` and recorded in `DriveFileState`.

## Production enablement and H9 conditions

Production requires both an explicit Production environment and `GOOGLE_DRIVE_AUTOMATION_ENABLED=true`; neither is configured here. H9 must still define credential deployment, Production mappings, cron installation, alerting/metrics, operational rollback, and a canary/approval process. Import execution must remain separately approved.
