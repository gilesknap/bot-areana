/** Share a bot (design + script) as a compressed string for the URL hash (#/share/<payload>). */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { SharePayload } from '../shared/save';
import { parseDesign } from './data';

export function encodeShare(p: SharePayload): string {
  return compressToEncodedURIComponent(JSON.stringify(p));
}

/** The payload, or null if the string is damaged or not a share link. */
export function decodeShare(s: string): SharePayload | null {
  let raw: unknown;
  try {
    raw = JSON.parse(decompressFromEncodedURIComponent(s) ?? '');
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const design = parseDesign(r.design);
  if (r.v !== 1 || !design || typeof r.script !== 'string') return null;
  const out: SharePayload = { v: 1, design, script: r.script };
  if (typeof r.name === 'string') out.name = r.name.slice(0, 40);
  if (typeof r.level === 'string') out.level = r.level;
  return out;
}
