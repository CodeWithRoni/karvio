import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';

// Product import / export, price list, POS hold, activity log, monthly expenses, supplier prices, daily summary.
const endpoint = 'http://localhost:8787';
let token, cash;
async function call(request, action, payload = {}) {
  const r = await (await request.post(endpoint, { data: { action, payload, token } })).json();
  expect(r.ok, r.error).toBe(true);
  return r.data;
}
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  cash = (await call(request, 'bootstrap')).accounts[0].id;
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token });
});

test('import products from Excel: check shows problems, a clean file imports', async ({ page, request }) => {
  const stamp = Date.now();
  const sheet = (rows) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Products'); return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }); };
  await page.goto('/#/stock');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Import products from Excel' });
  await dlg.getByLabel('Excel file').setInputFiles({ name: 'bad.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: sheet([['Product name', 'Retail price'], [`Import pen ${stamp}`, '-5']]) });
  await expect(dlg.locator('.imp-bad')).toHaveCount(1);
  await expect(dlg.getByRole('button', { name: /^Import/ })).toBeDisabled();
  await dlg.getByLabel('Excel file').setInputFiles({ name: 'good.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: sheet([['Product name', 'Product group', 'Brand', 'Retail price'], [`Import pen ${stamp}`, `Stationery ${stamp}`, `Matador ${stamp}`, '20'], [`Import pad ${stamp}`, `Stationery ${stamp}`, '', '80']]) });
  await expect(dlg.locator('.imp-sum')).toContainText('2');
  await expect(dlg).toContainText(`group Stationery ${stamp}`);
  await dlg.getByRole('button', { name: 'Import 2 products' }).click();
  await expect(dlg).toHaveCount(0);
  const p = (await call(request, 'products.list')).find((x) => x.name === `Import pen ${stamp}`);
  expect(p.sale_price).toBe(20);
});

test('price list previews the chosen products and prints', async ({ page, request }) => {
  const p = await call(request, 'product.save', { name: `Price list router ${Date.now()}`, sale_price: 3100, wholesale_price: 2900 });
  await call(request, 'purchase.create', { items: [{ product_id: p.id, qty: 2, cost: 2500 }], payments: [{ account_id: cash, amount: 5000 }] });
  await page.goto('/#/stock');
  await page.getByRole('button', { name: 'Price list' }).click();
  const dlg = page.getByRole('dialog', { name: 'Price list' });
  await dlg.getByLabel('Wholesale price').check();
  await expect(dlg.locator('.pl-preview th')).toContainText(['Product', 'Warranty', 'Retail price', 'Wholesale']);
  await expect(dlg.locator('.pl-preview')).toContainText(p.name);
  await expect(dlg.getByRole('button', { name: 'Print / save PDF' })).toBeEnabled();
});

test('POS: hold a sale, serve another, then resume the held one', async ({ page, request }) => {
  const p = await call(request, 'product.save', { name: `Hold test SSD ${Date.now()}`, sale_price: 5000 });
  await call(request, 'purchase.create', { items: [{ product_id: p.id, qty: 3, cost: 4000 }], payments: [{ account_id: cash, amount: 12000 }] });
  await page.goto('/#/pos');
  const search = page.getByRole('combobox', { name: 'Search product' });
  await search.fill(p.name); await search.press('Enter');
  await expect(page.locator('.cart tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Hold', exact: true }).click();
  await expect(page.locator('.cart tbody tr')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: /^Held · 1/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Sales on hold' });
  await expect(dlg).toContainText('Cash sale');
  await expect(dlg).toContainText('5,000');
  await dlg.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.cart tbody tr')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Held/ })).toBeDisabled();
});

test('activity log lists who did what, with filters', async ({ page, request }) => {
  await call(request, 'price.update', { items: [{ id: (await call(request, 'products.list')).find((x) => x.sale_price > 0).id, sale_price: 1234 }] });
  await page.goto('/#/activity');
  await expect(page.getByRole('heading', { name: 'Activity log' })).toBeVisible();
  await page.getByLabel('Type').selectOption('price');
  await expect(page.locator('.act-row').first()).toContainText('Prices changed');
  await expect(page.locator('.act-row').first()).toContainText('1,234');
});

test('monthly expenses: set up, record with one click, shown on the dashboard', async ({ page }) => {
  await page.goto('/#/expenses?tab=monthly');
  await page.getByRole('button', { name: /Set up|Edit list/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Monthly expenses' });
  const rows = dlg.locator('.mx-edit-row');
  const last = rows.last();
  await last.getByLabel('Name').fill(`Shop rent ${Date.now()}`);
  await last.getByLabel('Category').selectOption('Rent');
  await last.getByLabel('Amount').fill('15000');
  await last.getByLabel('Day of the month').fill('1');
  await dlg.getByRole('button', { name: 'Save list' }).click();
  await expect(dlg).toHaveCount(0);
  const row = page.locator('.mx-row.due').last();
  await expect(row).toContainText('Due since');
  await row.getByRole('button', { name: 'Record' }).click();
  const rec = page.getByRole('dialog', { name: /^Record/ });
  await rec.getByRole('button', { name: 'Record expense' }).click();
  await expect(page.locator('.mx-row').last()).toContainText('Recorded for this month');
});

test('supplier prices report marks the cheapest supplier; settings preview the daily summary', async ({ page }) => {
  await page.goto('/#/reports?type=supplier_prices');
  await expect(page.getByRole('combobox', { name: 'Report' })).toHaveValue('supplier_prices');
  await expect(page.getByRole('columnheader', { name: 'Last unit cost' })).toBeVisible();
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: /SMS/ }).click();
  const card = page.locator('.ds-card');
  await expect(card.getByRole('heading', { name: 'Daily summary to the owner' })).toBeVisible();
  await expect(card.locator('.ds-preview')).toContainText('Sales');
});

test('unused accounts can be deleted from the list or the edit window', async ({ page, request }) => {
  const stamp = Date.now();
  const a1 = await call(request, 'account.save', { name: `Spare bank ${stamp}`, type: 'bank', opening_balance: 0 });
  const a2 = await call(request, 'account.save', { name: `Spare wallet ${stamp}`, type: 'mfs', opening_balance: 0 });
  await page.goto('/#/accounts');
  const row = (name) => page.locator('tr', { hasText: name });
  await row(a1.name).locator('.dt-check').check();
  await page.getByRole('button', { name: 'Delete selected (1)' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row(a1.name)).toHaveCount(0);
  await row(a2.name).getByText(a2.name).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete account' }).click();
  await page.getByRole('dialog', { name: /Delete/ }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row(a2.name)).toHaveCount(0);
  // Cash has history: no delete button in its window.
  await row('Cash').first().getByText('Cash', { exact: true }).first().click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Delete account' })).toHaveCount(0);
});
