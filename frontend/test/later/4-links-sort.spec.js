import { test, expect } from '@playwright/test';

// Branch switch reloads the open page at once; tables start newest first; Settings → Invoice → Link validity.
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
  const boot = await call(request, 'bootstrap'), cash = (boot.accounts.find((a) => a.type === 'cash') || boot.accounts[0]).id;
  const br = await call(request, 'branches.get'), main = br.list.find((b) => b.main) || br.list[0], second = br.list.find((b) => b.name === 'Second branch');
  const tag = Date.now().toString().slice(-6), today = boot.serverToday;
  const y = new Date(today + 'T12:00:00Z'); y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  let cats = []; try { cats = JSON.parse(boot.settings.expense_categories); } catch { /* default */ }
  const cat = cats.find((c) => !/salary|rent/i.test(c)) || 'Other';
  // main branch: an older and a newer expense; second branch: one of its own
  await call(request, 'expense.create', { date: yesterday, category: cat, amount: 11, account_id: cash, note: `Older ${tag}` }, { branch: main.id });
  await call(request, 'expense.create', { date: today, category: cat, amount: 12, account_id: cash, note: `Newer ${tag}` }, { branch: main.id });
  // a product whose stock differs between the branches (the branch test sent 2 fans to the second branch)
  const inMain = await call(request, 'products.list', {}, { branch: main.id }), inSecond = await call(request, 'products.list', {}, { branch: second.id });
  const fan = inMain.find((x) => /^Branch fan/.test(x.name) && inSecond.find((y) => y.id === x.id && Number(y.stock) !== Number(x.stock)));
  ids = { tag, main: main.id, second: second.id, settings: boot.settings, fan: fan.name, mainStock: Number(fan.stock), secondStock: Number(inSecond.find((y) => y.id === fan.id).stock) };
});
test.beforeEach(async ({ page }) => page.addInitScript(({ endpoint, token }) => {
  localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
  localStorage.setItem('erp_token', token);
}, { endpoint, token }));
test.afterAll(async ({ request }) => {
  await call(request, 'settings.save', { values: { invoice_link_days: ids.settings.invoice_link_days || '15', quote_link_days: ids.settings.quote_link_days || '3' } });
});

test('tables open newest first; Date turns it round', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.addInitScript((id) => localStorage.setItem('karvio_branch', id), ids.main);
  await page.goto('/#/expenses');
  const rows = page.locator('.dt tbody tr');
  await expect(rows.filter({ hasText: `Newer ${ids.tag}` })).toHaveCount(1);
  // newest first: the newer expense is above the older one, and Date shows it is sorted that way
  const texts = await rows.allInnerTexts();
  const iNew = texts.findIndex((t) => t.includes(`Newer ${ids.tag}`)), iOld = texts.findIndex((t) => t.includes(`Older ${ids.tag}`));
  expect(iNew).toBeGreaterThanOrEqual(0);
  expect(iOld === -1 || iNew < iOld).toBe(true);
  await expect(page.locator('th[aria-sort="descending"]')).toContainText('Date');
  // clicking Date turns it round: oldest first
  await page.getByRole('button', { name: 'Date', exact: true }).click();
  await expect(page.locator('th[aria-sort="ascending"]')).toContainText('Date');
});

test('switching the working branch shows that branch\'s stock at once, without a browser reload', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.addInitScript((id) => { if (!sessionStorage.getItem('t_once')) { sessionStorage.setItem('t_once', '1'); localStorage.setItem('karvio_branch', id); } }, ids.main);
  await page.goto('/#/products');
  const row = page.locator('.dt tbody tr', { hasText: ids.fan });
  const stockCell = async () => { const heads = await page.locator('.dt thead th').allInnerTexts(); const i = heads.findIndex((h) => /^Stock/.test(h.trim())); return (await row.locator('td').nth(i).innerText()).trim(); };
  await expect(row).toHaveCount(1);
  await expect.poll(stockCell).toContain(String(ids.mainStock));
  await page.evaluate(() => { window.__noReload = 1; });
  await page.getByRole('combobox', { name: 'Working branch' }).selectOption(ids.second);
  await expect(page.locator('.branch-badge')).toContainText('Second branch');
  await expect.poll(stockCell).toContain(String(ids.secondStock));
  expect(await page.evaluate(() => window.__noReload)).toBe(1); // the same page, not a browser reload
  await page.screenshot({ path: 'test-results/branch-switch-second.png' });
  await page.getByRole('combobox', { name: 'Working branch' }).selectOption(ids.main);
  await expect.poll(stockCell).toContain(String(ids.mainStock));
});

test('Settings → Invoice: link validity in days or lifetime', async ({ page, request }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: 'Invoice', exact: true }).click();
  const card = page.locator('.link-valid');
  await expect(card).toContainText('Link validity');
  const inv = card.locator('.lv-row', { hasText: 'Online invoice link' }), quo = card.locator('.lv-row', { hasText: 'Quotation link' });
  await inv.getByRole('radio', { name: 'Days' }).click();
  await inv.getByRole('spinbutton').fill('30');
  await quo.getByRole('radio', { name: 'Lifetime' }).click();
  await expect(quo).toContainText('Never expires');
  await page.screenshot({ path: 'test-results/link-validity.png' });
  await page.getByRole('button', { name: 'Save invoice settings' }).click();
  await expect.poll(async () => { const s = (await call(request, 'bootstrap')).settings; return [s.invoice_link_days, s.quote_link_days]; }).toEqual(['30', 'life']);
  await page.reload();
  await page.getByRole('tab', { name: 'Invoice', exact: true }).click();
  await expect(page.locator('.lv-row', { hasText: 'Online invoice link' }).getByRole('spinbutton')).toHaveValue('30');
  await expect(page.locator('.lv-row', { hasText: 'Quotation link' })).toContainText('Never expires');
});
