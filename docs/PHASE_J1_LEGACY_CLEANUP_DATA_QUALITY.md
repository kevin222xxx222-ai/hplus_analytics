# J1 Legacy Cleanup & Data Quality

J0完了後のLegacy/Data Quality backlogをRead-onlyで分類する基盤を追加した。`memberships:j1-cleanup-preview` / `memberships:j1-cleanup-audit` はCurrent Membership、Current Alias、Current MediaListing、最新成功Town CASTを用い、Historical Factだけでは現役判定しない。

分類は `MEMBERSHIP_DATA_GAP_CONFIRMED`、`STALE_ALIAS_ONLY`、`STALE_LISTING_ONLY`、`STALE_ALIAS_AND_LISTING`、`CURRENT_EVIDENCE_CONFLICT`、`MERGE_OR_DUPLICATE_RELATED`、`REVIEW_REQUIRED`、`SAFE_GLOBAL_INACTIVE_CANDIDATE`。safe inactiveはendedOnを推測せず、merged Cast・media conflictの自動修復も行わない。

J1 Applyは1 Cast単位・Human Confirm・`MEMBERSHIP_J1_CLEANUP_ENABLED=true`を要求し、現時点では明示的なresource/date repair planがないため安全停止する。Production Apply、Fact変更、Resolver/Analytics切替は行わない。
