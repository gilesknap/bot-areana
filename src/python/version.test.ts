import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PYODIDE_VERSION } from './version';

describe('pyodide version', () => {
  it('browser CDN version matches the npm package used by headless tests', () => {
    const pkg = JSON.parse(readFileSync('node_modules/pyodide/package.json', 'utf8')) as { version: string };
    expect(PYODIDE_VERSION).toBe(pkg.version);
  });
});
