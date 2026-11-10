# Karvio 1.2.0 — local patch verification

Date: 11 November 2026 (Asia/Dhaka). Current follow-up base: GitHub main `9d9ebcb8e4e628b57d824e29995fdc135e44845a`. The owner approved publication of these five financial fixes. Apps Script Version 41 was successfully deployed to the existing Web App URL after verifying editor contents against the tested source. No setup/reset or production transaction was run. Earlier sections below describe previous review stages. The original 1.0.6 record remains in VERIFICATION-1.0.6.md.

## Recorded results

Current five-fix follow-up: `npm test` passed (1,273 assertions including 39 new financial regressions). The existing 45 Edge browser tests passed in 54.0 seconds. The updated audit browser file then passed all five tests, including two new tests, for 47 distinct passing browser cases. `npm run build` and its asset validation passed. Tests used mocked Google services and disposable local databases; no production transactions were performed. The first restricted browser-server attempt was stopped, then the local browser suite completed successfully with the required process permissions.

New cases cover backdated supplier balances, exact discounted line/partial-return refunds, technician price/delivery denials without stock changes, authorized repair delivery, spent-advance refund rejection without cash/job mutation, safe cancellation, valid refunds and duplicate-cancel rejection, and partial/full subsequent payments through the same public link. These changes do not correct historical records automatically.

```json
{
  "automatedChecks": 1273,
  "browserTests": 47,
  "browser": "Microsoft Edge",
  "frontendBuild": "passed",
  "buildAssets": "passed",
  "dependencyAdvisories": { "high": 1, "moderate": 9, "majorUpgrades": "deferred per owner constraint" },
  "nativeInstallers": "not run in this review",
  "productionDataAccess": false
}
```

- `npm test`: all original 1,172 reported checks plus 62 new checks passed. These are assertion counts, not 1,234 independent end-to-end tests. New backend checks: 34; legacy offline restore: 3; client recovery/invoice display: 25.
- `npm run test:e2e`: 45 browser tests passed (the existing 42 plus three new tests). Edge run took 51.2 seconds. Added checks cover blocked dev editor launch, real-page reload after lost sale acknowledgements, and advance-paid public invoices.
- `npm run build`: successful; the built entry, local JS/CSS imports, fonts and manifest icons passed the new asset validator. The regenerated dist is included in the local package.
- Both GitHub workflow YAML files parse successfully. Chromium selection is supported for CI; the CI jobs themselves have not been executed remotely.
- Local checks used Node.js v26.13.0, npm 11.20.0, temporary data directories and isolated mocked Google services. CI remains configured for Node.js 22.

## New failure cases verified

- A valid restore fails while writing, then every previous business table and request receipt is restored.
- A larger restore appends rows before failing; recovery also removes those appended rows.
- A reset fails while re-creating defaults and the old shop records are restored.
- A storage outage interrupts both maintenance and rollback. Reads remain blocked; a fresh execution recovers the full prior database before authentication/read.
- A COMMITTED write succeeds but its acknowledgement is lost. The complete restored database remains committed.
- A lost sale acknowledgement survives page reload and session renewal with one invoice and the original request ID.
- A write is blocked before transmission if its pending ID cannot be stored. Failed local confirmation cleanup is finished by replay without another charge.
- An uncertain request is not replayed after the safe receipt lifetime or against an unsupported old backend.
- Linked supplier/customer permissions, other-staff price history, nested warranty response costs, opening-debt reminders, 1,001 expenses and 501 return/report boundaries are checked.
- Public and business invoice renderers show 100 paid for a total of 100 comprising cash 80 and advance 20.
- Offline backup restore migrates missing Repairs/Units/InvoiceLinks and preserves the product across a restart.

## Scope and remaining limits

No push, remote release, deployment, production login, business-data access, real SMS or production database modification took place. No actual user's offline data directory was used. Native installers, Electron GUI, mobile devices, physical printers, real Google Sheets quotas/formula execution and cloud-trigger behavior were not tested as real-device/production runs.

Dependency majors remain unchanged as requested. Current npm audit still flags 10 package entries (1 high and 9 moderate, including indirect overlap). Disabling Vite editor launch, loopback binding and CORS restrictions are limited local-development mitigations; the advisories are not claimed fully resolved. Authentication migration and other major architectural changes are deferred.

## Transfer integrity

From the repository root, run `node scripts/prepare-review.cjs`, then `node scripts/prepare-review.cjs --check`. The manifest records this local file set and these verification results. SHA256SUMS.txt covers every listed payload file except itself, including the manifest. Legacy backend/parts, dependencies, test outputs, credentials and user databases/backups are excluded from the transfer package.

Approval is required before any upload. Deploy the authoritative backend first, then frontend. Pushing main triggers Pages publication, so it must not be treated as a harmless staging step.
