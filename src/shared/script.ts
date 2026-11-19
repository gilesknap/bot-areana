/** Lines that count toward 'lines' star criteria: not blank, not only a comment. */
export function countScriptLines(script: string): number {
  return script.split('\n').filter((line) => {
    const t = line.trim();
    return t !== '' && !t.startsWith('#');
  }).length;
}

/** "00:03.9" from a tick count, as used in the console and run bar. */
export function formatTicks(tick: number, tickRate = 30): string {
  const tenths = Math.floor((tick * 10) / tickRate);
  const mins = Math.floor(tenths / 600);
  const secs = Math.floor((tenths % 600) / 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths % 10}`;
}
