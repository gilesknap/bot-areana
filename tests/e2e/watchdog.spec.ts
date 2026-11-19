import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { setCode, shot, watchBrowser } from './helpers';

// A script stuck in a loop is stopped with a friendly message; the worker restarts (and locks
// itself down again) so the next run works.

const SOLUTION = readFileSync(new URL('../../src/levels/solutions/l01.py', import.meta.url), 'utf8');

test('a stuck loop is stopped and the next run still works', async ({ page }) => {
  const errors = watchBrowser(page);

  await page.goto('./#/level/l01/code');
  await expect(page.getByText('Python is ready', { exact: false })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('group', { name: 'Playback speed' }).getByRole('button', { name: '4×' }).click();

  await setCode(page, 'while True:\n    pass\n');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByText('thinking too hard', { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  const defeat = page.getByRole('dialog', { name: 'Defeat' });
  await expect(defeat).toBeVisible({ timeout: 30_000 });
  await shot(page, 'watchdog');
  await defeat.getByRole('button', { name: 'Edit & retry' }).click();

  await setCode(page, SOLUTION);
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByRole('dialog', { name: 'Victory' })).toBeVisible({ timeout: 60_000 });

  expect(errors).toEqual([]);
});
