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
  // the menu now has the picker and the branch pages
  await expect(page.getByLabel('Working branch')).toHaveValue(/.+/);
  await expect(page.locator('.nav-card', { hasText: 'Stock' }).getByRole('link', { name: /Branch transfer/ })).toBeVisible();

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
  await page.getByLabel('Working branch').selectOption(second);
  await expect(page.getByText('Working in Second branch')).toBeVisible();
  await page.getByRole('button', { name: '✓ Take it in' }).click();
  await page.getByRole('tab', { name: 'Done' }).click();
  await expect(page.locator('.bt-list')).toContainText('Received');
  expect((await call(request, 'products.list', {}, { branch: second })).find((x) => x.id === p.id).stock).toBe(2);

  await page.goto('/#/branch-report');
  await expect(page.locator('.br-table')).toContainText('Second branch');
  await expect(page.locator('.br-table tr.all')).toContainText('All branches');
});
