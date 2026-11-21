import { test, expect } from '@playwright/test';

// Separate menu pages for Sales / Sales Return / Sales Exchange, Purchase / Purchase Return / Make Purchase,
// Product / Product Setup; SMS settings with 1–20 admin numbers and no invoice-link switch.
const endpoint = 'http://localhost:8787';
const shots = process.env.KARVIO_SHOTS || 'test-results';
let token;
async function call(request, action, payload = {}) {
  const r = await request.post(endpoint, { data: { action, payload, token } });
  const body = await r.json();
  expect(body.ok, `${action}: ${body.error}`).toBe(true);
  return body.data;
}
test.beforeAll(async ({ request }) => { token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token; });
test.beforeEach(async ({ page }) => page.addInitScript(({ endpoint, token }) => {
  localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
  localStorage.setItem('erp_token', token);
}, { endpoint, token }));

test('menu: each list is its own page', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto('/#/');
  const nav = page.locator('nav');
  const HREF = { Sales: 'sales', 'Sales Return': 'sales-returns', 'Sales Exchange': 'sales-exchanges', Purchase: 'purchases', 'Purchase Return': 'purchase-returns', 'Make Purchase': 'purchase-new', Product: 'stock', 'Product Setup': 'product-setup' };
  const go = async (name, title) => { const a = nav.locator(`a[href="#/${HREF[name]}"]`); await expect(a).toContainText(name); await a.click(); await expect(page.locator('.page-head h1')).toHaveText(title); };
  await go('Sales', 'Sales');
  await expect(page.locator('.page-head [role="tablist"]')).toHaveCount(0);
  await go('Sales Return', 'Sales return');
  await expect(page.locator('.dt thead')).toContainText('Return #');
  await go('Sales Exchange', 'Sales exchange');
  await expect(page.locator('.dt thead')).toContainText('Exchange #');
  await go('Purchase', 'Purchase');
  await go('Purchase Return', 'Purchase return');
  await go('Make Purchase', 'Make purchase');
  await expect(page.getByRole('combobox', { name: 'Supplier', exact: true })).toBeVisible();
  await page.screenshot({ path: `${shots}/menu-make-purchase.png` });
  await go('Product', 'Product');
  await expect(page.locator('.page-head').getByRole('button', { name: 'Add product', exact: true })).toBeVisible();
  await go('Product Setup', 'Product setup');
  for (const h of ['Product groups', 'Categories', 'Brands', 'Warranty periods', 'Selling units']) await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible();
  await page.screenshot({ path: `${shots}/menu-product-setup.png` });
});

test('SMS settings: 1 to 20 admin numbers; the invoice link follows {link}', async ({ page, request }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: 'SMS settings', exact: true }).click();
  const sale = page.locator('.smsf-card', { hasText: 'Sale invoice SMS' });
  await expect(sale).not.toContainText('Add a link to the invoice');
  await expect(sale).toContainText('{link} adds the invoice link');
  const repair = page.locator('.smsf-card', { hasText: 'Repair completed SMS' });
  const box = repair.getByRole('textbox', { name: 'Repair completed SMS numbers' });
  await box.fill('01711000101, 01711000102, 01711000103');
  await expect(repair.locator('.sms-count')).toHaveText('3 / 20');
  await repair.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await call(request, 'bootstrap')).settings.sms_repair_done_numbers).toBe('01711000101, 01711000102, 01711000103');
  await repair.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/sms-repair-numbers.png` });
  const svc = page.locator('.smsf-card', { hasText: 'Service done — to admin / manager' });
  await svc.getByRole('textbox', { name: /Service done.*numbers/ }).fill(Array.from({ length: 21 }, (_, i) => '0171100' + String(1000 + i)).join(', '));
  await expect(svc.locator('.sms-count')).toHaveText('21 / 20');
  await expect(svc.locator('.sms-count')).toHaveClass(/over/);
  await svc.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Service done: up to 20 phone numbers')).toBeVisible();
  const ds = page.locator('.ds-card');
  await ds.getByRole('textbox', { name: 'Daily summary phone numbers' }).fill('01711000201, 01711000202');
  await expect(ds.locator('.sms-count')).toHaveText('2 / 20');
  await svc.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/sms-service-daily.png` });
  await call(request, 'settings.save', { values: { sms_repair_done_numbers: '' } });
});
