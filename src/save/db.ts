/** IndexedDB persistence for SaveData, with an in-memory fallback when IndexedDB is unavailable. */
import { openDB, type IDBPDatabase } from 'idb';
import type { SaveData } from '../shared/save';
import { SAVE_VERSION, defaultSave, parseSave } from './data';

const DB_NAME = 'bot-arena';
const STORE = 'save';
/**
 * Each save format has its own key, so hopping between published versions (which share this
 * origin's IndexedDB) never overwrites a save another version can read. Format 1 keeps 'data'.
 */
const KEY = SAVE_VERSION === 1 ? 'data' : `data-v${SAVE_VERSION}`;

let dbPromise: Promise<IDBPDatabase | null> | null = null;
let memory: SaveData | null = null;

function db(): Promise<IDBPDatabase | null> {
  dbPromise ??= (async () => {
    if (typeof indexedDB === 'undefined') return null;
    try {
      return await openDB(DB_NAME, 1, {
        upgrade(d) {
          d.createObjectStore(STORE);
        },
      });
    } catch {
      return null; // e.g. private browsing modes that refuse IndexedDB
    }
  })();
  return dbPromise;
}

/** True when saves only live for this page session. */
export async function isMemoryOnly(): Promise<boolean> {
  return (await db()) === null;
}

/** Loads the save, creating (and storing) a default profile on first run. */
export async function loadSave(): Promise<SaveData> {
  const d = await db();
  const raw: unknown = d ? await d.get(STORE, KEY) : memory;
  if (raw) {
    try {
      return parseSave(raw);
    } catch (e) {
      // Corrupt, or written by an incompatible version of the game (all published versions share
      // this origin's save): start fresh rather than lock the player out.
      console.warn(`Bot Arena: ignoring the stored save and starting a fresh profile. ${(e as Error).message}`);
    }
  }
  const fresh = defaultSave();
  await saveSave(fresh);
  return fresh;
}

export async function saveSave(data: SaveData): Promise<void> {
  // structuredClone strips anything non-serialisable and decouples us from later mutation.
  const copy = structuredClone(data);
  const d = await db();
  if (d) await d.put(STORE, copy, KEY);
  else memory = copy;
}

/** Test helper: forget the cached connection (e.g. after swapping in a fresh fake IndexedDB). */
export function resetDbForTests(): void {
  dbPromise = null;
  memory = null;
}
