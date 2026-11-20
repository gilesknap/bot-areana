import { mkdirSync } from 'node:fs';
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/** Screenshots of each step land here, per browser (uploaded by CI with the rest of test-results). */
export async function shot(page: Page, name: string): Promise<void> {
  const dir = `test-results/screens/${test.info().project.name}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png` });
}

/**
 * Echo the page's and its workers' console output and failed requests into the test log, and
 * collect uncaught errors and console.error messages so the test can assert there were none.
 * (No console errors are known to be benign, so none are allowed.)
 * Also dismisses the first-visit guided tours unless `keepTours`.
 */
export function watchBrowser(page: Page, opts: { keepTours?: boolean } = {}): string[] {
  const errors: string[] = [];
  // A new profile gets a guided tour on its first Workshop and Code & Arena visit: skip it
  // whenever it would get in the way (unless the test is about the tour).
  if (!opts.keepTours) {
    void page.addLocatorHandler(page.getByRole('dialog', { name: 'Guided tour' }), (tour) =>
      tour.getByRole('button', { name: 'Skip tour' }).click(),
    );
  }
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
