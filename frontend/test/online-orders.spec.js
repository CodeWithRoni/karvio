import { test, expect } from '@playwright/test';

// Online orders: take an order, confirm it into an invoice, send it with a courier (by hand), settle the cash on delivery.
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

test('take a Facebook order, confirm it, send it with a courier and settle the cash on delivery', async ({ page, request }) => {
  const stamp = Date.now();
  const tracking = `SB-${stamp}`;
  const p = await call(request, 'product.save', { name: `Order kurti ${stamp}`, sale_price: 900 });
  const sup = await call(request, 'supplier.save', { name: `Order supplier ${stamp}` });
  await call(request, 'purchase.create', { supplier_id: sup.id, items: [{ product_id: p.id, qty: 5, cost: 500, sale_price: 900 }], payments: [] });
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto('/#/online-orders');
  await expect(page.locator('.nav-card', { hasText: 'Sales' }).getByRole('link', { name: /Online Orders/ })).toBeVisible();
  await page.getByRole('button', { name: '+ New order' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Customer name').fill(`Mitu ${stamp}`);
  await dlg.getByLabel('Mobile').fill('01811223344');
  await dlg.getByLabel('Delivery address').fill('Flat 3B, Road 7, Dhanmondi, Dhaka');
  await dlg.getByPlaceholder(/Add a product/).fill(p.name);
  await dlg.getByPlaceholder(/Add a product/).press('Enter');
  await dlg.getByLabel(`Quantity of ${p.name}`).fill('2');
  await dlg.getByLabel('Delivery charge').fill('100');
  await expect(dlg.locator('.oo-totals')).toContainText('Cash on delivery Tk 1,900');
  await dlg.getByRole('button', { name: 'Save order' }).click();

  const view = page.getByRole('dialog', { name: new RegExp(`Mitu ${stamp}`) });
  await expect(view).toContainText(`Mitu ${stamp}`);
  await view.getByRole('button', { name: '✓ Confirm & make invoice' }).click();
  await expect(view.getByRole('button', { name: '🚚 Send with courier' })).toBeVisible();
  await view.getByRole('button', { name: '🚚 Send with courier' }).click();
  const ship = page.getByRole('dialog').last();
  await ship.getByRole('radio', { name: /Other courier/ }).check();
  await ship.getByLabel('Courier name').fill('Sundarban');
  await ship.getByLabel('Tracking number').fill(tracking);
  await ship.getByRole('button', { name: 'Save tracking' }).click();
  await expect(view).toContainText(tracking);
  await view.getByRole('button', { name: 'Courier paid' }).click();
  const settle = page.getByRole('dialog').last();
  await settle.getByLabel('Courier charge').fill('120');
  await settle.getByRole('button', { name: /Save · Tk 1,780 received/ }).click();
  await expect(view).toContainText('Courier paid Tk 1,780');
  expect((await call(request, 'products.list')).find((x) => x.id === p.id).stock).toBe(3);
  await view.getByRole('button', { name: 'Close' }).first().click().catch(() => {});
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: /Paid by courier/ }).click();
  await expect(page.locator('table')).toContainText(`Mitu ${stamp}`);

  const groups = await page.locator('.nav-group-label').allTextContents();
  const courierIndex = groups.indexOf('Courier');
  expect(courierIndex).toBeGreaterThan(0);
  expect(groups.slice(courierIndex - 1, courierIndex + 2)).toEqual(['Sales', 'Courier', 'Purchase']);
  await page.getByRole('link', { name: 'Courier Information' }).click();
  await expect(page.getByRole('table')).toContainText('Steadfast');
  await page.getByRole('link', { name: 'Delivery Report' }).click();
  await page.getByLabel('Courier', { exact: true }).selectOption('Sundarban');
  const reportRow = page.getByRole('row').filter({ hasText: tracking });
  await expect(reportRow).toContainText('Paid by courier');
  await expect(reportRow).toContainText('1,780');
  await page.getByRole('link', { name: 'Delivery Challan' }).click();
  await page.getByRole('row').filter({ hasText: tracking }).click();
  await page.getByLabel('Booking type').selectOption('due');
  const challan = page.frameLocator('iframe[title="Delivery Challan preview"]');
  await expect(challan.getByRole('heading', { name: 'DELIVERY CHALLAN' })).toBeVisible();
  await expect(challan.getByRole('table')).toContainText(p.name);
  await expect(challan.locator('.booking')).toContainText('✓Due Booking');
  await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeEnabled();
});

test('Settings → Courier keeps the API keys and tells when they are missing', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: 'Courier' }).click();
  await expect(page.getByRole('heading', { name: 'Steadfast' })).toBeVisible();
  await page.locator('.courier-card', { hasText: 'Steadfast' }).getByRole('button', { name: 'Test the keys' }).click();
  await expect(page.getByText(/Steadfast is not set up/)).toBeVisible();
});
