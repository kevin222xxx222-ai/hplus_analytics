# Phase D-2.7 QA Automation Infrastructure

## Scope

This infrastructure validates release candidates without changing Analytics Engine, Integration, API, Prisma, migrations, or business data.

## Commands

- `npm run qa:e2e`: Playwright smoke and responsive checks
- `npm run qa:a11y`: axe critical/serious accessibility checks
- `npm run qa:visual`: screenshot baseline update/verification
- `npm run qa:gate`: lint, typecheck, unit/integration, and Playwright release gate

Authenticated runs require `QA_LOGIN_ID` and `QA_LOGIN_PASSWORD`. The base URL is controlled by `PLAYWRIGHT_BASE_URL`; an already-running app can be used with `PLAYWRIGHT_SKIP_WEBSERVER=1`.

## Viewports

The shared presets are 1920, 1440, 1280, 1024, 768, and 390 pixels. Tests use `QA_VIEWPORTS` from `playwright.config.ts` rather than repeating dimensions.

## Evidence

Playwright stores traces, screenshots, videos, and JSON results under `qa-artifacts/`. The release gate writes `qa-artifacts/release-gate.json` and `docs/QA_REPORT.md`.

## Gate semantics

- `PASS`: all required gates passed.
- `FAIL`: a required gate ran and failed.
- `BLOCKED`: a required gate could not run and `QA_ALLOW_BLOCKED=1` was explicitly supplied.

Critical and serious axe violations fail the accessibility suite. Console errors, page errors, failed requests, and HTTP 4xx/5xx responses are captured as test evidence.

## Limitations

Visual snapshots require an approved baseline committed under the Playwright snapshot directory. Authenticated CI requires a secret-provided QA account; no production credentials are stored in the repository.
