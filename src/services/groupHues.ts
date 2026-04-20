/**
 * Per-folder hue overrides.
 *
 * By default each folder gets a deterministic hue derived from its id (see
 * `folderHue`). This service layers user-picked overrides on top so that
 * people can recolour any group without losing the nice auto-palette for
 * groups they haven't touched.
 *
 * Storage: chrome.storage.local in the extension, localStorage in the dev
 * browser. Shape: `Record<folderId, hueDegrees>`.
 */

import { hasChromeApi } from './chromeApi';

const KEY = 'newtab-group-hues';

type HueMap = Record<string, number>;

const listeners = new Set<(map: HueMap) => void>();
let cache: HueMap | null = null;

async function read(): Promise<HueMap> {
  if (hasChromeApi && chrome.storage?.local) {
    const obj = await chrome.storage.local.get(KEY);
    return (obj[KEY] as HueMap | undefined) ?? {};
  }
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HueMap) : {};
  } catch {
    return {};
  }
}

async function write(map: HueMap): Promise<void> {
  if (hasChromeApi && chrome.storage?.local) {
    await chrome.storage.local.set({ [KEY]: map });
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* noop */
  }
}

function emit(map: HueMap) {
  listeners.forEach((fn) => {
    try {
      fn(map);
    } catch {
      /* swallow listener errors */
    }
  });
}

export async function loadGroupHues(): Promise<HueMap> {
  if (cache) return cache;
  cache = await read();
  return cache;
}

export async function setGroupHue(id: string, hue: number): Promise<HueMap> {
  const map = { ...(cache ?? (await read())) };
  map[id] = ((hue % 360) + 360) % 360;
  cache = map;
  await write(map);
  emit(map);
  return map;
}

export async function clearGroupHue(id: string): Promise<HueMap> {
  const map = { ...(cache ?? (await read())) };
  delete map[id];
  cache = map;
  await write(map);
  emit(map);
  return map;
}

export function subscribeGroupHues(cb: (map: HueMap) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
