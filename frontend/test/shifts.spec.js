import { test, expect } from '@playwright/test';

// Shift & day close: open a shift by counting notes, the POS shows it, close with a shortage; settings lock the POS.
const endpoint = 'http://localhost:8787';
let token, cash;
async function call(request, action, payload = {}) {
  const r = await (await request.post(endpoint, { data: { action, payload, token } })).json();
  expect(r.ok, r.error).toBe(true);
  return r.data;
}
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  // Close anything left open by an earlier run, and keep shifts optional for the other tests.
  for (const s of (await call(request, 'shifts.list')).open) await call(request, 'shift.close', { id: s.id, counted: s.expected });
  await call(request, 'settings.save', { values: { shift_required: false, shift_mode: 'cashier' } });
});
test.afterAll(async ({ request }) => {
  for (const s of (await call(request, 'shifts.list')).open) await call(request, 'shift.close', { id: s.id, counted: s.expected });
  await call(request, 'settings.save', { values: { shift_required: false, shift_mode: 'cashier' } });
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token });
});

test('open a shift by counting notes, see it on the POS, close it with a shortage', async ({ page, request }) => {
  const acc = await call(request, 'account.save', { name: `Shift drawer ${Date.now()}`, type: 'cash', opening_balance: 0 });
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto('/#/shifts');
  await expect(page.locator('.nav-card', { hasText: 'Money & Reports' }).getByRole('link', { name: /Shift & day close/ })).toBeVisible();
  await page.getByRole('button', { name: '▶ Open shift' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Cash drawer').selectOption(acc.id);
  await dlg.getByLabel('Number of Tk 1000', { exact: true }).fill('2');
  await dlg.getByLabel('Number of Tk 500', { exact: true }).fill('1');
  await expect(dlg.getByLabel('Opening cash in drawer')).toHaveValue('2500');
  await dlg.getByRole('button', { name: /Open shift with Tk 2,500/ }).click();
  const card = page.locator('.sh-open .card', { hasText: acc.name });
  await expect(card).toContainText('Tk 2,500');
  await expect(page.locator('.sh-stats')).toContainText('Open shifts');

  // the POS shows the open shift
  await page.goto('/#/pos');
  await expect(page.getByText(/Shift open · /)).toBeVisible();

  // close with a shortage: the note is required
  await page.goto('/#/shifts');
  await card.getByRole('button', { name: '■ Close shift' }).click();
  const close = page.getByRole('dialog');
  await close.getByLabel('Counted total').fill('2400');
  await expect(close.locator('.dc-diff')).toContainText('Short by');
  await expect(close.getByRole('button', { name: '■ Close shift' })).toBeDisabled();
  await close.getByPlaceholder(/Gave change/).fill('Tea for the team');
  await close.getByRole('button', { name: '■ Close shift' }).click();
  await expect(page.locator('.dc-hist')).toContainText('Tea for the team');
  expect((await call(request, 'accounts.list')).find((a) => a.id === acc.id).balance).toBe(-100);
});

test('Settings → Shift: choose the mode and lock the POS until a shift is open', async ({ page, request }) => {
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: 'Shift' }).click();
  await expect(page.getByRole('radio', { name: /Each cashier opens their own shift/ })).toBeChecked();
  await page.getByRole('checkbox', { name: /Open a shift before selling/ }).check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await call(request, 'shift.mine')).required).toBe(true);

  await page.goto('/#/pos');
  await expect(page.getByRole('heading', { name: 'Open a shift to start selling' })).toBeVisible();
  await page.getByRole('button', { name: '▶ Open shift' }).click();
  await page.getByRole('dialog').getByLabel('Opening cash in drawer').fill('0');
  await page.getByRole('dialog').getByRole('button', { name: /Open shift with/ }).click();
  await expect(page.getByText(/Shift open · /)).toBeVisible();
  await expect(page.getByPlaceholder(/Search product by serial/)).toBeVisible();
});
