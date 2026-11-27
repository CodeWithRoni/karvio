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
  await expect(page.getByRole('heading', { name: 'Steadfast', exact: true })).toBeVisible();
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

test('manual challan accepts an unlisted courier and ERP recipients without an order', async ({ page, request }) => {
  const stamp = Date.now();
  const customer = `Challan customer ${stamp}`;
  const supplier = `Challan supplier ${stamp}`;
  const customerPhone = '018' + String(stamp).slice(-8);
  const supplierPhone = '017' + String(stamp).slice(-8);
  await call(request, 'customer.save', { name: customer, phones: [customerPhone], addresses: ['Bera, Pabna'] });
  await call(request, 'supplier.save', { name: supplier, phones: [supplierPhone], address: 'Shahzadpur, Sirajganj' });
  await page.goto('/#/delivery-challan');
  await page.getByRole('button', { name: '+ Manual Challan' }).click();
  const form = page.getByRole('dialog', { name: 'Manual Delivery Challan' });
  await form.getByLabel('Recipient source').selectOption('customer');
  await form.getByLabel('Search customer').fill(customer);
  await form.getByRole('option', { name: new RegExp(customer) }).click();
  await expect(form.getByLabel('Recipient name')).toHaveValue(customer);
  await expect(form.getByLabel('Recipient phone')).toHaveValue(customerPhone);
  await expect(form.getByLabel('Delivery address')).toHaveValue('Bera, Pabna');
  await form.getByLabel('Recipient source').selectOption('supplier');
  await form.getByLabel('Search supplier').fill(supplier);
  await form.getByRole('option', { name: new RegExp(supplier) }).click();
  await expect(form.getByLabel('Recipient name')).toHaveValue(supplier);
  await expect(form.getByLabel('Recipient phone')).toHaveValue(supplierPhone);
  await expect(form.getByLabel('Delivery address')).toHaveValue('Shahzadpur, Sirajganj');
  await form.getByLabel('Delivery address').fill('Supplier warehouse, Sirajganj');
  await form.getByLabel('Courier name').fill('Local Parcel Service');
  await form.getByRole('group', { name: 'Product 1', exact: true }).getByLabel('Product name').fill('22 Inch Monitor');
  await form.getByLabel('Serial numbers (optional)').fill('MON-123');
  await form.getByRole('button', { name: '+ Add product' }).click();
  await form.getByRole('group', { name: 'Product 2', exact: true }).getByLabel('Product name').fill('HDMI Cable');
  await form.getByLabel('Booking type').selectOption('cash');
  await form.getByLabel('Courier charge').fill('125');
  const { accounts } = await call(request, 'bootstrap');
  const cash = accounts.find((a) => a.type === 'cash');
  await form.getByLabel('Paid from').selectOption(cash.id);
  await form.getByRole('button', { name: 'Preview challan' }).click();
  const preview = form.frameLocator('iframe[title="Delivery Challan preview"]');
  await expect(preview.locator('.challan')).toContainText('Local Parcel Service');
  await expect(preview.locator('.challan')).toContainText('Supplier warehouse, Sirajganj');
  await expect(preview.getByRole('table')).toContainText('MON-123');
  await expect(preview.getByRole('table')).toContainText('HDMI Cable');
  await form.getByRole('button', { name: 'Edit details' }).click();
  await expect(form.getByRole('group', { name: 'Product 2', exact: true }).getByLabel('Product name')).toHaveValue('HDMI Cable');
  await form.getByRole('button', { name: 'Preview challan' }).click();
  await form.getByRole('button', { name: 'Save booking' }).click();
  await expect(form.getByRole('button', { name: 'Print / Save as PDF' })).toBeEnabled();
  const booking = (await call(request, 'orders.list', { include_manual: true })).manual.find((o) => o.customer.name === supplier);
  expect(booking.courier.charge).toBe(125);
  const expenses = await call(request, 'expenses.list');
  expect(expenses.find((e) => e.id === booking.expense_id)).toMatchObject({ category: 'Transport', amount: 125, account_id: cash.id });
  expect((await call(request, 'orders.list')).orders.some((o) => o.id === booking.id)).toBe(false);
  await form.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(page.getByRole('row').filter({ hasText: booking.no })).toHaveCount(1);
  await page.getByRole('link', { name: 'Delivery Report' }).click();
  await page.getByLabel('Delivery source', { exact: true }).selectOption('manual');
  await expect(page.getByRole('row').filter({ hasText: booking.no })).toContainText('2 pcs');
  await page.getByLabel('Booking payment', { exact: true }).selectOption('due');
  await expect(page.getByRole('row').filter({ hasText: booking.no })).toHaveCount(0);
  await page.getByLabel('Delivery source', { exact: true }).selectOption('online');
  await expect(page.getByRole('row').filter({ hasText: booking.no })).toHaveCount(0);
});

test('Settings → Courier keeps the API keys and tells when they are missing', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: 'Courier' }).click();
  await expect(page.getByRole('heading', { name: 'Steadfast' })).toBeVisible();
  await page.locator('.courier-card', { hasText: 'Steadfast' }).getByRole('button', { name: 'Test the keys' }).click();
  await expect(page.getByText(/Steadfast is not set up/)).toBeVisible();
});

test('courier cards have aligned edges within each responsive row', async ({ page }) => {
  await page.goto('/#/courier');
  for (const width of [1920, 1000, 390]) {
    await page.setViewportSize({ width, height: 920 });
    for (const [selector, columns] of [
      ['.courier-metrics > .card', width <= 620 ? 2 : 4],
      ['.courier-provider-grid > .card', width <= 620 ? 1 : width <= 1250 ? 2 : 4]
    ]) {
      const cards = page.locator(selector);
      await expect(cards).toHaveCount(4);
      const boxes = await cards.evaluateAll((elements) => elements.map((card) => {
        const { top, bottom, width } = card.getBoundingClientRect();
        return { top, bottom, width, margin: getComputedStyle(card).marginTop };
      }));
      for (let i = 0; i < boxes.length; i++) {
        const rowStart = boxes[i - i % columns];
        expect(boxes[i].top).toBeCloseTo(rowStart.top, 0);
        expect(boxes[i].bottom).toBeCloseTo(rowStart.bottom, 0);
        expect(boxes[i].width).toBeCloseTo(rowStart.width, 0);
        expect(boxes[i].margin).toBe('0px');
      }
    }
  }
});

test('courier overview searches bookings, edits rates and opens filtered workflows', async ({ page, request }) => {
  const stamp = Date.now();
  const booking = await call(request, 'courier.manual.save', {
    booking: 'due',
    customer: { name: 'Courier overview customer', phone: '01712345678', address: 'Pabna' },
    courier: { label: 'Steadfast', tracking: `HUB-${stamp}` },
    items: [{ name: 'USB cable', qty: 1, unit: 'pcs' }]
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/courier');
  const provider = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Steadfast', exact: true }) });
  await expect(provider).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await provider.getByRole('button', { name: 'Edit rates' }).click();
  const rates = page.getByRole('dialog', { name: 'Rates · Steadfast' });
  await rates.getByLabel('Inside Dhaka (৳)', { exact: true }).fill('65');
  await rates.getByLabel('COD fee (%)').fill('1.25');
  await rates.getByLabel('Terms').fill('Up to 1 kg');
  await rates.getByRole('button', { name: 'Save rates' }).click();
  await expect(provider.getByText('Up to 1 kg')).toBeVisible();
  await expect(provider.getByText('1.25%', { exact: true })).toBeVisible();

  await provider.getByRole('button', { name: 'Track Parcel' }).click();
  const search = page.getByRole('region', { name: 'Track a parcel' });
  const input = search.getByRole('searchbox');
  await expect(input).toBeFocused();
  await expect(search.getByRole('combobox')).toHaveValue('steadfast');
  await input.fill(`hub-${stamp}`);
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(search.getByText(booking.no, { exact: true })).toBeVisible();
  await expect(search.getByText('Booked manually', { exact: true })).toBeVisible();

  await provider.getByRole('link', { name: 'View Orders' }).click();
  await expect(page).toHaveURL(/online-orders\?courier=steadfast$/);
  await expect(page.getByRole('combobox', { name: 'Courier', exact: true })).toHaveValue('steadfast');

  await page.goto('/#/courier');
  await provider.getByRole('link', { name: 'Create Challan' }).click();
  const challan = page.getByRole('dialog', { name: 'Manual Delivery Challan' });
  await expect(challan.getByLabel('Courier name')).toHaveValue('Steadfast');
  await challan.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/delivery-challan$/);

  await page.goto('/#/courier');
  await page.getByRole('link', { name: /Delivered.*View report/i }).click();
  await expect(page).toHaveURL(/delivery-report\?activity=delivered&day=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole('button', { name: 'Clear activity' })).toBeVisible();
});
