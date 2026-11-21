import { test, expect } from '@playwright/test';

// Expenses: staff for salary, paid in parts, and the red alert above the Monthly expenses limit.
const endpoint = 'http://localhost:8787';
let token, ids = {};
async function call(request, action, payload = {}) {
  const r = await request.post(endpoint, { data: { action, payload, token } });
  const body = await r.json();
  expect(body.ok, body.error).toBe(true);
  return body.data;
}
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  const boot = await call(request, 'bootstrap'), cash = boot.accounts.find((a) => a.type === 'cash') || boot.accounts[0];
  const tag = Date.now().toString().slice(-5);
  let cats = []; try { cats = JSON.parse(boot.settings.expense_categories); } catch {}
  if (!cats.includes('Salary')) await call(request, 'settings.save', { values: { expense_categories: JSON.stringify([...cats, 'Salary']) } });
  await call(request, 'user.save', { name: `Staff ${tag}`, username: `staff${tag}`, role: 'sales', password: 'staff-password-1' });
  const staff = (await call(request, 'users.list')).find((u) => u.username === `staff${tag}`);
  const cur = await call(request, 'expense.recurring');
  await call(request, 'expense.recurring.save', { templates: [...cur.templates, { name: `Salary ${tag}`, category: 'Salary', staff_id: staff.id, amount: 10000, account_id: cash.id, day: 28 }] });
  await call(request, 'expense.create', { category: 'Salary', staff_id: staff.id, amount: 4000, account_id: cash.id, note: 'Advance' });
  ids = { staff, tag };
});
test.beforeEach(async ({ page }) => page.addInitScript(({ endpoint, token }) => {
  localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
  localStorage.setItem('erp_token', token);
}, { endpoint, token }));

test('salary: choose the staff member, see what is left, red alert above the limit', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#/expenses');
  const form = page.locator('form.card');
  await form.getByRole('combobox').nth(0).selectOption('Salary');
  const staff = form.getByRole('combobox', { name: 'Staff' });
  await expect(staff).toBeVisible();
  await staff.selectOption(ids.staff.id);
  await expect(page.locator('.exp-limit')).toContainText('monthly limit');
  await expect(page.locator('.exp-limit')).toContainText('left');
  await form.getByRole('spinbutton').fill('3000');
  await expect(page.locator('.exp-limit.over')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/exp-salary-ok.png' });
  await form.getByRole('spinbutton').fill('7000');
  await expect(page.locator('.exp-limit.over')).toBeVisible();
  await expect(page.locator('.exp-limit.over')).toContainText('More than the monthly limit');
  await expect(form.getByRole('button', { name: 'Add expense' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/exp-salary-over.png' });
  await form.getByRole('spinbutton').fill('2500');
  await form.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.locator('.dt tbody tr').first()).toContainText(`Salary · Staff ${ids.tag}`);
  await expect(page.locator('.exp-limit')).toContainText('3,500');
  await page.getByRole('tab', { name: 'Monthly expenses' }).click();
  await expect(page.locator('.mx-row', { hasText: `Salary ${ids.tag}` })).toContainText(`Staff ${ids.tag}`);
  await page.screenshot({ path: 'test-results/exp-monthly.png' });
});
