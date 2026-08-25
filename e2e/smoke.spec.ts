import { expect, test } from '@playwright/test';

test('приложение поднимается и монтирует корень', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#root')).not.toBeEmpty();
});
