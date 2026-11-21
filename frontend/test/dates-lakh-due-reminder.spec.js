import { test, expect } from '@playwright/test';

// Date fields read "15 Nov 2026", invoices use lakh commas, due reminder SMS to ticked customers.
const endpoint = 'http://localhost:8787';
let token, cash, today;
async function call(request, action, payload = {}) {
  const r = await (await request.post(endpoint, { data: { action, payload, token } })).json();
  expect(r.ok, r.error).toBe(true);
  return r.data;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pretty = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}`; };
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  const b = await call(request, 'bootstrap'); cash = b.accounts[0].id; today = b.serverToday;
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token });
});

test('date fields show 15 Nov 2026, take typed dates and have a calendar', async ({ page }) => {
  await page.goto('/#/expenses');
  const from = page.getByLabel('From date', { exact: true });
  await from.fill('5/1/2026'); await from.blur();
  await expect(from).toHaveValue('5 Jan 2026');
  await from.fill('2026-02-03'); await from.blur();
  await expect(from).toHaveValue('3 Feb 2026');
  await from.fill('nonsense'); await from.blur();
  await expect(from).toHaveValue('3 Feb 2026');
  await from.click();
  const cal = page.getByRole('dialog', { name: 'Choose a date' });
  await expect(cal).toContainText('February 2026');
  await cal.getByRole('button', { name: 'Next month' }).click();
  await cal.getByRole('button', { name: '10 Mar 2026', exact: true }).click();
  await expect(cal).toHaveCount(0);
  await expect(from).toHaveValue('10 Mar 2026');
  await from.click(); await page.getByRole('dialog', { name: 'Choose a date' }).getByRole('button', { name: 'Today', exact: true }).click();
  await expect(from).toHaveValue(pretty(today));
  await from.press('ArrowDown');
  const y = new Date(Date.parse(today + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
  await expect(from).toHaveValue(pretty(y));
  // Day close cannot go past today: later days are disabled.
  await page.goto('/#/cash-bank?tab=dayclose');
  const day = page.getByLabel('Day to close');
  await expect(day).toHaveValue(pretty(today));
  await day.click();
  const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
  if (tomorrow.slice(0, 7) === today.slice(0, 7)) await expect(page.getByRole('dialog', { name: 'Choose a date' }).getByRole('button', { name: pretty(tomorrow), exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Choose a date' })).toHaveCount(0);
});

test('A4 invoice amounts use lakh commas', async ({ page, request }) => {
  const c = await call(request, 'customer.save', { name: `Lakh ${Date.now()}` });
  const svc = await call(request, 'product.save', { name: `Lakh service ${Date.now()}`, service: true, sale_price: 125000 });
  const s = await call(request, 'sale.create', { customer_id: c.id, items: [{ product_id: svc.id, qty: 2, price: 125000 }], payments: [{ account_id: cash, amount: 100000 }] });
  await page.goto('/#/');
  const html = await page.evaluate(async (id) => {
    const { api } = await import('/src/lib/api.js'); const sd = await import('/src/lib/salesDocs.js'); const st = await import('/src/lib/store.js');
    st.useStore.setState((x) => ({ settings: { ...x.settings, invoice_template: 'business' } }));
    return sd.saleDocHtml(await api('sale.detail', { id }), 'a4');
  }, s.sale.id);
  expect(html).toContain('2,50,000.00');
  expect(html).toContain('1,25,000.00');
  expect(html).not.toContain('250,000');
});

test('due reminder SMS goes to the ticked customers with dues', async ({ page, request }) => {
  const stamp = Date.now();
  const svc = await call(request, 'product.save', { name: `Remind svc ${stamp}`, service: true, sale_price: 100 });
  const a = await call(request, 'customer.save', { name: `Remind A ${stamp}`, phones: '01812345678' });
  const b = await call(request, 'customer.save', { name: `Remind B ${stamp}`, phones: '' });
  for (const c of [a, b]) await call(request, 'sale.create', { customer_id: c.id, items: [{ product_id: svc.id, qty: 1, price: 150000 }], payments: [] });
  await call(request, 'settings.save', { values: { sms_enabled: 'false' } });
  await page.goto('/#/collection');
  await page.getByRole('tab', { name: 'With dues' }).click();
  await page.getByLabel('Search customers').fill(`Remind ${stamp}`);
  const btn = page.getByRole('button', { name: /^Send due reminder/ });
  await expect(btn).toBeDisabled();
  await page.getByLabel(`Select Remind A ${stamp}`).check();
  await page.getByLabel(`Select Remind B ${stamp}`).check();
  await btn.click();
  let dlg = page.getByRole('dialog', { name: 'Send due reminder — 1 customer' });
  await expect(dlg).toContainText('SMS gateway is off');
  await expect(dlg.getByRole('button', { name: 'Send 1 SMS' })).toBeDisabled();
  await expect(dlg).toContainText(`Dear Remind A ${stamp}, your due at`);
  await expect(dlg).toContainText('is Tk 1,50,000.');
  await expect(dlg).toContainText('Skipped — no phone number.');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await call(request, 'settings.save', { values: { sms_enabled: 'true', sms_url: 'https://sms.example.com/send?to={number}&text={message}', sms_method: 'GET' } });
  await page.reload();
  await page.getByRole('tab', { name: 'With dues' }).click();
  await page.getByLabel('Search customers').fill(`Remind ${stamp}`);
  await page.getByLabel(`Select Remind A ${stamp}`).check();
  await page.getByRole('button', { name: 'Send due reminder (1)' }).click();
  dlg = page.getByRole('dialog', { name: 'Send due reminder — 1 customer' });
  await dlg.getByLabel('Reminder message').fill('Hi {name}, Tk {due} is due.');
  await expect(dlg).toContainText(`Hi Remind A ${stamp}, Tk 1,50,000 is due.`);
  await dlg.getByRole('button', { name: 'Send 1 SMS' }).click();
  await expect(page.getByText('Due reminder sent to 1 customer')).toBeVisible();
  await expect(dlg.locator('.badge-ok')).toHaveText('sent');
  await dlg.getByRole('button', { name: 'Done' }).click();
  const log = await call(request, 'sms.log');
  expect((log.rows || log).some((x) => x.message === `Hi Remind A ${stamp}, Tk 1,50,000 is due.`)).toBe(true);
  await call(request, 'settings.save', { values: { sms_enabled: 'false', sms_due_template: '' } });
});

test('typing a date applies it only when the whole date is there', async ({ page }) => {
  await page.goto('/#/expenses');
  const from = page.getByLabel('From date', { exact: true });
  await expect(page.locator('.exp-summary, .empty').first()).toBeVisible();
  const calls = [];
  page.on('request', (r) => { if (r.method() === 'POST' && /expenses\.list/.test(r.postData() || '')) calls.push(r.postData()); });
  await from.fill('');
  await from.pressSequentially('5/1');
  await page.waitForTimeout(400);
  expect(calls.length, 'no reload for "5/1"').toBe(0);
  await from.pressSequentially('0/202');
  await page.waitForTimeout(300);
  expect(calls.length, 'no reload for "5/10/202"').toBe(0);
  await from.pressSequentially('6');
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  await from.blur();
  await expect(from).toHaveValue('5 Oct 2026');
  await from.fill('3/2');
  await from.press('Enter');
  const y = new Date().getFullYear();
  await expect(from).toHaveValue(new RegExp(`^3 Feb (${y}|${y - 1}|${y + 1})$`));
});

test('due reminder counts only the ticked customers under the open tab', async ({ page, request }) => {
  const stamp = Date.now();
  const svc = await call(request, 'product.save', { name: `Tab svc ${stamp}`, service: true, sale_price: 100 });
  const ph = () => '017' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const owes = await call(request, 'customer.save', { name: `Tab owes ${stamp}`, phones: ph() });
  await call(request, 'customer.save', { name: `Tab clear ${stamp}`, phones: ph() });
  await call(request, 'sale.create', { customer_id: owes.id, items: [{ product_id: svc.id, qty: 1, price: 500 }], payments: [] });
  await page.goto('/#/collection');
  await page.getByRole('tab', { name: 'All', exact: true }).click();
  await page.getByLabel('Search customers').fill(`Tab ${stamp}`);
  await page.getByLabel(`Select Tab owes ${stamp}`).check();
  await page.getByLabel(`Select Tab clear ${stamp}`).check();
  await expect(page.getByRole('button', { name: 'Send due reminder (2)' })).toBeVisible();
  await page.getByRole('tab', { name: 'With dues' }).click();
  await page.getByLabel('Search customers').fill(`Tab ${stamp}`);
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Send due reminder (1)' }).click();
  await expect(page.getByRole('dialog', { name: 'Send due reminder — 1 customer' })).toBeVisible();
});
