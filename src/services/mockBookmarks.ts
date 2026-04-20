/**
 * Dev-mode persistence shim for bookmarks + folders.
 *
 * When running in `vite dev` the Chrome extension APIs aren't available, so
 * the real code-paths in `chromeApi.ts` become silent no-ops. That in turn
 * means group management (create/rename/delete) _appears_ to work but never
 * actually updates anything.
 *
 * This module provides an in-memory, localStorage-backed bookmark tree with
 * the subset of `chrome.bookmarks` semantics we need, plus a simple change
 * listener. `chromeApi.ts` delegates to this module whenever `hasChromeApi`
 * is false.
 *
 * The state is seeded from the FALLBACK fixtures on first boot, so the
 * initial user experience matches what we always showed in the sandbox.
 */

import type { Bookmark, Group, HistoryItem } from '../types';
import {
  FALLBACK_BOOKMARKS,
  FALLBACK_GROUPS,
  FALLBACK_RECENTS,
} from '../data/fallback';

export const MOCK_BAR_ID = 'mock-bar';

interface MockNode {
  id: string;
  parentId: string | null;
  title: string;
  /** Undefined for folders. */
  url?: string;
}

interface MockState {
  nodes: MockNode[];
  /** Auto-incrementing counter for new ids. */
  seq: number;
}

const STORAGE_KEY = 'newtab-mock-bookmarks';
const listeners = new Set<() => void>();

let state: MockState | null = null;

function seedState(): MockState {
  const nodes: MockNode[] = [];
  nodes.push({ id: MOCK_BAR_ID, parentId: null, title: 'Bookmarks Bar' });
  for (const g of FALLBACK_GROUPS) {
    nodes.push({ id: g.id, parentId: MOCK_BAR_ID, title: g.label });
  }
  for (const b of FALLBACK_BOOKMARKS) {
    nodes.push({ id: b.id, parentId: b.parentId, title: b.name, url: b.url });
  }
  return { nodes, seq: 1 };
}

function load(): MockState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockState;
      if (parsed && Array.isArray(parsed.nodes)) {
        state = parsed;
        return state;
      }
    }
  } catch {
    /* fall through */
  }
  state = seedState();
  persist();
  return state;
}

function persist() {
  if (!state) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota? ignore */
  }
}

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* swallow */
    }
  });
}

function nextId(): string {
  const s = load();
  s.seq += 1;
  return `mock-${s.seq}`;
}

// ─── Public API (mirrors the subset of chrome.bookmarks we call) ──────────

export function mockBarId(): string {
  return MOCK_BAR_ID;
}

export function mockLoadData(): {
  bookmarks: Bookmark[];
  groups: Group[];
  barId: string;
  recents: HistoryItem[];
} {
  const s = load();

  const groups: Group[] = [];
  const bookmarks: Bookmark[] = [];

  // Walk the sub-tree under the bar node. Every folder becomes its own
  // group (with a `parentGroupId` link to its containing folder, or `null`
  // for top-level). URL nodes become bookmarks whose `parentId` already
  // points to a registered group id.
  const walk = (parentNodeId: string, groupLabelForUrls: string, depth: number) => {
    const children = s.nodes.filter((c) => c.parentId === parentNodeId);
    const looseHere = children.some((c) => c.url !== undefined);
    if (parentNodeId === MOCK_BAR_ID && looseHere) {
      if (!groups.some((g) => g.id === MOCK_BAR_ID)) {
        groups.push({ id: MOCK_BAR_ID, label: '置顶', parentGroupId: null, depth: 0 });
      }
    }
    for (const child of children) {
      if (child.url !== undefined) {
        bookmarks.push(bookmarkFromNode(child, groupLabelForUrls));
      } else {
        const childDepth = parentNodeId === MOCK_BAR_ID ? 0 : depth + 1;
        groups.push({
          id: child.id,
          label: child.title,
          parentGroupId: parentNodeId === MOCK_BAR_ID ? null : parentNodeId,
          depth: childDepth,
        });
        walk(child.id, child.title, childDepth);
      }
    }
  };
  walk(MOCK_BAR_ID, '置顶', 0);

  // Prefer the fallback's visit/color data when the node matches by id — that
  // keeps the familiar "Top" and color assignments intact in dev.
  const fbById = new Map(FALLBACK_BOOKMARKS.map((b) => [b.id, b] as const));
  for (const b of bookmarks) {
    const fb = fbById.get(b.id);
    if (fb) {
      b.visits = fb.visits;
      b.last = fb.last;
      b.color = fb.color;
      b.letter = fb.letter;
    }
  }

  return { bookmarks, groups, barId: MOCK_BAR_ID, recents: FALLBACK_RECENTS };
}

function bookmarkFromNode(n: MockNode, groupLabel: string): Bookmark {
  const url = n.url ?? '';
  return {
    id: n.id,
    parentId: n.parentId ?? MOCK_BAR_ID,
    name: n.title || hostnameSafe(url),
    url,
    group: groupLabel,
    color: colorFromSeed(url || n.id),
    letter: letterFor(n.title || hostnameSafe(url)),
    visits: 0,
    last: '—',
  };
}

function hostnameSafe(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u || '—';
  }
}

const MOCK_PALETTE = [
  '#5e6ad2', '#a259ff', '#10a37f', '#ff6600', '#ea4335',
  '#4285f4', '#1fa463', '#ff4500', '#e50914', '#1db954',
];

function colorFromSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return MOCK_PALETTE[Math.abs(h) % MOCK_PALETTE.length]!;
}

function letterFor(name: string): string {
  const first = (name.trim()[0] || '?').toUpperCase();
  const second = (name.trim()[1] || first).toUpperCase();
  return /[^\x00-\x7F]/.test(first) ? first : first + second;
}

export function mockCreateBookmark(parentId: string, title: string, url: string): string {
  const s = load();
  const id = nextId();
  s.nodes.push({ id, parentId, title, url });
  persist();
  emit();
  return id;
}

export function mockCreateFolder(parentId: string, title: string): string {
  const s = load();
  const id = nextId();
  s.nodes.push({ id, parentId, title });
  persist();
  emit();
  return id;
}

export function mockUpdate(id: string, changes: { title?: string; url?: string }): void {
  const s = load();
  const node = s.nodes.find((n) => n.id === id);
  if (!node) return;
  if (changes.title !== undefined) node.title = changes.title;
  if (changes.url !== undefined) node.url = changes.url;
  persist();
  emit();
}

export function mockMove(id: string, dest: { parentId?: string; index?: number }): void {
  const s = load();
  const node = s.nodes.find((n) => n.id === id);
  if (!node) return;

  // Guard against making a folder its own ancestor (infinite loop). Walk
  // up from the destination parent — if we encounter `id`, abort the move.
  if (dest.parentId && dest.parentId !== node.parentId) {
    let cursor: string | null = dest.parentId;
    while (cursor) {
      if (cursor === id) return; // would create a cycle
      const parent = s.nodes.find((n) => n.id === cursor);
      cursor = parent?.parentId ?? null;
    }
    node.parentId = dest.parentId;
  }

  // Sibling order is implicit in the flat `nodes` array — we derive children
  // via `filter(parentId === id)` which preserves insertion order. So to
  // reorder we pull the node out, then splice it back at the absolute array
  // position that corresponds to `index` within its sibling group.
  if (dest.index !== undefined) {
    const parentId = node.parentId;
    const without = s.nodes.filter((n) => n.id !== id);
    const siblings = without.filter((n) => n.parentId === parentId);
    const clamped = Math.max(0, Math.min(dest.index, siblings.length));
    let insertAt = without.length;
    if (clamped < siblings.length) {
      const anchor = siblings[clamped]!;
      insertAt = without.indexOf(anchor);
    }
    without.splice(insertAt, 0, node);
    s.nodes = without;
  }

  persist();
  emit();
}

export function mockRemove(id: string): void {
  const s = load();
  s.nodes = s.nodes.filter((n) => n.id !== id);
  persist();
  emit();
}

export function mockRemoveTree(id: string): void {
  const s = load();
  const toRemove = new Set<string>();
  const collect = (rootId: string) => {
    toRemove.add(rootId);
    for (const child of s.nodes.filter((n) => n.parentId === rootId)) {
      collect(child.id);
    }
  };
  collect(id);
  s.nodes = s.nodes.filter((n) => !toRemove.has(n.id));
  persist();
  emit();
}

export function mockSubscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reset to the fallback seed. Exposed for debugging / tests. */
export function mockReset(): void {
  state = seedState();
  persist();
  emit();
}
