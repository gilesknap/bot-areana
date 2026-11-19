import { mkdirSync } from 'node:fs';
import { expect, type ConsoleMessage, type Page } from '@playwright/test';

/** Screenshots of each step land here (uploaded by CI with the rest of test-results). */
const SHOTS = 'test-results/screens';

export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/**
 * Echo the page's and its workers' console output and failed requests into the test log, and
 * collect uncaught errors and console.error messages so the test can assert there were none.
 * (No console errors are known to be benign, so none are allowed.)
 */
export function watchBrowser(page: Page): string[] {
  const errors: string[] = [];
  const onConsole = (where: string) => (m: ConsoleMessage) => {
    console.log(`[${where} ${m.type()}] ${m.text()}`);
    if (m.type() === 'error') errors.push(`${where} console.error: ${m.text()}`);
  };
  page.on('console', onConsole('page'));
  page.on('pageerror', (e) => {
    console.log(`[page error] ${e.stack ?? e.message}`);
    errors.push(e.message);
  });
  page.on('requestfailed', (r) => console.log(`[request failed] ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('worker', (w) => {
    console.log(`[worker start] ${w.url()}`);
    w.on('console', onConsole('worker'));
    w.on('close', () => console.log(`[worker close] ${w.url()}`));
  });
  return errors;
}

/** Replace everything in the CodeMirror editor with `code`. */
export async function setCode(page: Page, code: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(code);
  await expect(editor).toContainText(code.trim().split('\n')[0]!);
}
