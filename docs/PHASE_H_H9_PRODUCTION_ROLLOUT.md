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

The following is the recommended Production crontab entry. Register it manually on the VPS; this change does not modify the crontab.

```cron
*/10 * * * * cd /opt/hplus-analytics && docker exec hplus-analytics-app npm run drive:poll-once >> /var/log/hplus-drive-poll.log 2>&1
```

The log should be owned and readable by root only. It is separate from the backup logs. The global advisory lock and per-file advisory lock make overlapping polls exit safely without duplicate work.

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

## Not configured in H9

- No Production Folder ID is placed in Compose or environment variables.
- No Production `DriveFolderMapping` is registered.
- No cron entry is registered by Codex.
- No Import Pipeline execution or AUTO confirmation is enabled.
- No Production deploy or container recreation is performed by this change.

## Operational checks for the next rollout

Before a separately approved deployment, verify the host secret directory and file permissions, then validate Compose configuration without printing secret contents. After deployment, confirm only that the container can read the configured path; do not expose the JSON, private key, or Folder IDs in health responses or logs.
