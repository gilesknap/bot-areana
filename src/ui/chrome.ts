/** Shared screen chrome: the 64 px top bar, modal dialogs and the settings dialog. */
import type { LevelDef } from '../shared/level';
import { createProfile, deleteProfile, exportSave, importSave, renameProfile, switchProfile } from '../save';
import { isMuted, setMuted } from '../audio';
import { LEVELS } from '../levels';
import { h, icon, pad2, starString, toast } from './dom';
import type { AppState } from './state';
import { versionSection } from './versions';

export interface Screen {
  el: HTMLElement;
  destroy?(): void;
}

export function brand(): HTMLElement {
  return h('a.brand', { href: '#/', title: 'Back to the campaign' }, 'BOT ARENA');
}

/** Top bar for the Workshop and Code & Arena screens. */
export function levelTopbar(level: LevelDef, free: boolean, active: 'workshop' | 'code', state: AppState): HTMLElement {
  const base = `#/${free ? 'free' : 'level'}/${level.id}`;
  const tab = (key: 'workshop' | 'code', label: string) =>
    h('a.tab', { href: `${base}/${key}`, class: key === active ? 'active' : '', 'aria-current': key === active ? 'page' : null }, label);
  const progress = state.profile.levels[level.id];
  const stars = free ? 'FREE PLAY' : starString(progress?.bestStars ?? 0);
  return h(
    'header.topbar',
    {},
    brand(),
    h('nav.tabs', { 'aria-label': 'Build steps' }, tab('workshop', '1 · Workshop'), tab('code', '2 · Code & Arena')),
    h('div.spacer'),
    h('div.topbar-meta', {}, `LEVEL ${pad2(level.number)} · ${level.title.toUpperCase()} · ${stars}`),
  );
}

// ---- Dialogs ------------------------------------------------------------------------------

export interface DialogHandle {
  close(): void;
  el: HTMLElement;
}

/** A modal dialog. Escape and the backdrop close it; focus moves into it and returns afterwards. */
export function openDialog(title: string, body: Node, opts: { wide?: boolean; onClose?: () => void } = {}): DialogHandle {
  const previous = document.activeElement as HTMLElement | null;
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    opts.onClose?.();
    previous?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const panel = h(
    'div.dialog',
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, class: opts.wide ? 'dialog-wide' : '' },
    h('div.dialog-head', {}, h('h2', {}, title), h('button.icon-btn', { type: 'button', 'aria-label': 'Close', onclick: close }, icon('close'))),
    body,
  );
  const backdrop = h('div.backdrop', { onclick: (e: Event) => e.target === backdrop && close() }, panel);
  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
  (panel.querySelector('input, button:not(.icon-btn), [tabindex]') as HTMLElement | null)?.focus();
  return { close, el: panel };
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Settings: sound, profiles, save file. `onSwitched` re-renders after the profile changes. */
export function openSettings(state: AppState, onSwitched: () => void): void {
  const body = h('div.settings');
  const dialog = openDialog('Settings', body, { wide: true });
  const version = versionSection();

  const render = () => {
    body.replaceChildren();
    const muted = isMuted();
    body.append(
      h('div.section-label', {}, 'SOUND'),
      h(
        'label.toggle',
        {},
        h('input', {
          type: 'checkbox',
          checked: muted,
          onchange: (e: Event) => {
            const m = (e.target as HTMLInputElement).checked;
            setMuted(m);
            state.profile.settings.muted = m;
            state.changed();
          },
        }),
        h('span', {}, 'Mute sound effects'),
      ),
      h('div.section-label', {}, 'PROFILES'),
      profilesList(),
      h(
        'form.row',
        {
          onsubmit: (e: Event) => {
            e.preventDefault();
            const input = (e.target as HTMLFormElement).elements.namedItem('name') as HTMLInputElement;
            if (!input.value.trim()) return;
            state.replace(createProfile(state.data, input.value).data);
            onSwitched();
            render();
          },
        },
        h('input.text', { name: 'name', placeholder: 'New profile name', maxlength: 24, 'aria-label': 'New profile name' }),
        h('button.btn', { type: 'submit' }, 'Add profile'),
      ),
      h('div.section-label', {}, 'SAVE FILE'),
      h('p.muted', {}, 'Progress saves automatically in this browser. Export a copy to move it to another computer.'),
      h(
        'div.row',
        {},
        h('button.btn', { type: 'button', onclick: () => download('bot-arena-save.json', exportSave(state.data)) }, 'Export save (.json)'),
        h('button.btn', { type: 'button', onclick: () => fileInput.click() }, 'Import save…'),
      ),
      version,
    );
  };

  const fileInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try {
        const data = importSave(await file.text());
        if (!confirm('Replace ALL profiles in this browser with the imported save?')) return;
        state.replace(data);
        toast('Save imported.');
        onSwitched();
        render();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    },
  });
  dialog.el.append(fileInput);

  const profilesList = () =>
    h(
      'ul.profiles',
      {},
      ...state.data.profiles.map((p) => {
        const active = p.id === state.data.activeProfileId;
        const stars = Object.values(p.levels).reduce((n, l) => n + l.bestStars, 0);
        return h(
          'li',
          { class: active ? 'active' : '' },
          h('span.profile-name', {}, p.name),
          h('span.mono.muted', {}, `★ ${stars} / ${LEVELS.length * 3}`),
          h('div.spacer'),
          active
            ? h('span.mono.cyan', {}, 'ACTIVE')
            : h('button.btn.small', {
                type: 'button',
                onclick: () => {
                  state.replace(switchProfile(state.data, p.id));
                  onSwitched();
                  render();
                },
              }, 'Switch'),
          h('button.btn.small', {
            type: 'button',
            onclick: () => {
              const name = prompt('Rename profile', p.name);
              if (name?.trim()) {
                state.replace(renameProfile(state.data, p.id, name));
                onSwitched();
                render();
              }
            },
          }, 'Rename'),
          state.data.profiles.length > 1 &&
            h('button.btn.small.danger', {
              type: 'button',
              onclick: () => {
                if (!confirm(`Delete profile "${p.name}" and all its progress?`)) return;
                state.replace(deleteProfile(state.data, p.id));
                onSwitched();
                render();
              },
            }, 'Delete'),
        );
      }),
    );

  render();
}
