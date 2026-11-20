/**
 * A short guided tour, shown the first time a profile reaches a screen: a few callouts, each
 * pointing at part of the screen. Skippable (button or Escape) and remembered per profile.
 * The page stays usable underneath: only the callout card takes clicks.
 */
import { h } from './dom';
import type { AppState } from './state';

export interface TourStep {
  /** CSS selector of the element to point at, looked up inside the screen when shown. */
  target: string;
  title: string;
  text: string;
}

export type TourId = 'workshop' | 'code';

/** Start the tour unless this profile has seen it. Returns a cleanup for the screen's destroy(). */
export function maybeTour(state: AppState, id: TourId, root: HTMLElement, steps: TourStep[]): () => void {
  if (state.profile.toursSeen.includes(id)) return () => {};
  state.profile.toursSeen.push(id);
  state.changed();

  let index = 0;
  const spot = h('div.tour-spot', { 'aria-hidden': 'true' });
  const count = h('span.tour-count.mono');
  const title = h('h3.tour-title');
  const text = h('p.tour-text');
  const next = h('button.cta.small', { type: 'button' });
  const card = h(
    'div.tour-card',
    { role: 'dialog', 'aria-label': 'Guided tour' },
    h('div.tour-head', {}, h('span.eyebrow', {}, 'QUICK TOUR'), count),
    title,
    text,
    h('div.tour-actions', {}, h('button.btn.small', { type: 'button', onclick: () => close() }, 'Skip tour'), next),
  );
  const layer = h('div.tour', {}, spot, card);

  const place = () => {
    const step = steps[index]!;
    const target = root.querySelector(step.target);
    const r = target?.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!r || !r.width) {
      spot.hidden = true;
      card.style.left = `${(vw - card.offsetWidth) / 2}px`;
      card.style.top = `${(vh - card.offsetHeight) / 2}px`;
      return;
    }
    spot.hidden = false;
    const pad = 6;
    Object.assign(spot.style, {
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + 2 * pad}px`,
      height: `${r.height + 2 * pad}px`,
    });
    // Beside the target where there is room (right, left, below, above), else over its middle.
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const gap = 16;
    const clampX = (x: number) => Math.max(12, Math.min(vw - cw - 12, x));
    const clampY = (y: number) => Math.max(12, Math.min(vh - ch - 12, y));
    let x: number;
    let y: number;
    if (r.right + gap + cw < vw) [x, y] = [r.right + gap, clampY(r.top)];
    else if (r.left - gap - cw > 0) [x, y] = [r.left - gap - cw, clampY(r.top)];
    else if (r.bottom + gap + ch < vh) [x, y] = [clampX(r.left), r.bottom + gap];
    else if (r.top - gap - ch > 0) [x, y] = [clampX(r.left), r.top - gap - ch];
    else [x, y] = [clampX(r.left + (r.width - cw) / 2), clampY(r.top + (r.height - ch) / 2)];
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  };

  const show = () => {
    const step = steps[index]!;
    count.textContent = `${index + 1} / ${steps.length}`;
    title.textContent = step.title;
    text.textContent = step.text;
    next.textContent = index === steps.length - 1 ? 'Got it' : 'Next →';
    place();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const close = () => {
    layer.remove();
    window.removeEventListener('resize', place);
    document.removeEventListener('keydown', onKey);
  };
  next.addEventListener('click', () => {
    if (++index >= steps.length) close();
    else show();
  });

  // After the screen is in the page and laid out.
  requestAnimationFrame(() => {
    if (!root.isConnected) return;
    document.body.append(layer);
    show();
    next.focus();
  });
  window.addEventListener('resize', place);
  document.addEventListener('keydown', onKey);
  return close;
}
