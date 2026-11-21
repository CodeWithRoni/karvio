import { test, expect } from '@playwright/test';

// Approval: an admin ticks which work of a manager needs approval (Users & Roles); that work is held, shows on the
// admin dashboard and the Approval pages, and is saved only when an admin approves it.
const endpoint = 'http://localhost:8787';
const shots = process.env.KARVIO_SHOTS || 'test-results';
const T = Date.now().toString().slice(-6);
let admin, mgrToken, ids = {};
async function call(request, action, payload = {}, token = admin) {
  const r = await request.post(endpoint, { data: { action, payload, token } });
  const body = await r.json();
  expect(body.ok, `${action}: ${body.error}`).toBe(true);
  return body.data;
}
const signIn = (page, token) => page.addInitScript(({ endpoint, token }) => {
  localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
  localStorage.setItem('erp_token', token);
}, { endpoint, token });

test.describe.configure({ mode: 'serial' });
test.beforeAll(async ({ request }) => {
  admin = (await call(request, 'login', { username: 'admin', password: 'admin123' }, null)).token;
  const boot = await call(request, 'bootstrap');
  ids.cash = (boot.accounts.find((a) => a.type === 'cash') || boot.accounts[0]).id;
  ids.sup = await call(request, 'supplier.save', { name: `AP Supplier ${T}` });
  ids.p = await call(request, 'product.save', { name: `AP ROUTER ${T}`, sale_price: 2500 });
  ids.mgr = await call(request, 'user.save', { name: `Rafiq ${T}`, username: `rafiq${T}`, role: 'manager', password: 'rafiq-password-2026' });
  mgrToken = (await call(request, 'login', { username: `rafiq${T}`, password: 'rafiq-password-2026' }, null)).token;
});

test('Users & Roles: tick the work that needs approval', async ({ page, request }) => {
  await signIn(page, admin);
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto('/#/users');
  await page.locator('.dt tbody tr', { hasText: `Rafiq ${T}` }).click();
  const box = page.locator('.apr-pick');
  await expect(box).toContainText('Needs admin approval');
  await box.getByLabel('Purchase').check();
  await box.getByLabel('Expenses').check();
  await page.screenshot({ path: `${shots}/approval-user.png` });
  await page.getByRole('button', { name: 'Save user' }).click();
  await expect.poll(async () => ((await call(request, 'users.list')).find((u) => u.id === ids.mgr.id) || {}).approvals).toEqual(['purchase', 'expense']);
});

test('the manager\'s purchase and expense wait for an admin', async ({ page, request }) => {
  const before = (await call(request, 'products.list')).find((x) => x.id === ids.p.id).stock;
  ids.held = await call(request, 'purchase.create', { supplier_id: ids.sup.id, items: [{ product_id: ids.p.id, qty: 5, cost: 1900 }], payments: [] }, mgrToken);
  expect(ids.held.pending_approval).toBe(true);
  expect((await call(request, 'products.list')).find((x) => x.id === ids.p.id).stock).toBe(before);
  await signIn(page, mgrToken);
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto('/#/expenses');
  const form = page.locator('form.card');
  await form.getByRole('combobox').nth(0).selectOption('Other');
  await form.getByRole('spinbutton').fill('350');
  await form.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.locator('.toasts')).toContainText('Sent to admin for approval');
  // the menu shows only his two approval pages
  const card = page.locator('.nav-card', { has: page.locator('.nav-group', { hasText: /^Approval$/i }) });
  await expect(card.getByRole('link')).toHaveText([/Purchase Approval/, /Expenses Approval/]);
  await card.getByRole('link', { name: /Purchase Approval/ }).click();
  await expect(page.locator('.dt tbody tr')).toContainText([ids.held.approval.no]);
});

test('admin: dashboard alert, review, approve and reject', async ({ page, request }) => {
  await signIn(page, admin);
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto('/#/');
  const alert = page.locator('section[aria-label="Waiting for approval"]');
  await expect(alert).toContainText(ids.held.approval.no);
  await page.screenshot({ path: `${shots}/approval-dashboard.png` });
  const card = page.locator('.nav-card', { has: page.locator('.nav-group', { hasText: /^Approval$/i }) });
  await expect(card.getByRole('link')).toHaveText([/Purchase Approval/, /Payment Approval/, /Collection Approval/, /Expenses Approval/, /Branch Transfer Approval/]);
  await card.getByRole('link', { name: /Purchase Approval/ }).click();
  await page.locator('.dt tbody tr', { hasText: ids.held.approval.no }).getByRole('button', { name: 'Review' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText(`AP Supplier ${T}`);
  await expect(dlg).toContainText(`AP ROUTER ${T}`);
  await page.screenshot({ path: `${shots}/approval-review.png` });
  await dlg.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('.toasts')).toContainText(/approved — saved as PUR-/);
  expect((await call(request, 'approvals.list', { kind: 'purchase', status: 'approved' })).rows.some((r) => r.id === ids.held.approval.id)).toBe(true);
  // reject the expense with a reason
  await card.getByRole('link', { name: /Expenses Approval/ }).click();
  await page.locator('.dt tbody tr').first().getByRole('button', { name: 'Review' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
  await page.getByRole('dialog').getByLabel('Reason for rejecting').fill('Not this month');
  await page.getByRole('dialog').getByRole('button', { name: 'Reject request' }).click();
  await expect(page.locator('.toasts')).toContainText('rejected');
  await page.getByRole('tab', { name: 'All', exact: true }).click();
  await expect(page.locator('.dt tbody')).toContainText('Not this month');
  await page.screenshot({ path: `${shots}/approval-list.png` });
});

test('Settings → SMS settings: approval request SMS to 1–20 admin numbers', async ({ page }) => {
  await signIn(page, admin);
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: 'SMS settings', exact: true }).click();
  const c = page.locator('.smsf-card', { hasText: 'Approval request — to admins' });
  await c.getByRole('textbox', { name: /Approval request.*numbers/ }).fill('01711000301, 01711000302');
  await expect(c.locator('.sms-count')).toHaveText('2 / 20');
  await c.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.toasts')).toContainText('saved');
  await c.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/approval-sms.png` });
});
