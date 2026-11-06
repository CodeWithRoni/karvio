// Dashboard cards that can be shown or hidden from Settings → Dashboard.
import { useStore } from './store';

export const DASH_CARDS = [
  ['sales', 'Sales'], ['sales_returns', 'Sales returns'], ['purchases', 'Purchases'], ['purchase_returns', 'Purchase returns'],
  ['expenses', 'Expenses'], ['gross_profit', 'Gross profit'], ['net_profit', 'Net profit'], ['new_dues', 'New dues on sales'],
  ['receivable', 'Receivable (customer dues)'], ['payable', 'Payable (supplier dues)'],
  ['sales_week', 'Sales — this week'], ['sales_month', 'Sales — this month'], ['sales_last_month', 'Sales — last month'],
  ['sales_six_months', 'Sales — last 6 months'], ['sales_year', 'Sales — this year'], ['sales_last_year', 'Sales — last year'],
  ['hist_sales_returns', 'History — sales returns'], ['hist_purchases', 'History — purchases'], ['hist_purchase_returns', 'History — purchase returns'],
  ['hist_expenses', 'History — expenses'], ['hist_gross_profit', 'History — gross profit'], ['hist_net_profit', 'History — net profit'],
  ['hist_receivable', 'History — receivable (new customer dues)'], ['hist_payable', 'History — payable (new supplier dues)'],
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
