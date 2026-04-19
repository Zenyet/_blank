import type { Bookmark, ChromeData, Group, HistoryItem, Settings } from '../types';
import { FALLBACK_BOOKMARKS, FALLBACK_GROUPS, FALLBACK_RECENTS } from '../data/fallback';
import { DEFAULT_SETTINGS } from '../types';

// ─── Chrome API detection ─────────────────────────────────────────────────

export const hasChromeApi: boolean =
  typeof chrome !== 'undefined' && typeof chrome.bookmarks !== 'undefined';

// ─── Deterministic color + letter assignment ──────────────────────────────

const PALETTE = [
  '#1a1a1a', '#5e6ad2', '#a259ff', '#e8e8e3', '#4a154b', '#ea4335',
  '#4285f4', '#1fa463', '#ff0033', '#1db954', '#e50914', '#ff4500',
  '#000000', '#cc785c', '#10a37f', '#007acc', '#ff6363', '#f48024',
  '#ff6600', '#ff6719', '#202020',
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function colorFor(url: string): string {
  return PALETTE[hashStr(url) % PALETTE.length]!;
}

function letterFor(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0] || '?';
  // For non-Latin text use the first character alone.
  if (/[^\x00-\x7F]/.test(first)) return first[0]!;
  if (words.length >= 2) {
    return (first[0]! + words[1]![0]).toUpperCase();
  }
  return (first[0]! + (first[1] || first[0]!)).toUpperCase();
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatLast(ms: number | undefined): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const days = Math.round(hrs / 24);
  return `${days} 天前`;
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

// ─── Bookmarks tree → flat lists ──────────────────────────────────────────

async function loadBookmarks(): Promise<{
  bookmarks: Bookmark[];
  groups: Group[];
  barId: string | null;
}> {
  if (!hasChromeApi) return { bookmarks: [], groups: [], barId: null };
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0];
  if (!root?.children) return { bookmarks: [], groups: [], barId: null };

  const bar = root.children.find((n) => n.id === '1') || root.children[0];
  if (!bar?.children) return { bookmarks: [], groups: [], barId: null };
  const barId = bar.id;

  const bookmarks: Bookmark[] = [];
  const groups: Group[] = [];

  // Loose bookmarks (direct children of the bar) go into a virtual "置顶" group
  // whose id is barId. Folders at the first level each become a group.
  const loose = bar.children.filter((n) => n.url);
  if (loose.length > 0) {
    groups.push({ id: barId, label: '置顶' });
    loose.forEach((b) => {
      if (!b.url) return;
      bookmarks.push({
        id: b.id,
        parentId: b.parentId || barId,
        name: b.title || domainOf(b.url),
        url: b.url,
        group: '置顶',
        color: colorFor(b.url),
        letter: letterFor(b.title || domainOf(b.url)),
        visits: 0,
        last: '—',
      });
    });
  }

  const folders = bar.children.filter((n) => !n.url);
  for (const folder of folders) {
    const label = folder.title || '未命名';
    groups.push({ id: folder.id, label });
    const walk = (node: chrome.bookmarks.BookmarkTreeNode) => {
      if (node.url) {
        bookmarks.push({
          id: node.id,
          parentId: node.parentId || folder.id,
          name: node.title || domainOf(node.url),
          url: node.url,
          group: label,
          color: colorFor(node.url),
          letter: letterFor(node.title || domainOf(node.url)),
          visits: 0,
          last: '—',
        });
      } else if (node.children) {
        node.children.forEach(walk);
      }
    };
    folder.children?.forEach(walk);
  }

  return { bookmarks, groups, barId };
}

// ─── History + visit counts ───────────────────────────────────────────────

async function loadHistory(): Promise<{
  recents: HistoryItem[];
  visitsByUrl: Map<string, { count: number; last: number }>;
}> {
  if (!hasChromeApi || !chrome.history) {
    return { recents: [], visitsByUrl: new Map() };
  }
  try {
    const items = await chrome.history.search({
      text: '',
      startTime: Date.now() - 30 * 86_400_000,
      maxResults: 2000,
    });

    const visitsByUrl = new Map<string, { count: number; last: number }>();
    for (const it of items) {
      if (!it.url) continue;
      const d = domainOf(it.url);
      const prev = visitsByUrl.get(d) || { count: 0, last: 0 };
      visitsByUrl.set(d, {
        count: prev.count + (it.visitCount || 1),
        last: Math.max(prev.last, it.lastVisitTime || 0),
      });
    }

    const recents: HistoryItem[] = items
      .filter((i) => i.url && i.title)
      .sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0))
      .slice(0, 20)
      .map((i) => ({
        title: i.title || domainOf(i.url!),
        url: domainOf(i.url!),
        at: formatClock(i.lastVisitTime || Date.now()),
        lastVisitTime: i.lastVisitTime || 0,
      }));

    return { recents, visitsByUrl };
  } catch {
    return { recents: [], visitsByUrl: new Map() };
  }
}

// ─── Top sites (fallback source) ──────────────────────────────────────────

async function loadTopSites(barId: string): Promise<{ bookmarks: Bookmark[]; groups: Group[] }> {
  if (!hasChromeApi || !chrome.topSites) return { bookmarks: [], groups: [] };
  try {
    const sites = await chrome.topSites.get();
    const bms: Bookmark[] = sites.slice(0, 20).map((s, i) => ({
      id: `ts-${i}`,
      parentId: barId,
      name: s.title || domainOf(s.url),
      url: s.url,
      group: '常用',
      color: colorFor(s.url),
      letter: letterFor(s.title || domainOf(s.url)),
      visits: 100 - i * 3,
      last: '—',
    }));
    return { bookmarks: bms, groups: bms.length > 0 ? [{ id: barId, label: '常用' }] : [] };
  } catch {
    return { bookmarks: [], groups: [] };
  }
}

// ─── Public: aggregate loader ─────────────────────────────────────────────

export async function loadChromeData(): Promise<ChromeData> {
  if (!hasChromeApi) {
    return {
      bookmarks: FALLBACK_BOOKMARKS,
      recents: FALLBACK_RECENTS,
      groups: FALLBACK_GROUPS,
      barId: null,
      source: 'fallback',
    };
  }

  let { bookmarks, groups, barId } = await loadBookmarks();
  const { recents, visitsByUrl } = await loadHistory();

  if (bookmarks.length === 0 && barId) {
    const ts = await loadTopSites(barId);
    bookmarks = ts.bookmarks;
    groups = ts.groups;
  }

  for (const b of bookmarks) {
    const v = visitsByUrl.get(domainOf(b.url));
    if (v) {
      b.visits = v.count;
      b.last = formatLast(v.last);
    }
  }

  if (bookmarks.length === 0) {
    return {
      bookmarks: FALLBACK_BOOKMARKS,
      recents: FALLBACK_RECENTS,
      groups: FALLBACK_GROUPS,
      barId,
      source: 'fallback',
    };
  }

  return { bookmarks, recents, groups, barId, source: 'chrome' };
}

// ─── CRUD on bookmarks and folders ────────────────────────────────────────

export async function createBookmark(parentId: string, title: string, url: string): Promise<void> {
  if (!hasChromeApi) return;
  await chrome.bookmarks.create({ parentId, title, url });
}

export async function removeBookmark(id: string): Promise<void> {
  if (!hasChromeApi) return;
  await chrome.bookmarks.remove(id);
}

export async function updateBookmark(
  id: string,
  changes: { title?: string; url?: string }
): Promise<void> {
  if (!hasChromeApi) return;
  await chrome.bookmarks.update(id, changes);
}

export async function moveBookmark(
  id: string,
  dest: { parentId?: string; index?: number }
): Promise<void> {
  if (!hasChromeApi) return;
  await chrome.bookmarks.move(id, dest);
}

export async function createFolder(parentId: string, title: string): Promise<void> {
  if (!hasChromeApi) return;
  await chrome.bookmarks.create({ parentId, title });
}

export async function renameFolder(id: string, title: string): Promise<void> {
  if (!hasChromeApi) return;
  await chrome.bookmarks.update(id, { title });
}

export async function removeFolder(id: string): Promise<void> {
  if (!hasChromeApi) return;
  await chrome.bookmarks.removeTree(id);
}

// ─── Bookmark change subscription ─────────────────────────────────────────

export function subscribeBookmarkChanges(cb: () => void): () => void {
  if (!hasChromeApi || !chrome.bookmarks.onCreated) return () => {};
  const handlers: Array<() => void> = [];
  const register = <T extends chrome.events.Event<(...args: any[]) => void>>(
    ev: T
  ) => {
    ev.addListener(cb);
    handlers.push(() => ev.removeListener(cb));
  };
  register(chrome.bookmarks.onCreated);
  register(chrome.bookmarks.onRemoved);
  register(chrome.bookmarks.onChanged);
  register(chrome.bookmarks.onMoved);
  return () => handlers.forEach((h) => h());
}

// ─── Settings (chrome.storage.local with localStorage fallback) ───────────

const SETTINGS_KEY = 'newtab-settings';

export async function loadSettings(): Promise<Settings> {
  if (hasChromeApi && chrome.storage?.local) {
    const obj = await chrome.storage.local.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(obj[SETTINGS_KEY] || {}) };
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  if (hasChromeApi && chrome.storage?.local) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: s });
    return;
  }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

// ─── Todos persistence ────────────────────────────────────────────────────

const TODOS_KEY = 'newtab-todos';

export async function loadTodosRaw<T>(fallback: T): Promise<T> {
  if (hasChromeApi && chrome.storage?.local) {
    const obj = await chrome.storage.local.get(TODOS_KEY);
    return obj[TODOS_KEY] ?? fallback;
  }
  try {
    const raw = localStorage.getItem(TODOS_KEY);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export async function saveTodosRaw<T>(value: T): Promise<void> {
  if (hasChromeApi && chrome.storage?.local) {
    await chrome.storage.local.set({ [TODOS_KEY]: value });
    return;
  }
  try {
    localStorage.setItem(TODOS_KEY, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

// ─── Favicon URL ──────────────────────────────────────────────────────────

export function faviconUrl(pageUrl: string): string | null {
  try {
    const u = new URL(/^https?:\/\//.test(pageUrl) ? pageUrl : `https://${pageUrl}`);
    return `${u.protocol}//${u.hostname}/favicon.ico`;
  } catch {
    return null;
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────

export function openUrl(url: string, newTab: boolean = true): void {
  const full = /^https?:\/\//.test(url) ? url : `https://${url}`;
  if (newTab) {
    window.open(full, '_blank', 'noopener,noreferrer');
  } else {
    window.location.href = full;
  }
}

export function googleSearchUrl(q: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
