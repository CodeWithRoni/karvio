import { test, expect } from '@playwright/test';

// Stock → Branch Stock: every product with each branch's stock; the POS price card shows the same for one product.
const endpoint = 'http://localhost:8787';
let token, ids = {};
async function call(request, action, payload = {}, extra = {}) {
  const r = await request.post(endpoint, { data: { action, payload, token, ...extra } });
  const body = await r.json();
  expect(body.ok, `${action}: ${body.error}`).toBe(true);
  return body.data;
}
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  const br = await call(request, 'branches.get'), main = br.list.find((b) => b.main) || br.list[0], second = br.list.find((b) => b.name === 'Second branch');
  const tag = Date.now().toString().slice(-6);
  const p = await call(request, 'product.save', { name: `Bs cable ${tag}`, sale_price: 300 });
  const sup = await call(request, 'supplier.save', { name: `Bs supplier ${tag}` });
  await call(request, 'purchase.create', { supplier_id: sup.id, items: [{ product_id: p.id, qty: 9, cost: 200, sale_price: 300 }], payments: [] }, { branch: main.id });
  const sent = await call(request, 'branch.transfer.send', { to: second.id, items: [{ product_id: p.id, qty: 3 }] }, { branch: main.id });
  await call(request, 'branch.transfer.send', { to: second.id, items: [{ product_id: p.id, qty: 2 }] }, { branch: main.id }); // still on the way
  await call(request, 'branch.transfer.receive', { id: sent.id }, { branch: second.id });
  ids = { tag, p, main, second };
});
test.beforeEach(async ({ page }) => page.addInitScript(({ endpoint, token }) => {
  localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
  localStorage.setItem('erp_token', token);
}, { endpoint, token }));

test('Branch Stock: each branch, on the way and the total for every product', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto('/#/');
  await page.locator('.nav-card', { hasText: 'Stock' }).getByRole('link', { name: /Branch Stock/ }).click();
  await expect(page.locator('h1').first()).toContainText('Branch stock');
  const heads = page.locator('.dt thead th');
  await expect(heads.filter({ hasText: ids.main.name })).toHaveCount(1);
  await expect(heads.filter({ hasText: ids.second.name })).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search table' }).fill(ids.p.name);
  const row = page.locator('.dt tbody tr', { hasText: ids.p.name });
  const col = async (label) => { const t = await heads.allInnerTexts(); return t.findIndex((h) => h.trim().startsWith(label)); };
  const val = async (label) => (await row.locator('td').nth(await col(label)).innerText()).trim();
  await expect(row).toHaveCount(1);
  expect(await val(ids.main.name)).toBe('4');
  expect(await val(ids.second.name)).toBe('3');
  expect(await val('On the way')).toBe('2');
  expect(await val('Total')).toBe('9');
  await expect(page.locator('.bs-card', { hasText: 'All branches' })).toBeVisible();
  await page.screenshot({ path: 'test-results/branch-stock.png' });
  // a branch card filters to the products that branch has
  await page.locator('.bs-card', { hasText: ids.second.name }).click();
  await expect(page.locator('.bs-card.on')).toContainText(ids.second.name);
  await expect(row).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search table' }).fill('');
  const texts = await page.locator('.dt tbody tr').allInnerTexts();
  const i = await col(ids.second.name);
  for (const r of await page.locator('.dt tbody tr').all()) expect(Number((await r.locator('td').nth(i).innerText()).trim())).toBeGreaterThan(0);
  expect(texts.length).toBeGreaterThan(0);
});

test('POS price card: stock in every branch, the working branch marked', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript((id) => { if (!sessionStorage.getItem('t_once')) { sessionStorage.setItem('t_once', '1'); localStorage.setItem('karvio_branch', id); } }, ids.second.id);
  await page.goto('/#/pos');
  await expect(page.locator('.branch-badge')).toContainText(ids.second.name);
  await page.getByRole('combobox', { name: 'Search product' }).fill(ids.p.name);
  await page.locator('.psearch-list li').first().locator('.pn').hover();
  const card = page.locator('.ppc-pop .ppc');
  await expect(card).toContainText('Stock in branches');
  const chips = card.locator('.ppc-branches span');
  await expect(chips.filter({ hasText: ids.main.name })).toContainText('4');
  await expect(chips.filter({ hasText: ids.second.name })).toContainText('3');
  await expect(card.locator('.ppc-branches span.here')).toContainText(ids.second.name);
  await expect(chips.filter({ hasText: 'On the way' })).toContainText('2');
  await page.screenshot({ path: 'test-results/pos-branch-card.png' });
});
