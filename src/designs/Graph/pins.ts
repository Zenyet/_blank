import type { PinsMap } from '../../types';

export function setPin(pins: PinsMap, id: string, x: number, y: number): PinsMap {
  return { ...pins, [id]: { x, y } };
}

export function unsetPin(pins: PinsMap, id: string): PinsMap {
  if (!(id in pins)) return pins;
  const next = { ...pins };
  delete next[id];
  return next;
}

export function cleanOrphanPins(pins: PinsMap, validNodeIds: Set<string>): PinsMap {
  const next: PinsMap = {};
  for (const [id, p] of Object.entries(pins)) {
    if (validNodeIds.has(id)) next[id] = p;
  }
  return next;
}

// ─── Persistence ─────────────────────────────────────────────────────────

const KEY = 'newtab-graph-pins';

function hasStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

export async function loadPins(): Promise<PinsMap> {
  if (hasStorage()) {
    const obj = await chrome.storage.local.get(KEY);
    const raw = obj[KEY];
    return raw && typeof raw === 'object' ? (raw as PinsMap) : {};
  }
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PinsMap) : {};
  } catch {
    return {};
  }
}

export async function savePins(pins: PinsMap): Promise<void> {
  if (hasStorage()) {
    await chrome.storage.local.set({ [KEY]: pins });
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(pins));
  } catch {
    /* noop */
  }
}
