# Phase H H9 Production Credential Mount

## Scope

The Production app container can now read the Production Google Service Account credential through a read-only bind mount. Google Drive automation remains disabled; this change does not enable polling, cron, Import execution, or Production Folder Mapping.

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
```

`GOOGLE_DRIVE_AUTOMATION_ENABLED=true` is intentionally not configured yet.

## Not configured in H9

- No Production Folder ID is placed in Compose or environment variables.
- No Production `DriveFolderMapping` is registered.
- No cron or scheduler is enabled.
- No Import Pipeline execution or AUTO confirmation is enabled.
- No Production deploy or container recreation is performed by this change.

## Operational checks for the next rollout

Before a separately approved deployment, verify the host secret directory and file permissions, then validate Compose configuration without printing secret contents. After deployment, confirm only that the container can read the configured path; do not expose the JSON, private key, or Folder IDs in health responses or logs.
