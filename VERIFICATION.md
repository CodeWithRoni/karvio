# Review fixes — verification (15 November 2026, not yet pushed)

- 17 November 2026, three fixes (type switch flicker, profile over the edit form, supplier warranty from the stock report): npm test, test:supabase, test:performance, build and 184/184 Playwright tests passed locally.
- 17 November 2026, Collection / Payment pages and purchase detail layout: npm test, build and 180/180 Playwright tests passed locally. With the next payment date: npm test, test:supabase, test:performance (features-6.mjs: 13 checks), build and 181 Playwright tests passed (one test's dialog locator was made exact after it matched two windows).
- 16 November 2026, supplier rebates: npm test, test:supabase, test:performance (features-5.mjs: 35 checks), build and 178/178 Playwright tests passed locally.
- 16 November 2026, five features (slow stock, owner's money, day lock, WhatsApp, devices & logins): npm test, test:supabase, test:performance (features-4.mjs: 33 checks), build and 176/176 Playwright tests passed locally.
- 16 November 2026, review fixes (missed monthly expenses, date typing, reminder count): npm test, test:supabase, test:performance (features-3.mjs: 23 checks), build and 171/171 Playwright tests passed locally.
- 15 November 2026, lakh / date / due reminder: npm test, test:supabase, test:performance (adds features-3.mjs: 11 checks), build and 168 of 169 Playwright tests passed in the full run (adds features-3.spec.js); stream-backup.spec.js failed only inside the full run (also before these changes) and passes on its own.
- 15 November 2026, features-2: npm test, test:supabase, test:performance (adds features-2.mjs: 35 checks), build and 164/164 Playwright tests (adds features-2.spec.js) passed locally.

- 15 November 2026, ui-pro-1: npm test, test:supabase, test:performance (adds day-close-statements.mjs: 31 checks), build and 158/158 Playwright tests (adds ui-pro.spec.js) passed locally.

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
