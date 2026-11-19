/**
 * Version picker. GitHub Pages keeps every published version in its own folder next to a
 * switcher.json ([{ version, url }], see scripts/pages-index.mjs); this lists them so a player can
 * hop between versions. Without switcher.json (local dev) only the build label is shown.
 */
import { h } from './dom';

interface VersionEntry {
  version: string;
  url: string;
}

const switcherUrl = () => new URL('../switcher.json', location.href);

async function loadVersions(): Promise<VersionEntry[]> {
  try {
    const res = await fetch(switcherUrl());
    if (!res.ok) return [];
    const list: unknown = await res.json();
    if (!Array.isArray(list)) return [];
    return list.filter((v): v is VersionEntry => typeof v?.version === 'string' && typeof v?.url === 'string');
  } catch {
    return [];
  }
}

/** The folder this page is served from, e.g. 'main' for /bot-areana/main/. */
function currentFolder(): string {
  return new URL('.', location.href).pathname.split('/').filter(Boolean).pop() ?? '';
}

/** Settings section: the build label, plus a picker once switcher.json has loaded. */
export function versionSection(): HTMLElement {
  const picker = h('div.row');
  void loadVersions().then((versions) => {
    if (versions.length === 0) return;
    const here = currentFolder();
    const select = h(
      'select.text',
      {
        'aria-label': 'Game version',
        onchange: () => {
          const v = versions.find((x) => x.version === select.value);
          if (v) location.href = new URL(v.url, switcherUrl()).href;
        },
      },
      ...(versions.some((v) => v.version === here) ? [] : [h('option', { value: '', selected: true, disabled: true }, here || 'this build')]),
      ...versions.map((v) => h('option', { value: v.version, selected: v.version === here }, v.version)),
    );
    picker.append(h('span', {}, 'Play another version:'), select);
  });
  return h(
    'div.settings',
    {},
    h('div.section-label', {}, 'VERSION'),
    h('p.muted', {}, 'Bot Arena ', h('span.mono', {}, __APP_VERSION__)),
    picker,
  );
}
