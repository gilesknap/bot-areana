import { expect, test } from '@playwright/test';
import { shot, watchBrowser } from './helpers';

// The Pages root redirects to the newest tag; the Settings picker lists switcher.json and moves
// between version folders. (preview:site serves the same build as main/ and v0.1.0/.)

test('root redirects to the newest version and the picker switches versions', async ({ page }) => {
  const errors = watchBrowser(page);

  await page.goto('/bot-areana/');
  await expect(page).toHaveURL(/\/bot-areana\/v0\.1\.0\/$/);
  await expect(page.getByText('BOT ARENA').first()).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  const picker = page.getByRole('combobox', { name: 'Game version' });
  await expect(picker).toHaveValue('v0.1.0');
  await expect(picker.locator('option')).toHaveText(['main', 'v0.1.0']);
  await shot(page, 'versions-settings');

  await picker.selectOption('main');
  await expect(page).toHaveURL(/\/bot-areana\/main\/$/);
  await expect(page.getByText('BOT ARENA').first()).toBeVisible();

  expect(errors).toEqual([]);
});
