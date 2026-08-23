# Phase J0-G Membership Gap Resolution

Status: AUDIT / PREVIEW ONLY

J0-G explains current Legacy-vs-Membership gaps before any Resolver or Analytics cutover. It does not create Memberships or modify Cast, Alias, Listing, Fact, or Import data.

## CLI

```text
npm run memberships:gap-audit
```

The CLI produces a complete JSON report under `artifacts/audits/` and prints summary counts. Candidate categories include `CURRENT_MEDIA_EVIDENCE`, `LEGACY_ACTIVE_NO_CURRENT_MEDIA`, `LEGACY_INACTIVE`, `DISPLAY_NAME_RETIRED_MARKER`, `STORE_EVIDENCE_UNKNOWN`, `HISTORICAL_ONLY`, and `MERGE_OR_DUPLICATE_CANDIDATE`.

`LEGACY_ACTIVE_MEMBERSHIP_INACTIVE` cells are also reported by Cast and Store. `PRIMARY_STORE_DIFFERENCE` is normally a documented Legacy display-scope difference; `PRIMARY_STORE_STALE` is reserved for a primary store with no current Membership.

## Resolution policy

Current Media Evidence produces a Membership candidate for human review only. No automatic Apply is performed. Retired markers, Legacy conflicts, absent evidence, historical-only Casts, and possible merges remain review categories.

Historical `UNKNOWN_DATE` is not repaired. A NULL `joinedAt` is not interpreted as an inferred historical start date.

## Cutover gate

J0-G is complete only when every current difference is classified as a valid Membership candidate, documented Legacy scope difference, non-current/historical Cast, or explicit review item. Resolver and Analytics remain on Legacy reads until that review is complete.

## G2 Current Membership Gap Apply

`npm run memberships:gap-audit` now includes a read-only Apply Preview. Only a Cast×Store row with positive current **Town CAST or CTI latest successful dataset evidence**, no Membership rows for that Cast, and a `CREATE_ACTIVE` decision is eligible. Heaven-only evidence, display-name markers, Legacy conflicts, no-evidence Casts, and all existing LEFT/ON_LEAVE/ACTIVE Membership cases remain excluded or require review. Existing LEFT rows are never treated as automatic re-entry.

The Preview reports candidate Cast×Store rows, unique Cast count, Town-only/CTI-only/Both evidence, store counts, and excluded/re-entry-review counts. The full candidate trace is written to the JSON audit artifact. Current evidence is recomputed at Apply time; the preview payload is not trusted.

The guarded operator command is:

```text
npm run memberships:gap-apply
```

Without both `--confirm=CONFIRM` and `MEMBERSHIP_GAP_APPLY_ENABLED=true`, this command is read-only. When explicitly enabled by an administrator, the server-side transaction rechecks evidence, acquires a per-Cast PostgreSQL advisory lock, and creates `ACTIVE` rows with `joinedAt=NULL`, `leftAt=NULL`, `source=MEDIA_EVIDENCE_GAP_RESOLUTION`, and `sourceConfidence=CONFIRMED`. Multiple stores for one Cast are applied atomically. Any changed candidate state or existing Membership aborts the transaction; no partial write is allowed.

Production Apply has not been run. The first Production operation is Preview only. After an approved Apply, rerun `memberships:gap-audit`, `memberships:shadow-audit`, and `memberships:date-range-audit`; Resolver, Analytics, Import, Cast, Alias, Listing, Fact, and legacy fields are not changed by G2.
