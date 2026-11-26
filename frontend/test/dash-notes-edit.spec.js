import { test, expect } from '@playwright/test';

// Sales below cost on the dashboard, notes with a reminder pop-up, SMS settings cards, invoice edit.
const endpoint = 'http://localhost:8787';
let token, cash;
async function call(request, action, payload = {}) {
  const r = await (await request.post(endpoint, { data: { action, payload, token } })).json();
  expect(r.ok, r.error).toBe(true);
  return r.data;
}
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  cash = (await call(request, 'bootstrap')).accounts.find((a) => a.type === 'cash').id;
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token });
});

test('dashboard shows sales below cost and a note reminder pops up with its buttons', async ({ page, request }) => {
  const stamp = Date.now();
  const p = await call(request, 'product.save', { name: `Cheap cable ${stamp}`, sale_price: 300 });
  const sup = await call(request, 'supplier.save', { name: `Cable supplier ${stamp}` });
  await call(request, 'purchase.create', { supplier_id: sup.id, items: [{ product_id: p.id, qty: 5, cost: 250, sale_price: 300 }], payments: [] });
  await call(request, 'sale.create', { items: [{ product_id: p.id, qty: 2, price: 200 }], payments: [{ account_id: cash, amount: 400 }] });
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto('/#/');
  const card = page.locator('.below-cost');
  await expect(card.getByRole('heading', { name: 'Sales below cost' })).toBeVisible();
  await expect(card).toContainText(p.name);
  await card.getByRole('tab', { name: '1 week' }).click();
  await expect(card).toContainText(p.name);
  // notes: add one with a reminder already due → it pops up
  await page.getByRole('button', { name: /Notes/ }).click();
  const dlg = page.getByRole('dialog');
  await dlg.first().getByRole('button', { name: '+ New note' }).click();
  const ed = page.getByRole('dialog', { name: 'New note' });
  await ed.getByLabel('Note title').fill(`Call the cable supplier ${stamp}`);
  await ed.getByRole('textbox', { name: 'Note', exact: true }).click();
  await ed.getByRole('button', { name: 'Bold' }).click();
  await page.keyboard.type('ask about the price');
  await ed.getByRole('radio', { name: 'Urgent' }).click();
  await ed.locator('.ne-remind .tgl').click();
  await ed.getByLabel('Remind me at — date').fill('2026-01-01');
  await ed.getByLabel('Remind me at — date').press('Enter');
  await ed.getByLabel('Remind me at — hour').selectOption('9');
  await ed.getByLabel('Remind me at — minute').selectOption('0');
  await ed.getByRole('radio', { name: 'AM' }).click();
  await expect(ed.locator('.ne-remind-t small')).toContainText('1 Jan, 9:00 am');
  await expect(ed.locator('input[type="datetime-local"]')).toHaveCount(0);
  await ed.getByRole('button', { name: '✓ Save note' }).click();
  await expect(ed).toHaveCount(0);
  const item = page.locator('.note-item', { hasText: `Call the cable supplier ${stamp}` });
  await expect(item.locator('.note-body b')).toHaveText('ask about the price');
  await expect(item.locator('.note-pr')).toHaveText('Urgent');
  // edit the title, then the panel closes
  await item.getByRole('button', { name: '✎ Edit' }).click();
  const ed2 = page.getByRole('dialog', { name: 'Edit note' });
  await ed2.getByLabel('Note title').fill(`Call the cable supplier ${stamp} today`);
  await ed2.getByRole('button', { name: '✓ Save note' }).click();
  await expect(page.locator('.note-item', { hasText: `Call the cable supplier ${stamp} today` })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('notes-list.png') });
  await page.getByRole('dialog', { name: 'Notes & reminders' }).getByRole('button', { name: 'Close' }).last().click();
  const pop = page.locator('.note-pop', { hasText: `Call the cable supplier ${stamp}` });
  await expect(pop).toBeVisible();
  for (const b of ['✓ Done', '1 hour later', 'Tomorrow', 'New date', 'Edit', 'Dismiss']) await expect(pop.getByRole('button', { name: b })).toBeVisible();
  await pop.getByRole('button', { name: '1 hour later' }).click();
  await expect(pop).toHaveCount(0);
});

test('SMS settings: one card per SMS with its own switch; gateway tab keeps only the gateway', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: 'SMS gateway', exact: true }).click();
  await expect(page.getByText('SMS gateway on')).toBeVisible();
  await expect(page.getByLabel('Sale invoice SMS message')).toHaveCount(0);
  await page.getByRole('tab', { name: 'SMS settings', exact: true }).click();
  for (const t of ['Sale invoice SMS', 'Due reminder SMS', 'Quotation SMS', 'Repair completed SMS', 'Repair — technician assigned', 'Service — technician assigned', 'Service done — to admin / manager'])
    await expect(page.locator('.smsf-card h2', { hasText: t })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily summary to the owner' })).toBeVisible();
  const card = page.locator('.smsf-card', { hasText: 'Quotation SMS' });
  await card.locator('.tgl').click();
  await expect(card.getByLabel('Quotation SMS on')).not.toBeChecked();
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByText('Off', { exact: true })).toBeVisible();
  await card.locator('.tgl').click();
  await card.getByRole('button', { name: 'Save' }).click();
});

test('edit an invoice: yellow Edit next to Cancel, same number, stock and due follow', async ({ page, request }) => {
  const stamp = Date.now();
  const p = await call(request, 'product.save', { name: `Edit pen ${stamp}`, sale_price: 50 });
  const sup = await call(request, 'supplier.save', { name: `Pen supplier ${stamp}` });
  await call(request, 'purchase.create', { supplier_id: sup.id, items: [{ product_id: p.id, qty: 20, cost: 30, sale_price: 50 }], payments: [] });
  const inv = await call(request, 'sale.create', { items: [{ product_id: p.id, qty: 2, price: 50 }], payments: [{ account_id: cash, amount: 100 }] });
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto(`/#/sales/${inv.sale.id}`);
  const edit = page.getByRole('button', { name: '✎ Edit' });
  await expect(edit).toBeVisible();
  await expect(edit).toHaveClass(/primary/);
  await edit.click();
  const dlg = page.getByRole('dialog').last();
  await dlg.getByLabel(`Quantity of ${p.name}`).fill('5');
  await dlg.getByRole('button', { name: /Fill remaining/ }).click();
  await dlg.getByLabel('Reason for the edit').fill('wrong quantity');
  await dlg.getByLabel('Admin password').fill('admin123');
  await dlg.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(`Invoice ${inv.sale.invoice_no} updated`)).toBeVisible();
  const list = await call(request, 'sales.list', {});
  const row = list.find((x) => x.invoice_no === inv.sale.invoice_no);
  expect([row.total, row.status]).toEqual([250, 'active']);
  expect((await call(request, 'products.list')).find((x) => x.id === p.id).stock).toBe(15);
});
