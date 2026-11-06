// Dashboard cards that can be shown or hidden from Settings → Dashboard.
import { useStore } from './store';

export const DASH_CARDS = [
  ['sales', 'Sales'], ['sales_returns', 'Sales returns'], ['purchases', 'Purchases'], ['purchase_returns', 'Purchase returns'],
  ['expenses', 'Expenses'], ['gross_profit', 'Gross profit'], ['net_profit', 'Net profit'], ['new_dues', 'New dues on sales'],
  ['receivable', 'Receivable (customer dues)'], ['payable', 'Payable (supplier dues)'],
  ['balances', 'Live balances (cash, bank, MFS)'], ['chart', 'Last 14 days chart'], ['leaderboard', 'Staff leaderboard / recent invoices'], ['low_stock', 'Low stock list']
];

export function hiddenCards(settings) {
  try { const v = JSON.parse(settings.dashboard_hidden || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
/** true when the card should be shown */
export const useCardOn = () => {
  const hidden = hiddenCards(useStore((s) => s.settings));
  return (key) => !hidden.includes(key);
};
