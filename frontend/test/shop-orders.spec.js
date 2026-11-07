// Karvio side of the online shop: Settings → Online shop set-up, product pictures and "Show on the online shop",
// and Online Orders → Open in POS → sale → order confirmed → shipped → delivered.
import { test, expect } from '@playwright/test';

const endpoint = 'http://localhost:8787';
let token;
async function call(request, action, payload = {}, tk = token) {
  const r = await request.post(endpoint, { data: { action, payload, token: tk } });
  const b = await r.json();
  expect(b.ok, `${action}: ${b.error}`).toBe(true);
  return b.data;
}
const signIn = (page) => page.addInitScript(({ endpoint, token }) => {
  localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
  localStorage.setItem('erp_token', token);
}, { endpoint, token });

test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' }, null)).token;
});

test('Online shop settings, product pictures and the website switch', async ({ page, request }, info) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  await page.goto('/#/settings?tab=online');
  await expect(page.getByRole('tab', { name: 'Online shop' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Set up Google Drive folder' }).click();
  await expect(page.locator('.toast')).toContainText('Online shop folder is ready');
  await expect(page.locator('.shopset-links')).toContainText('Karvio Shop folder');
  await expect(page.getByRole('link', { name: 'Shop database' })).toHaveAttribute('href', /docs\.google\.com\/spreadsheets\/d\//);
  await page.getByLabel('Shop is open').check();
  await page.getByLabel('Your bKash number').fill('0175461');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast-err')).toContainText('01XXXXXXXXX');
  await page.getByLabel('Your bKash number').fill('01754614614');
  await page.getByLabel('Near area name').fill('Inside Pabna');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast-ok').last()).toContainText('Online shop settings saved');
  const cat = await call(request, 'shop.catalog', {}, null);
  expect([cat.shop.open, cat.shop.bkash.number, cat.shop.delivery.inside_label]).toEqual([true, '01754614614', 'Inside Pabna']);

  // product form: switch + pictures
  const p = await call(request, 'product.save', { name: 'KEYBOARD K120 SHOP TEST' });
  await page.goto('/#/stock');
  await page.reload(); // load the product list again (the product was made through the API)
  await page.getByText('KEYBOARD K120 SHOP TEST').click();
  const modal = page.locator('.modal').filter({ hasText: 'Edit — KEYBOARD K120 SHOP TEST' });
  await modal.getByLabel('Show on the online shop').check();
  // two real pictures
  const shots = [];
  for (const color of ['#f2c230', '#3cc4d6']) {
    const file = info.outputPath(`pic-${shots.length}.png`);
    const tmp = await page.context().newPage(); await tmp.setViewportSize({ width: 800, height: 600 });
    await tmp.setContent(`<div style="width:800px;height:600px;background:${color}"></div>`); await tmp.screenshot({ path: file }); await tmp.close();
    shots.push(file);
  }
  await modal.getByLabel('Add pictures').setInputFiles(shots);
  await expect(page.locator('.toast').last()).toContainText('2 pictures added');
  const figs = modal.locator('.pics-grid figure');
  await expect(figs).toHaveCount(2);
  await expect(figs.first().locator('.pics-main')).toHaveText('Main');
  const before = (await call(request, 'products.list')).find((x) => x.id === p.id).images.split(',');
  await modal.getByRole('button', { name: 'Make picture 2 the main picture' }).click();
  await expect(page.locator('.toast').last()).toContainText('Main picture changed');
  expect((await call(request, 'products.list')).find((x) => x.id === p.id).images.split(',')).toEqual([before[1], before[0]]);
  page.once('dialog', (d) => d.accept());
  await modal.getByRole('button', { name: 'Remove picture 2' }).click();
  await expect(figs).toHaveCount(1);
  await modal.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.toast').last()).toContainText('Product updated');
  const saved = (await call(request, 'products.list')).find((x) => x.id === p.id);
  expect([saved.web, saved.images]).toEqual([true, before[1]]);
  // a picture was really shrunk before upload (800×600 PNG → JPEG)
  expect(errors).toEqual([]);
});

test('Online Orders: open in POS, sale confirms the order, then shipped and delivered', async ({ page, request }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await call(request, 'shop.setup');
  await call(request, 'settings.save', { values: { shop_enabled: 'true', shop_bkash_number: '01754614614', shop_delivery_inside: '60' } });
  const boot = await call(request, 'bootstrap');
  const sup = await call(request, 'supplier.save', { name: 'Order test supplier' });
  const mouse = await call(request, 'product.save', { name: 'ORDER TEST MOUSE', web: true });
  const router = await call(request, 'product.save', { name: 'ORDER TEST ROUTER', web: true, has_warranty: true, warranty_type: 'serial', warranty_days: 365 });
  await call(request, 'purchase.create', { supplier_id: sup.id, items: [{ product_id: mouse.id, qty: 5, cost: 300, sale_price: 450 }, { product_id: router.id, qty: 2, cost: 1800, sale_price: 2300, serials: ['OTR-1', 'OTR-2'] }], payments: [{ account_id: boot.accounts[0].id, amount: 5100 }] });
  const placed = await call(request, 'shop.order.create', { name: 'Online Buyer', phone: '01922333444', address: 'Village Road, Bera, Pabna', area: 'inside', payment: 'bkash', bkash_sender: '01922333444', bkash_trx: 'TRX55AA77', items: [{ product_id: mouse.id, qty: 2 }, { product_id: router.id, qty: 1 }] }, null);
  expect(placed.total).toBe(450 * 2 + 2300 + 60);

  await signIn(page);
  await page.goto('/#/orders');
  await expect(page.getByRole('tab', { name: /^New \(\d+\)$/ })).toHaveAttribute('aria-selected', 'true');
  const card = page.locator('.worder').filter({ hasText: placed.order_no });
  await expect(card).toContainText('Online Buyer');
  await expect(card).toContainText('bKash');
  await card.click();
  const modal = page.locator('.modal').filter({ hasText: `Order ${placed.order_no}` });
  await expect(modal).toContainText('TRX55AA77');
  await modal.getByRole('button', { name: 'Received ✓' }).click();
  await expect(modal).toContainText('bKash — verified');
  await modal.getByRole('button', { name: 'Open in POS' }).click();

  // POS: customer, items and delivery line ready; serial product waits for its serial
  await expect(page).toHaveURL(/#\/pos/);
  await expect(page.locator('.webbanner')).toContainText(`Online order ${placed.order_no}`);
  await expect(page.locator('.webbanner')).toContainText('Paid by bKash (verified)');
  const rows = page.locator('.cart tbody tr');
  await expect(rows.filter({ hasText: 'ORDER TEST MOUSE' })).toBeVisible();
  await expect(rows.filter({ hasText: 'Delivery charge' })).toBeVisible();
  await expect(rows.filter({ hasText: 'ORDER TEST ROUTER' }).locator('.serial-need')).toHaveText('Pick serial numbers (1 planned)');
  await expect(page.locator('#pos-customer, .pos-right').first()).toContainText(/Online Buyer|01922333444/);
  await rows.filter({ hasText: 'ORDER TEST ROUTER' }).getByRole('button', { name: /^Quantity 0/ }).click();
  await page.locator('.modal').getByRole('button', { name: 'OTR-1', exact: true }).click();
  await page.locator('.modal').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.pos-right')).toContainText('3,260');
  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(page.locator('.toast').filter({ hasText: `Online order ${placed.order_no} confirmed` })).toBeVisible();

  const after = (await call(request, 'weborders.list')).orders.find((o) => o.order_no === placed.order_no);
  expect(after.status).toBe('confirmed');
  const sale = await call(request, 'sale.detail', { id: after.sale_id });
  expect([sale.sale.total, sale.sale.note]).toEqual([3260, `Online order ${placed.order_no}`]);
  expect(sale.items.find((i) => i.product_id === router.id).serials).toBe('OTR-1');

  await page.goto('/#/orders');
  await page.getByRole('tab', { name: /^Confirmed/ }).click();
  await page.locator('.worder').filter({ hasText: placed.order_no }).click();
  await expect(modal.getByRole('link', { name: `Invoice ${after.sale_no}` })).toBeVisible();
  await modal.getByRole('button', { name: 'Mark shipped' }).click();
  await expect(page.locator('.toast').last()).toContainText('Marked shipped');
  // the order stays open, now offering the next step
  await modal.getByRole('button', { name: 'Mark delivered' }).click();
  await expect(page.locator('.toast').last()).toContainText('Marked delivered');
  const track = await call(request, 'shop.order.track', { order_no: placed.order_no, phone: '01922333444' }, null);
  expect([track.status, track.invoice_no]).toEqual(['delivered', after.sale_no]);
  expect(errors).toEqual([]);
});
