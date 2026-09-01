# J2 Evidence Resolution

J1のHuman Review backlogをRead-onlyで横断監査する。Current Membership、Alias、MediaListing、最新成功Town CAST、Cast lifecycle、merge状態をStore単位で評価し、終了日を推測しない。

分類：`EXACT_CLOSE_DATE_CONFIRMED`、`CLOSE_DATE_RANGE_CONFIRMED`、`RETIRED_MARKER_SUPPORTED`、`RETIRED_MARKER_CONFLICT`、`CURRENT_EVIDENCE_STALE_MEDIA_ONLY`、`POSSIBLE_MEMBERSHIP_GAP`、`DUPLICATE_OR_ALIAS_COLLISION`、`INSUFFICIENT_EVIDENCE`。現行Previewは全件をHuman Reviewとして出力し、自動Repairは行わない。Historical Fact単独、最終Town出現日、今日の日付からclose dateを生成しない。

実行：`npm run memberships:j2-evidence-preview`。ProductionではRead-only Canaryのみを行い、結果の再現性（`runAComparedToRunBChangedRows=0`）を確認する。
