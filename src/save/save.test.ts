import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharePayload } from '../shared/save';
import {
  activeProfile,
  createProfile,
  decodeShare,
  defaultSave,
  deleteProfile,
  encodeShare,
  exportSave,
  importSave,
  loadSave,
  recordResult,
  renameProfile,
  saveSave,
  switchProfile,
} from './index';
import { resetDbForTests } from './db';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('IndexedDB save', () => {
  it('creates a default profile on first load', async () => {
    const data = await loadSave();
    expect(data.version).toBe(1);
    expect(data.profiles).toHaveLength(1);
    expect(activeProfile(data).name).toBe('Player');
  });

  it('round-trips progress, designs and scripts', async () => {
    const data = await loadSave();
    const p = activeProfile(data);
    p.designs.l01 = { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'rangefinder' } };
    p.scripts.l01 = 'bot.drive.forward(100)\n';
    recordResult(p, 'l01', true, 2, 12.5);
    await saveSave(data);

    resetDbForTests(); // force a fresh connection, as on page reload
    const again = await loadSave();
    expect(again).toEqual(data);
    expect(activeProfile(again).levels.l01).toEqual({ cleared: true, bestStars: 2, bestSeconds: 12.5, attempts: 1 });
  });

  it('starts fresh when stored data is corrupt', async () => {
    const { openDB } = await import('idb');
    const d = await openDB('bot-arena', 1, { upgrade: (db) => db.createObjectStore('save') });
    await d.put('save', { nonsense: true }, 'data');
    d.close();
    const data = await loadSave();
    expect(data.profiles).toHaveLength(1);
  });

  it('starts fresh, with a warning, on a save written by a newer game version', async () => {
    const newer = { ...defaultSave(), version: 99, profiles: [{ ...activeProfile(defaultSave()), name: 'Future' }] };
    const { openDB } = await import('idb');
    const d = await openDB('bot-arena', 1, { upgrade: (db) => db.createObjectStore('save') });
    await d.put('save', newer, 'data');
    d.close();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = await loadSave();
    expect(data.version).toBe(1);
    expect(activeProfile(data).name).toBe('Player');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/different version/));
    warn.mockRestore();
    expect(() => importSave(JSON.stringify(newer))).toThrow(/different version/);
  });

  it("leaves another save format's record alone when hopping between published versions", async () => {
    const newer = { ...defaultSave(), version: 2, profiles: [{ ...activeProfile(defaultSave()), name: 'Future' }] };
    const { openDB } = await import('idb');
    const d = await openDB('bot-arena', 1, { upgrade: (db) => db.createObjectStore('save') });
    await d.put('save', newer, 'data-v2');
    d.close();
    const data = await loadSave();
    await saveSave(data);
    const after = await openDB('bot-arena', 1);
    expect(await after.get('save', 'data-v2')).toEqual(newer);
    after.close();
  });
});

describe('progress', () => {
  it('keeps best stars and best time, counts attempts', () => {
    const p = activeProfile(defaultSave());
    recordResult(p, 'l02', true, 3, 20);
    recordResult(p, 'l02', true, 1, 15);
    recordResult(p, 'l02', false, 0, 5);
    expect(p.levels.l02).toEqual({ cleared: true, bestStars: 3, bestSeconds: 15, attempts: 3 });
  });

  it('a loss does not clear the level', () => {
    const p = activeProfile(defaultSave());
    recordResult(p, 'l03', false, 0, 9);
    expect(p.levels.l03).toEqual({ cleared: false, bestStars: 0, attempts: 1 });
  });
});

describe('profiles', () => {
  it('create, rename, switch and delete', () => {
    let data = defaultSave();
    const first = data.profiles[0]!.id;
    const created = createProfile(data, '  Ada  ');
    data = created.data;
    expect(activeProfile(data).name).toBe('Ada');
    data = renameProfile(data, created.profile.id, 'Grace');
    expect(activeProfile(data).name).toBe('Grace');
    data = switchProfile(data, first);
    expect(data.activeProfileId).toBe(first);
    data = deleteProfile(data, first);
    expect(data.profiles).toHaveLength(1);
    expect(data.activeProfileId).toBe(created.profile.id);
    expect(deleteProfile(data, created.profile.id)).toBe(data); // never delete the last one
  });
});

describe('export / import', () => {
  it('round-trips', () => {
    const data = defaultSave();
    const p = activeProfile(data);
    p.scripts.free = 'print("hi")';
    p.hintsShown.l01 = 2;
    p.settings = { muted: true, speed: 2 };
    expect(importSave(exportSave(data))).toEqual(data);
  });

  it('rejects junk with a friendly message', () => {
    expect(() => importSave('not json')).toThrow(/isn't a Bot Arena save/);
    expect(() => importSave('{"hello": 1}')).toThrow(/isn't a Bot Arena save/);
    expect(() => importSave('{"version": 1, "profiles": []}')).toThrow(/no usable profiles/);
  });

  it('repairs bad fields instead of failing', () => {
    const data = defaultSave();
    const raw = JSON.parse(exportSave(data));
    raw.activeProfileId = 'missing';
    raw.profiles[0].designs = { l01: { chassis: 'chassis_x', drive: 'wheels', slots: {} } };
    raw.profiles[0].settings = { muted: 'yes', speed: 3 };
    const fixed = importSave(JSON.stringify(raw));
    expect(fixed.activeProfileId).toBe(data.profiles[0]!.id);
    expect(fixed.profiles[0]!.designs).toEqual({});
    expect(fixed.profiles[0]!.settings).toEqual({ muted: false, speed: 1 });
  });
});

describe('share links', () => {
  const payload: SharePayload = {
    v: 1,
    name: 'Scout',
    level: 'l05',
    design: { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', centre: 'battery' } },
    script: 'while True:\n    bot.blaster.fire()  # pew ✨\n',
  };

  it('round-trips through a URL-safe string', () => {
    const s = encodeShare(payload);
    expect(s).toMatch(/^[A-Za-z0-9+\-$_]*$/);
    expect(decodeShare(s)).toEqual(payload);
  });

  it('returns null for damaged or hostile payloads', () => {
    expect(decodeShare('garbage!!')).toBeNull();
    expect(decodeShare('')).toBeNull();
    expect(decodeShare(encodeShare({ ...payload, design: { chassis: 'turret_x' } } as never))).toBeNull();
    expect(decodeShare(encodeShare({ ...payload, script: 42 } as never))).toBeNull();
  });
});
