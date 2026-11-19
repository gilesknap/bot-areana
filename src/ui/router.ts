/** Hash routes (GitHub Pages friendly). */

export type Route =
  | { name: 'campaign'; levelId?: string }
  | { name: 'workshop'; levelId: string; free: boolean }
  | { name: 'code'; levelId: string; free: boolean }
  | { name: 'free' }
  | { name: 'share'; payload: string };

/**
 * #/                     campaign
 * #/level/<id>           campaign with that level's briefing open
 * #/level/<id>/workshop  workshop     (#/free/<id>/workshop in free play)
 * #/level/<id>/code      code & arena (#/free/<id>/code in free play)
 * #/free                 free play level picker
 * #/share/<payload>      load a shared bot
 */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [head, id, sub] = parts;
  if (head === 'share' && id) return { name: 'share', payload: parts.slice(1).join('/') };
  if ((head === 'level' || head === 'free') && id) {
    const free = head === 'free';
    if (sub === 'workshop') return { name: 'workshop', levelId: id, free };
    if (sub === 'code') return { name: 'code', levelId: id, free };
    if (!free) return { name: 'campaign', levelId: id };
  }
  if (head === 'free') return { name: 'free' };
  return { name: 'campaign' };
}

export function routeHash(r: Route): string {
  switch (r.name) {
    case 'campaign':
      return r.levelId ? `#/level/${r.levelId}` : '#/';
    case 'workshop':
    case 'code':
      return `#/${r.free ? 'free' : 'level'}/${r.levelId}/${r.name}`;
    case 'free':
      return '#/free';
    case 'share':
      return `#/share/${r.payload}`;
  }
}

export function navigate(r: Route, replace = false): void {
  const hash = routeHash(r);
  if (replace) history.replaceState(null, '', hash);
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else if (!replace) location.hash = hash;
  else window.dispatchEvent(new HashChangeEvent('hashchange'));
}
