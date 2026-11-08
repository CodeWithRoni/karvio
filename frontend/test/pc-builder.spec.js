import { test, expect } from '@playwright/test';

// PC builder: a part that is not in stock (or not in Karvio) can be typed by hand under the product list.
const endpoint = 'http://localhost:8787';
let token, mouse;
async function call(request, action, payload = {}) {
  const r = await request.post(endpoint, { data: { action, payload, token } });
  const body = await r.json();
  expect(body.ok, body.error).toBe(true);
  return body.data;
}
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  const boot = await call(request, 'bootstrap');
  mouse = boot.products.find((p) => p.barcode === 'PCB-MOUSE-1');
  if (!mouse) {
    mouse = await call(request, 'product.save', { name: 'PCB Test Mouse', barcode: 'PCB-MOUSE-1', sale_price: 650 });
    await call(request, 'purchase.create', { items: [{ product_id: mouse.id, qty: 5, cost: 400 }], payments: [{ account_id: boot.accounts[0].id, amount: 2000 }] });
  }
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => {
    localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
    localStorage.setItem('erp_token', token);
    localStorage.removeItem('erp_pos_draft');
  }, { endpoint, token });
});

test('a part typed by hand goes on the quote but not to the POS', async ({ page }) => {
  await page.goto('/#/pc-builder');
  await expect(page.locator('.page-head h1')).toHaveText('PC builder & quotations');
  const row = (name) => page.locator('.pcb-row').filter({ has: page.locator('.g', { hasText: new RegExp(`^${name}$`) }) });

  // Every part has a box to type it by hand.
  await expect(page.locator('.pcb-manual')).toHaveCount(12);
  await expect(page.getByRole('button', { name: 'Print / PDF quote' })).toBeDisabled();

  const cpu = row('Processor');
  await cpu.getByLabel('Processor typed by hand').fill('Ryzen 7 7700 (order)');
  await cpu.getByLabel('Price').fill('30000');
  await expect(cpu.locator('b.num')).toHaveText('30,000');
  await expect(page.locator('.totals')).toContainText('1 parts');
  await expect(page.locator('.totals .grand')).toContainText('30,000');
  await expect(page.getByRole('button', { name: 'Print / PDF quote' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save quote' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Send to POS' })).toBeDisabled();

  // Choosing a product from the list replaces the typed text, and typing replaces the product.
  const m = row('Mouse');
  await m.getByRole('combobox').selectOption(mouse.id);
  await expect(m.getByLabel('Price')).toHaveValue('650');
  await expect(m.getByLabel('Mouse typed by hand')).toHaveValue('');
  await m.getByLabel('Mouse typed by hand').fill('Logitech G502');
  await expect(m.getByRole('combobox')).toHaveValue('');
  await expect(m.getByLabel('Price')).toHaveValue('');
  await m.getByRole('combobox').selectOption(mouse.id);
  await expect(m.getByLabel('Mouse typed by hand')).toHaveValue('');
  await expect(page.locator('.totals')).toContainText('2 parts');
  await expect(page.locator('.totals .grand')).toContainText('30,650');

  // Clearing the typed text removes that part from the quote.
  await cpu.getByLabel('Processor typed by hand').fill('   ');
  await expect(page.locator('.totals')).toContainText('1 parts');
  await cpu.getByLabel('Processor typed by hand').fill('Ryzen 7 7700 (order)');
  await cpu.getByLabel('Price').fill('30000');

  // Send to POS: only the stocked mouse goes; the typed processor is reported.
  await page.getByRole('button', { name: 'Send to POS' }).click();
  await expect(page.locator('.toast').last()).toContainText('1 typed part was not sent to the POS');
  await expect(page).toHaveURL(/#\/pos/);
  await expect(page.getByText('PCB Test Mouse').first()).toBeVisible();
  await expect(page.getByText('Ryzen 7 7700')).toHaveCount(0);
});
