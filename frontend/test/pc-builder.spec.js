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
  await page.goto('/#/quotation');
  await expect(page.locator('.page-head h1')).toHaveText('Quotation');
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
  await expect(page.getByRole('button', { name: 'Save quotation' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Send to POS' })).toBeDisabled();

  // Choosing a product from the list replaces the typed text, and typing replaces the product.
  const m = row('Mouse');
  await m.getByLabel('Mouse product').selectOption(mouse.id);
  await expect(m.getByLabel('Price')).toHaveValue('650');
  await expect(m.getByLabel('Mouse typed by hand')).toHaveValue('');
  await m.getByLabel('Mouse typed by hand').fill('Logitech G502');
  await expect(m.getByLabel('Mouse product')).toHaveValue('');
  await expect(m.getByLabel('Price')).toHaveValue('');
  await m.getByLabel('Mouse product').selectOption(mouse.id);
  await expect(m.getByLabel('Mouse typed by hand')).toHaveValue('');
  await expect(page.locator('.totals')).toContainText('2 parts');
  await expect(page.locator('.totals .grand')).toContainText('30,650');

  // Clearing the typed text removes that part from the quote.
  await cpu.getByLabel('Processor typed by hand').fill('   ');
  await expect(page.locator('.totals')).toContainText('1 parts');
  await cpu.getByLabel('Processor typed by hand').fill('Ryzen 7 7700 (order)');
  await cpu.getByLabel('Price').fill('30000');

  // Warranty per line: the shop's warranty periods (or none); it stays while the typed name changes,
  // and it is printed in the Warranty column of the quotation and kept in a saved quote.
  await expect(m.getByLabel('Mouse warranty')).toHaveValue('0');
  await expect(cpu.getByLabel('Processor warranty').locator('option')).toContainText(['No warranty', '300 days warranty', '900 days warranty']);
  await cpu.getByLabel('Processor warranty').selectOption('900');
  await cpu.getByLabel('Processor typed by hand').fill('Ryzen 7 7700 (on order)');
  await expect(cpu.getByLabel('Processor warranty')).toHaveValue('900');
  await page.getByLabel('Customer name').fill('Test Customer'); await page.getByLabel('Phone', { exact: true }).fill('01712345678');
  await page.getByRole('button', { name: 'Print / PDF quote' }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('iframe:last-of-type')?.contentDocument?.body?.innerText || '')).toContain('Ryzen 7 7700 (on order)');
  const printed = await page.evaluate(() => [...document.querySelector('iframe:last-of-type').contentDocument.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.innerText.trim())));
  expect(printed.find((r) => r[1].includes('Ryzen 7 7700'))[2]).toBe('900 days');
  expect(printed.find((r) => r[1].includes('PCB Test Mouse'))[2]).toBe('—');
  await page.getByRole('button', { name: 'Save quotation' }).click();
  await expect(page.getByText(/^Quotation saved — /)).toBeVisible();
  const saved = await page.evaluate(async () => { const { api } = await import('/src/lib/api.js'); return (await api('quotes.list'))[0].lines.find((l) => l.group === 'Processor'); });
  expect([saved.name, saved.warranty]).toEqual(['Ryzen 7 7700 (on order)', '900 days']);

  // Send to POS: only the stocked mouse goes; the typed processor is reported.
  await page.getByRole('button', { name: 'Send to POS' }).click();
  await expect(page.locator('.toast').last()).toContainText('1 typed part was not sent to the POS');
  await expect(page).toHaveURL(/#\/pos/);
  await expect(page.getByText('PCB Test Mouse').first()).toBeVisible();
  await expect(page.getByText('Ryzen 7 7700')).toHaveCount(0);
});

test('quotation warranty is kept and replacing an existing POS cart requires confirmation', async ({ page, request }) => {
  const owner = (await call(request, 'bootstrap')).user.id;
  const key = `erp_pos_draft:${encodeURIComponent(endpoint)}:${encodeURIComponent(owner)}`;
  await page.goto('/#/quotation');
  const row = page.locator('.pcb-row').filter({ has: page.locator('.g', { hasText: /^Mouse$/ }) });
  await row.getByLabel('Mouse product').selectOption(mouse.id);
  await row.getByLabel('Mouse warranty').selectOption('300');
  const old = { cart: [{ product_id: mouse.id, qty: 2, price: 600, serials: [], warranty_days: 0 }], customerId: '', discount: '' };
  await page.evaluate(({key,old}) => localStorage.setItem(key,JSON.stringify(old)),{key,old});
  await page.getByRole('button', {name:'Send to POS'}).click();
  const dialog = page.getByRole('dialog', {name:'Replace the POS cart?'});
  await dialog.getByRole('button', {name:'Cancel',exact:true}).click();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key)).toEqual(old);
  await expect(page).toHaveURL(/#\/quotation/);
  await page.getByRole('button', {name:'Send to POS'}).click();
  await dialog.getByRole('button', {name:'Replace cart',exact:true}).click();
  await expect(page).toHaveURL(/#\/pos/);
  await expect(page.getByLabel('Warranty period')).toHaveValue('300');
});

test('CC Camera quote: its own sixteen rows, kept apart from the PC build, saved and reopened', async ({ page, request }) => {
  const stamp = Date.now() % 100000;
  const dome = await call(request, 'product.save', { name: `Dahua 2MP Dome Camera ${stamp}`, sale_price: 2200 });
  const utp = await call(request, 'product.save', { name: `UTP Cable CAT6 ${stamp}`, sale_price: 35 });
  const acc = (await call(request, 'bootstrap')).accounts[0].id;
  await call(request, 'purchase.create', { items: [{ product_id: dome.id, qty: 10, cost: 1800 }, { product_id: utp.id, qty: 300, cost: 25 }], payments: [{ account_id: acc, amount: 25500 }] });
  await page.goto('/#/quotation');
  await expect(page.locator('.page-head h1')).toHaveText('Quotation');
  await page.getByLabel('Mouse product').selectOption(mouse.id);
  await page.getByRole('tab', { name: 'CC Camera' }).click();
  const rows = await page.locator('.pcb-row .g').allInnerTexts();
  expect(rows).toEqual(['DVR / NVR', 'Bullet Camera', 'Dome Camera', 'HDD (Hard Disk Drive)', 'Monitor', 'Video Balun', 'Adapter', 'POE Switch', 'UTP Cable', 'Power/AC Cable', 'Junction Box', 'Camera Stand', 'Server Rack', 'Accessories', 'Wall Mount', 'Giga Switch']);
  await expect(page.getByLabel('Quote title')).toHaveValue('CC Camera setup');
  // each row offers its own products
  await expect(page.getByLabel('Dome Camera product').locator('option', { hasText: dome.name })).toHaveCount(1);
  await expect(page.getByLabel('Bullet Camera product').locator('option', { hasText: dome.name })).toHaveCount(0);
  await page.getByLabel('Dome Camera product').selectOption(dome.id);
  await page.locator('.pcb-row').filter({ has: page.getByLabel('Dome Camera product') }).getByLabel('Qty').fill('4');
  await page.getByLabel('UTP Cable product').selectOption(utp.id);
  await page.locator('.pcb-row').filter({ has: page.getByLabel('UTP Cable product') }).getByLabel('Qty').fill('60');
  await page.getByRole('button', { name: '+ Add another part' }).click();
  await expect(page.locator('.split .totals')).toContainText('2 parts');
  await expect(page.locator('.split .totals')).toContainText('10,900');
  // the PC build is still there
  await page.getByRole('tab', { name: 'PC builder' }).click();
  await expect(page.getByLabel('Mouse product')).toHaveValue(mouse.id);
  await expect(page.getByLabel('Quote title')).toHaveValue('Custom PC build');
  await page.getByRole('tab', { name: 'CC Camera' }).click();
  await expect(page.getByLabel('Dome Camera product')).toHaveValue(dome.id);
  // save, start over, reopen
  // the customer's name and phone are needed to save
  await page.getByRole('button', { name: 'Save quotation' }).click();
  await expect(page.getByText('Customer name is required')).toBeVisible();
  await page.getByLabel('Customer name').fill(`Cam customer ${stamp}`);
  await page.getByLabel('Phone', { exact: true }).fill('0181');
  await page.getByRole('button', { name: 'Save quotation' }).click();
  await expect(page.getByText('Use a mobile number like 01XXXXXXXXX')).toBeVisible();
  await page.getByLabel('Phone', { exact: true }).fill('01819556677');
  await page.getByRole('button', { name: 'Save quotation' }).click();
  await expect(page.getByText(`Quotation saved — Cam customer ${stamp}`)).toBeVisible();
  // Clear asks first, then empties this tab
  await page.getByRole('button', { name: 'Clear this quotation' }).click();
  await page.getByRole('dialog', { name: 'Clear this quotation?' }).getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByLabel('Customer name')).toHaveValue('');
  await expect(page.getByLabel('Dome Camera product')).toHaveValue('');
  await page.getByRole('tab', { name: 'PC builder' }).click();
  await page.getByRole('button', { name: /See Saved Quotations/ }).click();
  const list = page.getByRole('dialog', { name: 'Saved quotations' });
  await list.getByLabel('Search saved quotations').fill(`Cam customer ${stamp}`);
  const saved = list.locator('tbody tr').filter({ hasText: `Cam customer ${stamp}` });
  await expect(saved).toContainText('CC Camera');
  await expect(saved).toContainText('01819556677');
  await expect(saved).toContainText('10,900');
  await saved.getByRole('button', { name: 'Open' }).click();
  await expect(list).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'CC Camera' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Dome Camera product')).toHaveValue(dome.id);
  // an opened quotation is updated in place, then deleted from the list
  await page.locator('.pcb-row').filter({ has: page.getByLabel('Dome Camera product') }).getByLabel('Qty').fill('6');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(`Quotation updated — Cam customer ${stamp}`)).toBeVisible();
  await page.getByRole('button', { name: /See Saved Quotations/ }).click();
  await list.getByLabel('Search saved quotations').fill(`Cam customer ${stamp}`);
  await expect(saved).toHaveCount(1);
  await expect(saved).toContainText('15,300');
  await saved.getByRole('button', { name: /^Delete the quotation/ }).click();
  await page.getByRole('dialog', { name: 'Delete this saved quotation?' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Quotation deleted')).toBeVisible();
  await expect(saved).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Save quotation' })).toBeVisible();
});
