import { Empty, PageHead } from '../components/ui';

/** Customer / Supplier Ledger Adjustment (admin only). The menu entry and page exist; the adjustment form is not built yet. */
export default function LedgerAdjustment({ kind }) {
  const who = kind === 'supplier' ? 'Supplier' : 'Customer';
  return (
    <>
      <PageHead title={`${who} Ledger Adjustment`} sub={`Correct a ${who.toLowerCase()}'s ledger balance`} />
      <Empty title="Coming soon">This page is not ready yet.</Empty>
    </>
  );
}
