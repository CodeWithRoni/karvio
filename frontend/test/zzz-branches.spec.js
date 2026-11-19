import { test, expect } from '@playwright/test';

// Runs last: once branches are on they stay on. Add branches, switch the working branch, move stock, see the report.
const endpoint = 'http://localhost:8787';
let token;
async function call(request, action, payload = {}, extra = {}) {
  const r = await (await request.post(endpoint, { data: { action, payload, token, ...extra } })).json();
  expect(r.ok, r.error).toBe(true);
  return r.data;
}
test.beforeAll(async ({ request }) => { token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token; });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token });
});

test('add branches, work in one, send stock to the other and see every branch in one report', async ({ page, request }) => {
  const stamp = Date.now();
  const p = await call(request, 'product.save', { name: `Branch fan ${stamp}`, sale_price: 2500 });
  const sup = await call(request, 'supplier.save', { name: `Branch supplier ${stamp}` });
  await call(request, 'purchase.create', { supplier_id: sup.id, items: [{ product_id: p.id, qty: 6, cost: 1800, sale_price: 2500 }], payments: [] });
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: 'Branches' }).click();
  for (const name of ['Main branch', 'Second branch']) {
    await page.getByRole('button', { name: '+ Add branch' }).click();
    await page.getByRole('dialog').getByLabel('Branch name').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Save branch' }).click();
    await expect(page.locator('.dc-hist').first()).toContainText(name);
  }
  await expect(page.locator('.dc-hist').first().locator('tr', { hasText: 'Main branch' })).toContainText('Main');
  await page.screenshot({ path: '/tmp/branches-main.png' });
  // the menu now has the picker and the branch pages
  await expect(page.getByRole('status', { name: 'Working branch' })).toContainText('Main branch');
  await expect(page.getByRole('combobox', { name: 'Working branch' })).toHaveCount(0);
  await expect(page.locator('.nav-card', { hasText: 'Stock' }).getByRole('link', { name: /Branch Transfer/ })).toBeVisible();

  // send 2 fans from the main branch to the second branch
  await page.goto('/#/branch-transfer');
  await page.getByRole('button', { name: '➜ Send stock' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByPlaceholder(/Add a product/).fill(p.name);
  await dlg.getByPlaceholder(/Add a product/).press('Enter');
  await dlg.getByLabel(`Quantity of ${p.name}`).fill('2');
  await dlg.getByRole('button', { name: '➜ Send' }).click();
  await expect(page.locator('.bt-list')).toContainText('On the way');
  // switch to the second branch and take it in
  const second = (await call(request, 'branches.get')).list.find((b) => b.name === 'Second branch').id;
  // the branch is chosen at sign-in; here the device's saved branch is changed and the app reloaded
  await page.evaluate((id) => localStorage.setItem('karvio_branch', id), second);
  await page.reload();
  await expect(page.getByRole('status', { name: 'Working branch' })).toContainText('Second branch');
  await page.getByRole('button', { name: '✓ Take it in' }).click();
  await page.getByRole('tab', { name: 'Done' }).click();
  await expect(page.locator('.bt-list')).toContainText('Received');
  expect((await call(request, 'products.list', {}, { branch: second })).find((x) => x.id === p.id).stock).toBe(2);

  await page.goto('/#/branch-report');
  await expect(page.locator('.br-table')).toContainText('Second branch');
  await expect(page.locator('.br-table tr.all')).toContainText('All branches');

  // a new employee gets a branch from the user form; Settings → Branches shows (and can change) the same
  await page.goto('/#/users');
  await page.getByRole('button', { name: 'Add user' }).click();
  const uf = page.getByRole('dialog', { name: 'Add user' });
  await uf.getByLabel('Full name').fill(`Branch staff ${stamp}`);
  await uf.getByLabel('Username').fill(`bstaff${stamp}`);
  await uf.getByLabel('Password').fill('long-password-123');
  await uf.getByRole('combobox', { name: 'Branch' }).selectOption(second);
  await page.screenshot({ path: '/tmp/user-branch.png' });
  await uf.getByRole('button', { name: 'Save user' }).click();
  await expect(uf).toHaveCount(0);
  await expect(page.locator('tr', { hasText: `Branch staff ${stamp}` })).toContainText('Second branch');
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: 'Branches' }).click();
  const sel = page.getByLabel(`Branch of Branch staff ${stamp}`);
  await expect(sel).toHaveValue(second);
  await sel.selectOption('');
  await page.getByRole('button', { name: 'Save users & accounts' }).click();
  await expect(page.getByText('Saved').first()).toBeVisible();
  await page.goto('/#/users');
  await expect(page.locator('tr', { hasText: `Branch staff ${stamp}` })).toContainText('Any branch');

  // sign in: pick the branch on the sign-in screen
  const fresh = await page.context().browser().newPage();
  await fresh.addInitScript(({ endpoint }) => { try { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); } catch { /* about:blank */ } }, { endpoint });
  await fresh.setViewportSize({ width: 1200, height: 900 });
  await fresh.goto(page.url().replace(/#.*$/, '#/'));
  const pick = fresh.getByLabel('Sign in to branch');
  await expect(pick.locator('option')).toHaveText(['Main branch', 'Second branch']);
  await fresh.getByLabel('Username').fill(`BSTAFF${stamp}`);
  await fresh.getByLabel('Password').fill('long-password-123');
  await pick.selectOption({ label: 'Second branch' });
  await fresh.screenshot({ path: '/tmp/login-branch.png' });
  await fresh.getByRole('button', { name: 'Sign in' }).click();
  await expect(fresh.getByRole('status', { name: 'Working branch' })).toHaveAttribute('data-branch', second);
  await fresh.locator('.branch-badge').screenshot({ path: '/tmp/branch-badge.png' });
  await fresh.close();
});
