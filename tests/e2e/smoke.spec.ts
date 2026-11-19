import { expect, test } from '@playwright/test';

// Placeholder: the full smoke (build bot, run level 1, victory screen) replaces this.
test('app loads', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('BOT ARENA')).toBeVisible();
});
