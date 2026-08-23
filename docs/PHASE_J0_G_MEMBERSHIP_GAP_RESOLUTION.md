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
