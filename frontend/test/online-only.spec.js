import { test, expect } from '@playwright/test';
test('connection loss blocks the app and reconnect restores the current form', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByRole('alertdialog')).toContainText('Internet connection required');
  await expect(page.locator('[inert]')).toHaveCount(1);
  await context.setOffline(false);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('[inert]')).toHaveCount(0);
});
