import { test, expect } from '@playwright/test';
// Service jobs: the admin builds the service list and gives a job to a technician with products from stock; the
// technician presses Work done; the admin completes it with what was used (the rest back to stock) and an invoice.
const endpoint = 'http://localhost:8787';
const shots = process.env.KARVIO_SHOTS || '';
const shot = (page, name, full = true) => (shots ? page.screenshot({ path: `${shots}/${name}.png`, fullPage: full }) : null);
async function login(request, username, password) { return (await (await request.post(endpoint, { data: { action: 'login', payload: { username, password } } })).json()).data.token; }
const callAs = (request, token) => async (action, payload = {}) => { const r = await (await request.post(endpoint, { data: { action, payload, token } })).json(); expect(r.ok, r.error).toBe(true); return r.data; };
async function open(page, token) { await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token }); }

test('a service job from start to invoice', async ({ browser, request }) => {
  test.setTimeout(90000);
  const stamp = Date.now() % 100000, call = callAs(request, await login(request, 'admin', 'admin123'));
  const tech = `svtech${stamp}`;
  await call('user.save', { name: `Rakib ${stamp}`, username: tech, role: 'technician', password: 'tech-pass-123', phone: '01711' + String(stamp).padStart(6, '0') });
  const camera = await call('product.save', { name: `Dahua 2MP camera ${stamp}`, sale_price: 2200, has_warranty: true, warranty_type: 'serial', warranty_days: 365 });
  const rj = await call('product.save', { name: `RJ45 connector ${stamp}`, sale_price: 10 });
  const sup = await call('supplier.save', { name: `Cam sup ${stamp}` });
  const sn = [1, 2, 3, 4, 5].map((i) => `C${stamp}-${i}`);
  await call('purchase.create', { supplier_id: sup.id, items: [{ product_id: camera.id, qty: 5, cost: 1800, sale_price: 2200, serials: sn }, { product_id: rj.id, qty: 50, cost: 5, sale_price: 10 }], payments: [] });

  // admin: service list
  const admin = await browser.newPage(); await open(admin, await login(request, 'admin', 'admin123'));
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await admin.goto('/#/service');
  await admin.locator('.page-head').getByRole('button', { name: 'Service list' }).click();
  const list = admin.getByRole('dialog', { name: 'Service list' });
  const svc = `CC Camera Installation ${stamp}`;
  await list.getByLabel('Service name').fill(svc); await list.getByLabel('Usual charge').fill('1500');
  await list.getByRole('button', { name: 'Add' }).click();
  await expect(list.locator('tbody tr').filter({ hasText: svc })).toContainText('1,500');
  await shot(admin, '1-service-list', false);
  await list.getByRole('button', { name: 'Close', exact: true }).last().click();

  // new service: new customer, technician, 5 cameras + 20 connectors
  await admin.getByRole('button', { name: 'New service' }).click();
  const form = admin.getByRole('dialog', { name: 'New service' });
  await form.getByLabel('Or new customer name').fill(`Karim ${stamp}`);
  await form.getByLabel('Phone').fill('0181' + String(stamp).padStart(7, '0'));
  await form.getByLabel('Service', { exact: true }).selectOption({ label: svc });
  await expect(form.getByLabel('Service charge')).toHaveValue('1500');
  await form.getByLabel('Technician').selectOption({ label: `Rakib ${stamp}` });
  await form.getByLabel('Work details').fill('4 cameras at the shop front, DVR in the office');
  await form.getByLabel('Work address').fill('House 12, Road 5, Mirpur 10');
  await form.getByPlaceholder(/Search a product in stock/).fill(`Dahua 2MP camera ${stamp}`);
  await admin.getByText(`Dahua 2MP camera ${stamp}`).last().click();
  for (const s of sn) { await form.getByText(s, { exact: true }).click(); }
  await form.getByPlaceholder(/Search a product in stock/).fill(`RJ45 connector ${stamp}`);
  await admin.getByText(`RJ45 connector ${stamp}`).last().click();
  await form.getByLabel(`Qty of RJ45 connector ${stamp}`).fill('20');
  await shot(admin, '2-new-service');
  await form.getByRole('button', { name: 'Save service' }).click();
  await expect(admin.getByText('Service created — it is Pending')).toBeVisible();
  await admin.keyboard.press('Escape');
  const row = admin.locator('tbody tr').filter({ hasText: `Karim ${stamp}` });
  await expect(row).toContainText('Pending');
  await shot(admin, '3-service-list-pending', false);

  // technician: own jobs only, Work done
  const techPage = await browser.newPage(); await open(techPage, await login(request, tech, 'tech-pass-123'));
  await techPage.setViewportSize({ width: 390, height: 844 });
  await techPage.goto('/#/service');
  await techPage.locator('tbody tr').filter({ hasText: `Karim ${stamp}` }).click();
  const tj = techPage.getByRole('dialog', { name: /^Service SRV-/ });
  await expect(tj).toContainText('House 12, Road 5, Mirpur 10');
  await expect(tj.getByRole('button', { name: 'Complete & invoice' })).toHaveCount(0);
  await tj.getByLabel('Note with Work done (optional)').fill('3 cameras fitted, 2 cameras and 5 connectors back');
  await shot(techPage, '4-technician-mobile');
  await tj.getByRole('button', { name: 'Work done' }).click();
  await expect(techPage.getByText(/: work done$/)).toBeVisible();

  // admin: complete with 3 cameras and 15 connectors
  await admin.reload();
  await admin.getByRole('button', { name: /Work done/ }).first().click();
  await admin.locator('tbody tr').filter({ hasText: `Karim ${stamp}` }).click();
  const dj = admin.getByRole('dialog', { name: /^Service SRV-/ });
  await expect(dj).toContainText('3 cameras fitted');
  await dj.getByRole('button', { name: 'Complete & invoice' }).click();
  const cp = admin.getByRole('dialog', { name: /^Complete SRV-/ });
  await cp.getByLabel(sn[3]).uncheck(); await cp.getByLabel(sn[4]).uncheck();
  await cp.getByLabel(`Used qty of RJ45 connector ${stamp}`).fill('15');
  await cp.getByLabel('Amount received').fill('5000');
  await expect(cp).toContainText('Back to stock: 2 pcs');
  await shot(admin, '5-complete');
  await cp.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(admin.getByText(/completed — unused products are back in stock/)).toBeVisible();
  const cust = (await call('customers.list')).find((c) => c.name === `Karim ${stamp}`);
  expect(cust.balance).toBe(3 * 2200 + 15 * 10 + 1500 - 5000);
  const prods = await call('products.list');
  expect(prods.find((p) => p.id === camera.id).stock).toBe(2);
  expect(prods.find((p) => p.id === rj.id).stock).toBe(35);
  const after = admin.getByRole('dialog', { name: /^Service SRV-/ });
  await expect(after).toContainText('Completed');
  await expect(after.getByRole('button', { name: 'Print invoice' })).toBeVisible();
  await shot(admin, '6-completed', false);
  await admin.keyboard.press('Escape');
  await admin.getByRole('button', { name: /Completed/ }).first().click();
  await expect(admin.locator('tbody tr').filter({ hasText: `Karim ${stamp}` })).toContainText('Completed');
});
