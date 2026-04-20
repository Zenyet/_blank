/**
 * User-saved background presets.
 *
 * Complements `BUILTIN_BACKGROUNDS`: lets users stash the current background
 * (gradient or image) under a label and re-apply it later. Storage goes to
 * `chrome.storage.local` in the extension, localStorage in dev.
 *
 * We deliberately cap the list to `MAX_USER_BACKGROUNDS` because uploaded
 * images are stored as base64 data URLs and each one can approach 2–3 MB;
 * without a cap it's too easy to blow past storage quotas.
 */

import { hasChromeApi } from './chromeApi';

export interface UserBackground {
  id: string;
  label: string;
  /** Same shape as `settings.bgImage` — gradient CSS or URL/data URL. */
  value: string;
}

const KEY = 'newtab-user-backgrounds';
export const MAX_USER_BACKGROUNDS = 12;

const listeners = new Set<(list: UserBackground[]) => void>();
let cache: UserBackground[] | null = null;

async function read(): Promise<UserBackground[]> {
  if (hasChromeApi && chrome.storage?.local) {
    const obj = await chrome.storage.local.get(KEY);
    const list = obj[KEY] as UserBackground[] | undefined;
    return Array.isArray(list) ? list : [];
  }
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as UserBackground[]) : [];
  } catch {
    return [];
  }
}

async function write(list: UserBackground[]): Promise<void> {
  if (hasChromeApi && chrome.storage?.local) {
    await chrome.storage.local.set({ [KEY]: list });
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota? swallow */
  }
}

function emit(list: UserBackground[]) {
  listeners.forEach((fn) => {
    try {
      fn(list);
    } catch {
      /* swallow */
    }
  });
}

export async function loadUserBackgrounds(): Promise<UserBackground[]> {
  if (cache) return cache;
  cache = await read();
  return cache;
}

export async function saveUserBackground(
  bg: Omit<UserBackground, 'id'>
): Promise<UserBackground[]> {
  const list = [...(cache ?? (await read()))];
  const entry: UserBackground = {
    id: `ub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label: bg.label.trim() || '未命名',
    value: bg.value,
  };
  list.unshift(entry);
  // Keep the most-recent MAX_USER_BACKGROUNDS; oldest entries fall off.
  if (list.length > MAX_USER_BACKGROUNDS) list.length = MAX_USER_BACKGROUNDS;
  cache = list;
  await write(list);
  emit(list);
  return list;
}

export async function removeUserBackground(id: string): Promise<UserBackground[]> {
  const list = (cache ?? (await read())).filter((b) => b.id !== id);
  cache = list;
  await write(list);
  emit(list);
  return list;
}

export async function renameUserBackground(
  id: string,
  label: string
): Promise<UserBackground[]> {
  const list = (cache ?? (await read())).map((b) =>
    b.id === id ? { ...b, label: label.trim() || b.label } : b
  );
  cache = list;
  await write(list);
  emit(list);
  return list;
}

export function subscribeUserBackgrounds(
  cb: (list: UserBackground[]) => void
): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
