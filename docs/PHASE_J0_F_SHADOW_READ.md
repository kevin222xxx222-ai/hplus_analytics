# Phase J0-F Shadow Read / Legacy Comparison

Status: IMPLEMENTED / READ-ONLY

J0-F compares Legacy Cast state with `CastStoreMembership` without changing Resolver, Analytics, Cast, Membership, Alias, Listing, Fact, or Import rows.

## Comparison scope

Comparison unit is `Cast × Store × businessDate`.

Legacy uses `Cast.status`, `startedOn`, `endedOn`, and `primaryStoreId`. Membership uses store-scoped `joinedAt`, `leftAt`, and `ACTIVE` / `ON_LEAVE` / `LEFT`. `joinedAt=NULL` is treated as `UNKNOWN_DATE` for historical dates and is not backfilled or inferred.

The `leftAt` boundary is inclusive: the Cast is considered present on the left date.

## CLI

```text
npm run memberships:shadow-audit
```

The CLI prints a current read-only snapshot and difference classifications. It does not write JSON or update the database by default.

Snapshot includes Cast totals, Membership presence, ACTIVE/ON_LEAVE/LEFT counts, multi-store ACTIVE Casts, Legacy ACTIVE/INACTIVE counts, and difference examples.

## Difference classifications

- `MATCH`
- `LEGACY_ACTIVE_MEMBERSHIP_INACTIVE`
- `LEGACY_INACTIVE_MEMBERSHIP_ACTIVE`
- `STORE_SCOPE_DIFFERENCE`
- `PRIMARY_STORE_DIFFERENCE`
- `MEMBERSHIP_MISSING`
- `REENTRY_DIFFERENCE`
- `UNKNOWN_DATE`

`primaryStoreId` is a Legacy display scope and is not expected to equal every ACTIVE Membership store.

## Resolver / Analytics impact audit

Current Town/CTI/Heaven resolution and existing Analytics queries still use Legacy Cast dates/status and Alias periods. J0-F does not switch them. Membership adoption would change historical inclusion for NULL `joinedAt`, store-specific re-entry, ON_LEAVE handling, and Cast-wide Legacy status. These differences must be reviewed before any read-path cutover.

Priority consumers for the next comparison are headcount, ranking populations, Cast Diagnosis, Cast Trend, Diary, integrated Analytics, newcomer classification, and attendance rate.

## Production safety

Run the CLI manually in Production only as a read-only audit. No automatic repair, Membership creation, Cast update, Resolver switch, Analytics switch, or Import behavior change is part of J0-F.
