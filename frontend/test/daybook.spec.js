import { test, expect } from '@playwright/test';

// Day book: opening, money in and out, closing; the day's business; every entry with a running balance.
const endpoint = 'http://localhost:8787';
let token;
async function call(request, action, payload = {}) {
  const r = await (await request.post(endpoint, { data: { action, payload, token } })).json();
  expect(r.ok, r.error).toBe(true);
  return r.data;
}
test.beforeAll(async ({ request }) => { token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token; });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token });
});

test('day book shows the balances, the business and every entry of the day', async ({ page, request }) => {
  const acc = await call(request, 'account.save', { name: `Book drawer ${Date.now()}`, type: 'cash', opening_balance: 1000 });
  await call(request, 'account.entry', { kind: 'deposit', account_id: acc.id, amount: 250, note: 'Owner put in' });
  const book = await call(request, 'daybook', { account_id: acc.id });
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto('/#/daybook');
  await expect(page.locator('.nav-card', { hasText: 'Money & Reports' }).getByRole('link', { name: /Day book/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Day book' })).toBeVisible();
  await expect(page.locator('.db-sum')).toContainText('Opening balance');
  await expect(page.locator('.db-biz')).toContainText('Sales');
  await page.getByLabel('Account').selectOption(acc.id);
  await expect(page.locator('.db-sum .card').first()).toContainText(book.opening.toLocaleString('en-IN'));
  await expect(page.locator('.db-sum .card').last()).toContainText(book.closing.toLocaleString('en-IN'));
  await expect(page.locator('.db-biz')).toHaveCount(0);
  await expect(page.locator('table').filter({ hasText: 'Deposit — Owner put in' })).toContainText('1,250');
  await page.getByRole('button', { name: '← Previous day' }).click();
  await expect(page.getByRole('button', { name: 'Next day →' })).toBeEnabled();
});
