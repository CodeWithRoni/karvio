# Review fixes — verification (15 November 2026, not yet pushed)

- 15 November 2026, second review fixes: npm test, test:supabase, test:performance (adds review-fixes-2.mjs: 15 checks), build and 151/151 Playwright tests passed locally.

- npm test, test:supabase (now starts with write-actions.mjs) and test:performance (adds request-limits.mjs, payment-amounts.mjs) passed; tests call the database as service_role.
- Browser suite: 151 cases; stream-backup.spec.js failed once with Playwright "Response has been disposed" in its route mock and passed on rerun (test flakiness, not app behaviour).
- scripts/trace-table-hints.mjs: hints unchanged (53 actions, 15 append-only, 29 with receipts).

# Bounded reads and backups — publication verification

Owner authorized push/deployment on 15 November 2026. No business-row reset or restore is performed by this rollout.

```json
{
  "baseCommit": "4d1bd6a264dc3f8ea4e7869c352285c3147bcac4",
  "state": "owner-authorized-deployment",
  "regularRegression": "passed",
  "hostedRegression": "passed",
  "scopedSqlParity": "passed: 7 actions",
  "largeBackupRows": 18000,
  "largeBackupPages": 83,
  "maxRpcBytes": 267524,
  "browserTests": 151,
  "productionBuild": "passed",
  "migrationsPrepared": 2,
  "fullScaleReady": false,
  "globalLockRemoved": false,
  "nativeInstallersRebuilt": false
}
```

150 existing browser cases plus one new stream UI case passed. The UI case mocks transfer responses; native SQL/real-handler and gzip helper tests separately exercise the full transfer path. See docs/BOUNDED-BACKUPS.md for limits and remaining architecture work.
