# Phase H H7: Development Manual One-Shot Drive Scan

## Purpose

H7 provides a deliberate, Development-only verification path for the H2-H6 Google Drive Automation components. It scans the active `DriveFolderMapping` folders once, records file metadata in `DriveFileState`, downloads files that require processing, and resolves their Import route for review. It does **not** execute an Import.

This command is not a scheduler, retry worker, lock manager, or Production operation.

## Command

```bash
GOOGLE_DRIVE_AUTOMATION_ENV=development \
GOOGLE_DRIVE_CREDENTIALS_PATH=/secure/path/service-account.json \
npm run drive:scan-once
```

The command uses the active H4 mappings in the database. It must not be run with Production credentials or folders. If `GOOGLE_DRIVE_AUTOMATION_ENV` is missing or not `development`, the command refuses to start.

## Scan flow

For every active, non-future mapping:

1. Verify the mapped folder and list direct children.
2. Ignore trashed files and Google Workspace-native files.
3. Upsert metadata through H5 `upsertDetectedDriveFile()`.
4. Classify the file as `NEW`, `UNCHANGED`, `CHANGED`, `RENAMED`, or `MOVED`.
5. Download only files that need a local representation (new files, or unchanged retryable/detected files) using the H3 temporary storage and SHA-256 calculation.
6. Transition `DETECTED → DOWNLOADING → READY`.
7. Resolve the H6 route with `mode: RESOLVE_ONLY`.
8. Remove the temporary local file after route resolution.

Changed files that are already `READY` are eligible for a fresh download; the scan never bypasses a state transition or approval policy.

## Output and safety

The CLI prints each file classification, state, download result, resolved pipeline/policy, and a summary containing mappings scanned, files seen, new/changed/unchanged counts, downloads, skips, review-required results, and failures. Every dispatched result is explicitly reported as `Import: NOT EXECUTED`.

Per-file download or state errors are isolated so other files can be inspected. Mapping/folder access errors are fatal to the scan. Temporary files are cleaned up in a `finally` block.

The command does not create an `ImportBatch`, call an Import pipeline, confirm AUTO imports, write to Drive, move files, delete database rows, run a scheduler/cron, retry, lock, or touch Production/driver-management resources.

## H8 hand-off

H7 is the final manual verification seam before an H8 scheduler/worker design. H8 must define scheduling, idempotency/locking, retry and failure policy, metrics/alerts, and Production authorization separately. A successful H7 run alone is not authorization to enable automatic Import.

## Verification status

Unit tests cover new/unchanged detection, download and cleanup, unsupported/trashed skips, per-file failure isolation, fatal folder failures, and `RESOLVE_ONLY` dispatch. A real Development Drive scan is an operator action and is reported separately; this implementation does not perform one automatically.
