# J1 Legacy Cleanup & Data Quality

J0完了後のLegacy/Data Quality backlogをRead-onlyで分類する基盤を追加した。`memberships:j1-cleanup-preview` / `memberships:j1-cleanup-audit` はCurrent Membership、Current Alias、Current MediaListing、最新成功Town CASTを用い、Historical Factだけでは現役判定しない。

分類は `MEMBERSHIP_DATA_GAP_CONFIRMED`、`STALE_ALIAS_ONLY`、`STALE_LISTING_ONLY`、`STALE_ALIAS_AND_LISTING`、`CURRENT_EVIDENCE_CONFLICT`、`MERGE_OR_DUPLICATE_RELATED`、`REVIEW_REQUIRED`、`SAFE_GLOBAL_INACTIVE_CANDIDATE`。safe inactiveはendedOnを推測せず、merged Cast・media conflictの自動修復も行わない。

J1 Applyは1 Cast単位・Human Confirm・`MEMBERSHIP_J1_CLEANUP_ENABLED=true`を要求し、現時点では明示的なresource/date repair planがないため安全停止する。Production Apply、Fact変更、Resolver/Analytics切替は行わない。

## J1 Final Close / Production Verified

J1: **AUTO-SAFE CLEANUP COMPLETE / PRODUCTION VERIFIED**。

Production最終結果：`j1TargetTotal=49`、`mediaConflictTotal=49`、`reviewRequired=49`、`safeInactiveTotal=0`、`applyEligibleRepairs=0`。safe inactive 8件は、`Cast.status`をACTIVEからINACTIVEへ変更するstatus-only Applyを完了した。`endedOn`、Membership、Alias、MediaListing、Fact、merge情報は変更していない。

Global Lifecycleは`mergedCurrentStateCandidates=0`、`safeInactiveCandidates=0`、`mergedP0=0`。Masters Current Rosterは春日部137、越谷82、OTHER 0、Membership determinism 0。Town CASTはMembership modeで`changedRows=0`、Legacy determinism 0、Historical datasetはLegacy fallbackを継続する。

Human Review backlogは49件で、内訳は`RETIRED_MARKER_CURRENT_EVIDENCE_CONFLICT=11`、`STALE_ALIAS_ONLY=12`、`STALE_LISTING_ONLY=1`、`STALE_ALIAS_AND_LISTING=25`。終了日の確定根拠がないため自動修復せず、J1 blockerではない継続Reviewとして保持する。次フェーズで明示的な日付根拠とHuman Confirmを伴う個別Repairを検討する。
