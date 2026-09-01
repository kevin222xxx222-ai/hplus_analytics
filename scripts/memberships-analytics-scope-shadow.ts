/**
 * H4 deliberately has no synthetic baseline. Existing Analytics readers are
 * historical fact readers; until a true current-roster reader is identified,
 * this command reports that no safe shadow target exists.
 */

async function runAnalyticsScopeAudit() {
  console.log(JSON.stringify({ mode: "audit", readOnly: true, status: "ANALYTICS_CURRENT_SCOPE_AUDIT_COMPLETE", conclusion: "NO_SAFE_CURRENT_ROSTER_READER_FOUND", historicalFactScope: "UNCHANGED", membershipShadow: "DEFERRED", excludedApproach: "ALL_HISTORY_FACT_SCOPE", reason: "Historical fact readers must not be compared as current roster and must not be filtered by current Membership." }, null, 2));
}

runAnalyticsScopeAudit().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
