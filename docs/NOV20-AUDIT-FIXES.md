# Local audit fixes — 20 November 2026

Base: `dae888d1351351e84e4bf290814ca39941cdd599` (1.2.7). Publication authorized by the owner on 20 November 2026. The tested source includes the migration below; the backend-first deployment workflow applies it before publishing the Edge function and frontend. Tests used local fixtures; no production business records were manually edited.

## Corrections

1. Hosted stock summaries reserve service parts only while Pending / Work done; Completed service invoices no longer reserve the same stock twice.
2. Branch gross profit subtracts returned profit from the original selling branch, including returns received elsewhere.
3. Branch transfers cannot move reserved quantities or serials. Repair parts must exist in the job's branch. New jobs retain their branch; legacy untagged jobs conservatively reserve stock until edited or delivered rather than guessing their history.
4. Fixed-branch staff cannot bypass invoice visibility by opening a foreign sale/purchase ID or number, or through related edit, return, reversal and history document routes. Shared party ledgers remain shared.
5. Serial stock and transfer valuation use the actual serial costs rather than global average product cost.
6. Online order returns select remaining serials after earlier partial returns.
7. Currency rounding uses decimal shifting consistently in server calculations and client previews; the hosted account summary matches the same rounding convention. Existing stored documents are not silently recalculated.
8. Hosted courier booking persists an attempt before sending. Unknown responses block automatic resends; a saved response can be applied again without another courier POST. Administrators can explicitly allow another attempt only after checking the provider portal, entering their password, a reason and `NOT BOOKED`. Manual tracking remains available.
9. Stock Count drafts are scoped by connection, user and branch. Applying a count validates its branch, and saving a draft rejects a changed context.
10. Reset/restore clears scoped held sales and Stock Count drafts as well as older draft keys. Open tabs clear their in-memory cart/count when the shop reset event arrives.

## Deployment requirements and limits

- Migration `20261120143852_karvio_audit_service_reservations_rounding.sql` must be applied before the new hosted backend. It replaces the existing private metrics function without changing its signature or rewriting historical business rows; execution remains service-role only.
- Publish the generated engine and regenerated table hints with the handler. CI must stamp release identity; the checked-in release identity is preserved locally.
- Courier tests use a simulated provider, including lost replies, concurrent attempts and a database failure after a response. This prevents blind retries; it cannot prove whether an external provider accepted an unknown request. Portal reconciliation is still necessary. The legacy Apps Script courier path is not the hosted workflow.
- No production concurrency benchmark, live provider booking, native installer build or live migration was performed for these fixes.

## Verification

- Existing regular and hosted backend suites passed.
- New `backend/test/nov20-audit.mjs`: 41 regression checks, including real PostgreSQL-compatible migration execution in the local harness.
- Browser suite: all 205 existing tests passed; all four added tests passed after correcting two test selectors/assumptions discovered in the full run. The new tests cover decimal previews, draft isolation/cleanup, courier reconciliation UI and clearing another open tab.
- Frontend production build and built-file verification passed.
- Full performance/scoped-read suite passed, including the new 41-check regression file. Table hints were regenerated from 46 backend test files; a subsequent scoped-read run confirmed 199 answers identical to whole-shop reads.

The original audit evidence describes the pre-fix baseline. Passing these tests does not imply that every possible ERP defect has been eliminated.
