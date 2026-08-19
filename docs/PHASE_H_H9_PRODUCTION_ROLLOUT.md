# Phase H H9 Production Rollout

## Scope

The Production app container reads the Production Google Service Account credential through a read-only bind mount, and the Drive automation poll is enabled. The poll remains `RESOLVE_ONLY`: it detects, downloads, hashes, and resolves policy, but does not execute the Import Pipeline or AUTO confirmation.

## Paths

| Location | Path |
|---|---|
| VPS host | `/opt/hplus-analytics/secrets/google-drive-production-service-account.json` |
| App container | `/run/secrets/google-drive-production-service-account.json` |

The host file must remain outside Git, have restrictive ownership/permissions, and be present before a future container recreation. The Compose mount is read-only (`:ro`). The credential JSON and private key are never copied into the image or written to logs.

The app receives only this container path:

```text
GOOGLE_DRIVE_CREDENTIALS_PATH=/run/secrets/google-drive-production-service-account.json
GOOGLE_DRIVE_AUTOMATION_ENV=production
GOOGLE_DRIVE_AUTOMATION_ENABLED=true
```

Automation is enabled only for the Production poll process. Import execution remains disabled by dispatcher policy.

## Cron operation

The Production crontab entry is registered outside this repository. The formal entry is:

```cron
*/10 * * * * cd /opt/hplus-analytics && docker exec hplus-analytics-app npm run drive:poll-once >> /var/log/hplus-drive-poll.log 2>&1
```

The log is `/var/log/hplus-drive-poll.log` with mode `600`, separate from backup logs. The global advisory lock and per-file advisory lock make overlapping polls exit safely without duplicate work.

## Operations

Check the registered cron entry:

```bash
sudo crontab -l
```

Run one poll manually:

```bash
cd /opt/hplus-analytics
docker exec hplus-analytics-app npm run drive:poll-once
```

Stop polling by removing or commenting out the cron entry. A currently running poll can be stopped by stopping only the HPlus app container; do not use `docker compose down` and do not touch the driver-management environment.

Each successful poll continues to report `import: NOT_EXECUTED`. `READY` and policy resolution are the terminal outcomes for this rollout; no ImportBatch is created by the poll.

## Production verification record

The H9 Production rollout is verified on the XServer VPS with 4 GB RAM, 4 vCPU, and 150 GB NVMe. Production health is normal, PostgreSQL is healthy, and Nginx is active. The Docker builder uses `NODE_OPTIONS=--max-old-space-size=2560`; the Production image build succeeded and includes the Phase H CLI/runtime package.

The Phase H database migrations are applied (13 migrations total), including the `drive_folder_mappings` and `drive_file_states` tables. The Production credential is provided by the dedicated Service Account through the read-only container mount above, and the Production parent Folder connection was verified without recording credential contents or Folder IDs here.

The eight MVP Folder Mappings are registered and active (`priority=REQUIRED`, `isActive=true`, `isFuture=false`): CTI; Town Kasukabe store and cast; Town Koshigaya store and cast; Heaven Kasukabe Shop; Heaven Kasukabe Girl Access (`PAGE_ACCESS`); and Heaven Kasukabe Girl Diary (`DIARY_POSTS`).

Manual poll verification:

| Run | mappings | filesSeen | downloaded | skipped | reviewRequired | failed | retryPending | exit | import |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| First | 8 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | `NOT_EXECUTED` |
| Second | 8 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | `NOT_EXECUTED` |

The detected `女子別レポート_20260808.xlsx` reached `READY`; its SHA-256 and `lastDownloadedAt` are stored, with `retryCount=0`. The second run skipped the unchanged file. Cron execution was observed at 06:50 UTC with `mappings=8`, `filesSeen=1`, `downloaded=0`, `skipped=1`, `reviewRequired=0`, `failed=0`, `retryPending=0`, `exit=0`, and `import=NOT_EXECUTED`.

## Phase H v1 boundary

Production automation is released through the following boundary:

```text
Google Drive scan → detection → download → SHA-256 → DriveFileState
→ READY → Dispatcher RESOLVE_ONLY → exit
```

The Google Drive acquisition foundation is Production-operational. Real-data Import automation remains locked: the Import Pipeline is not executed, AUTO confirm is not executed, and the poll does not create ImportBatch records.

The following remain outside the released H9 scope: automatic Import Pipeline execution, AUTO confirmation, automatic ImportBatch creation, Town URL/LANDING, Heaven MyGirl/Mitene/Talk, the two Heaven notice sources, automatic Archive/Error movement, external monitoring/SLO, notifications, and an administration UI.

## Not configured in H9

- Production Folder IDs are stored through the existing DB mapping configuration, not Compose or documentation.
- Production `DriveFolderMapping` registration for the eight MVP folders is complete.
- Cron registration is an operational VPS task and is not managed by this repository.
- No Import Pipeline execution or AUTO confirmation is enabled.
- No Production deploy or container recreation is performed by this change.

## Operational checks for the next rollout

Before a separately approved deployment, verify the host secret directory and file permissions, then validate Compose configuration without printing secret contents. After deployment, confirm only that the container can read the configured path; do not expose the JSON, private key, or Folder IDs in health responses or logs.
