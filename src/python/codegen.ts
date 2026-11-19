/**
 * Generates the Python source for a design's `bot` object from the API spec (src/parts/api.ts):
 * one class per fitted attribute plus `Bot`, with real signatures and docstrings, so help(),
 * argument errors and defaults all behave like normal Python.
 *
 * The source runs in bootstrap.py's `run_player`, which supplies `_Part`, `_BotBase`, `_num`,
 * `_call(attr, method, args, returns)` and `_log(values)`.
 */
import type { ApiMethod, PartApi } from '../shared/api';
import type { BotDesign } from '../shared/parts';
import { botApi, signature } from '../parts/api';

/** A JSON string literal is also a valid Python string literal. */
const pyStr = (s: string): string => JSON.stringify(s);

const className = (attr: string): string =>
  attr
    .split('_')
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('');

function docstring(m: ApiMethod): string {
  const lines = [m.summary, '', m.doc];
  for (const p of m.params) lines.push(`  ${p.name}: ${p.doc}`);
  if (m.raises?.length) lines.push(`Raises ${m.raises.join(', ')}.`);
  if (m.example) lines.push('', 'Example:', ...m.example.split('\n').map((l) => `    ${l}`));
  return pyStr(lines.join('\n'));
}

function methodSource(attr: string, m: ApiMethod): string {
  const where = attr ? `bot.${attr}.${m.name}` : `bot.${m.name}`;
  const params = signature(m).slice(m.name.length + 1, -1);
  const head = `    def ${m.name}(self${params ? ', ' + params : ''}):\n        ${docstring(m)}\n`;
  // bot.log() is handled entirely in Python and takes no simulated time.
  if (attr === '' && m.name === 'log') return `${head}        _log(${m.params[0]!.name})\n`;
  const args = m.params.map((p) => {
    if (p.type === 'float' || p.type === 'int') return `_num(${p.name}, ${pyStr(p.name)}, ${pyStr(where)})`;
    if (p.type === 'bool') return `bool(${p.name})`;
    return p.name;
  });
  return `${head}        return _call(${pyStr(attr)}, ${pyStr(m.name)}, [${args.join(', ')}], ${pyStr(m.returns)})\n`;
}

function partClass(attr: string, part: string, api: PartApi): string {
  const methods = api.methods.map((m) => methodSource(attr, m)).join('\n');
  return `class ${className(attr)}(_Part):\n    ${pyStr(api.summary)}\n    _attr = ${pyStr(attr)}\n    _part = ${pyStr(part)}\n\n${methods}`;
}

/** Python source defining `class Bot` (and its part classes) for this design. */
export function botSource(design: BotDesign): string {
  const apis = botApi(design);
  const parts = apis.filter((a) => a.attr !== '');
  const out: string[] = [];
  for (const { attr, api } of parts) out.push(partClass(attr, String(api.part), api));

  const core = apis.find((a) => a.attr === '')!.api;
  const init = parts.map(({ attr }) => `        self.${attr} = ${className(attr)}()`);
  const fittedDict = parts.map(({ attr, api }) => `${pyStr(attr)}: ${pyStr(String(api.part))}`).join(', ');
  out.push(
    `class Bot(_BotBase):\n    "Your robot. Only the parts fitted in the Workshop exist on bot."\n` +
      `    _fitted = {${fittedDict}}\n\n` +
      `    def __init__(self):\n${init.length ? init.join('\n') : '        pass'}\n\n` +
      core.methods.map((m) => methodSource('', m)).join('\n'),
  );
  return out.join('\n\n');
}
