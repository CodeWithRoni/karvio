# Production hardening — current verification

Owner authorized publication. This record describes the prepared patch; see GitHub Actions for rollout completion. No historical business-row rewrite.

```json
{
  "baseCommit": "944cf5589ad7d3a76d06536dad55214d955f8f83",
  "state": "owner-authorized-deployment",
  "regularRegression": "passed",
  "hostedRegression": "passed",
  "postgresProtocol2": "passed",
  "productionConfig": "passed",
  "deidentifiedBackupRehearsal": "29 tables / 609 rows preserved; scoped reads and sale/cancellation passed",
  "liveOrphanPreflight": "zero",
  "browserTests": 150,
  "productionBuild": "passed",
  "liveSchemaChanged": false,
  "migrationsPrepared": 2,
  "fullScaleReady": false,
  "offsiteBackupActive": false,
  "nativeInstallersRebuilt": false
}
```

Evidence: verification/production-fixes/{regular-final.log,hosted-final.log,postgres.log,browser-final.log,build.log}. New maintained tests: backend/test/production-storage.mjs and production-config.cjs.

The first full browser run had one intentionally strengthened credential-policy fixture still using a short password. It now asserts short-password rejection and valid long-password creation; the final full run passed all 150. PostgreSQL tests include atomic row-only saves, unchanged invoice row versions, two concurrent sales/retry, serial purchase/sale/customer return/supplier return, backup restore, orphan-line rejection, snapshot retention, anonymous token-rotation limits, scoped login, lightweight ping and persisted confirmation lockout. A 10,000-row delta fixture is not a production capacity benchmark.

See [remaining architecture work](docs/PRODUCTION-READINESS.md). Historical verification is archived under docs/archive/.
