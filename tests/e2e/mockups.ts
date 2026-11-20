/**
 * Render the approved mockups (docs/visual/*.dc.html) without their design tool's support.js
 * (not in the repo): a tiny stand-in for its <helmet>, <sc-for> and {{value}} templating.
 */
import { readFileSync } from 'node:fs';

type Scope = Record<string, unknown>;

const lookup = (scope: Scope, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o as Scope | undefined)?.[k], scope);

const subst = (text: string, scope: Scope) => text.replace(/\{\{([\w.]+)\}\}/g, (_, p: string) => String(lookup(scope, p) ?? ''));

/** Expand <sc-for list="{{xs}}" as="x"> blocks (nested ones too) and substitute {{...}}. */
function expand(tpl: string, scope: Scope): string {
  const open = /<sc-for list="\{\{([\w.]+)\}\}" as="(\w+)"[^>]*>/g;
  let out = '';
  let i = 0;
  for (;;) {
    open.lastIndex = i;
    const m = open.exec(tpl);
    if (!m) return out + subst(tpl.slice(i), scope);
    out += subst(tpl.slice(i, m.index), scope);
    const tags = /<sc-for\b|<\/sc-for>/g;
    tags.lastIndex = m.index + m[0].length;
    let depth = 1;
    let close: RegExpExecArray | null = null;
    while (depth && (close = tags.exec(tpl))) depth += close[0] === '</sc-for>' ? -1 : 1;
    if (!close) throw new Error('unclosed <sc-for>');
    const inner = tpl.slice(m.index + m[0].length, close.index);
    for (const item of (lookup(scope, m[1]!) as unknown[]) ?? []) out += expand(inner, { ...scope, [m[2]!]: item });
    i = close.index + close[0].length;
  }
}

/** A standalone HTML page for docs/visual/<name>.dc.html. */
export function mockupHtml(name: string): string {
  const src = readFileSync(new URL(`../../docs/visual/${name}.dc.html`, import.meta.url), 'utf8');
  const helmet = /<helmet>([\s\S]*?)<\/helmet>/.exec(src)?.[1] ?? '';
  const body = /<\/helmet>([\s\S]*?)<\/x-dc>/.exec(src)?.[1] ?? '';
  const script = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(src)?.[1];
  // The mockup's own data script (trusted repo content), run with a stub base class.
  const vals = script ? (new Function('DCLogic', `${script}\nreturn new Component().renderVals();`)(class {}) as Scope) : {};
  return `<!doctype html><html><head><meta charset="utf-8">${helmet}</head><body>${expand(body, vals)}</body></html>`;
}
