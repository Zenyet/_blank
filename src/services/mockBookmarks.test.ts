import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MOCK_BAR_ID,
  mockCreateBookmark,
  mockCreateFolder,
  mockLoadData,
  mockMove,
  mockRemoveTree,
  mockReset,
  mockSubscribe,
  mockUpdate,
} from './mockBookmarks';

describe('mockBookmarks', () => {
  beforeEach(() => {
    mockReset();
  });
  afterEach(() => {
    try {
      localStorage.removeItem('newtab-mock-bookmarks');
    } catch {
      /* jsdom ignore */
    }
  });

  it('seeds with fallback fixtures', () => {
    const d = mockLoadData();
    expect(d.barId).toBe(MOCK_BAR_ID);
    expect(d.groups.length).toBeGreaterThan(0);
    expect(d.bookmarks.length).toBeGreaterThan(0);
  });

  it('creates a folder and reflects it in load', () => {
    const id = mockCreateFolder(MOCK_BAR_ID, '测试分组');
    expect(id).toMatch(/^mock-/);
    const d = mockLoadData();
    expect(d.groups.some((g) => g.id === id && g.label === '测试分组')).toBe(true);
  });

  it('renames a folder', () => {
    const id = mockCreateFolder(MOCK_BAR_ID, 'old');
    mockUpdate(id, { title: 'new' });
    const d = mockLoadData();
    expect(d.groups.find((g) => g.id === id)?.label).toBe('new');
  });

  it('creates a bookmark inside a folder', () => {
    const fid = mockCreateFolder(MOCK_BAR_ID, 'parent');
    const bid = mockCreateBookmark(fid, 'Ex', 'https://example.com');
    const d = mockLoadData();
    expect(d.bookmarks.some((b) => b.id === bid && b.parentId === fid)).toBe(true);
  });

  it('removeTree cascades to children', () => {
    const fid = mockCreateFolder(MOCK_BAR_ID, 'parent');
    const bid = mockCreateBookmark(fid, 'Ex', 'https://example.com');
    mockRemoveTree(fid);
    const d = mockLoadData();
    expect(d.groups.find((g) => g.id === fid)).toBeUndefined();
    expect(d.bookmarks.find((b) => b.id === bid)).toBeUndefined();
  });

  it('reorders siblings by index', () => {
    const a = mockCreateFolder(MOCK_BAR_ID, 'A');
    const b = mockCreateFolder(MOCK_BAR_ID, 'B');
    const c = mockCreateFolder(MOCK_BAR_ID, 'C');
    const orderBefore = mockLoadData().groups.map((g) => g.id);
    expect(orderBefore.slice(-3)).toEqual([a, b, c]);

    // Move C to the very top of the bar's folder list. Before C in the
    // current sibling group is an arbitrary number of fallback-seeded
    // folders, so we compute the new index dynamically.
    const firstFolderIdx = orderBefore.findIndex(
      (id) => id !== MOCK_BAR_ID && id === orderBefore[0]
    );
    void firstFolderIdx;

    mockMove(c, { index: 0 });
    const order = mockLoadData().groups.map((g) => g.id);
    expect(order[0]).toBe(c);
  });

  it('moving within the same parent is a no-op for index === current', () => {
    const a = mockCreateFolder(MOCK_BAR_ID, 'A');
    const before = mockLoadData().groups.findIndex((g) => g.id === a);
    mockMove(a, { index: before });
    const after = mockLoadData().groups.findIndex((g) => g.id === a);
    expect(after).toBe(before);
  });

  it('exposes nested folders as groups with parentGroupId + depth', () => {
    const outer = mockCreateFolder(MOCK_BAR_ID, 'Outer');
    const inner = mockCreateFolder(outer, 'Inner');
    const deep = mockCreateFolder(inner, 'Deep');
    const d = mockLoadData();
    const outerG = d.groups.find((g) => g.id === outer);
    const innerG = d.groups.find((g) => g.id === inner);
    const deepG = d.groups.find((g) => g.id === deep);
    expect(outerG).toMatchObject({ parentGroupId: null, depth: 0 });
    expect(innerG).toMatchObject({ parentGroupId: outer, depth: 1 });
    expect(deepG).toMatchObject({ parentGroupId: inner, depth: 2 });
  });

  it('bookmarks inside a nested folder point to that folder directly', () => {
    const outer = mockCreateFolder(MOCK_BAR_ID, 'Outer');
    const inner = mockCreateFolder(outer, 'Inner');
    const bid = mockCreateBookmark(inner, 'Ex', 'https://example.com');
    const d = mockLoadData();
    const bm = d.bookmarks.find((b) => b.id === bid);
    expect(bm?.parentId).toBe(inner);
  });

  it('nests folder A into folder B via move', () => {
    const a = mockCreateFolder(MOCK_BAR_ID, 'A');
    const b = mockCreateFolder(MOCK_BAR_ID, 'B');
    mockMove(a, { parentId: b, index: 0 });
    const d = mockLoadData();
    const aG = d.groups.find((g) => g.id === a);
    expect(aG?.parentGroupId).toBe(b);
    expect(aG?.depth).toBe(1);
  });

  it('refuses to move a folder into its own descendant', () => {
    const outer = mockCreateFolder(MOCK_BAR_ID, 'Outer');
    const inner = mockCreateFolder(outer, 'Inner');
    mockMove(outer, { parentId: inner, index: 0 });
    const d = mockLoadData();
    const outerG = d.groups.find((g) => g.id === outer);
    // Still top-level — cycle was blocked.
    expect(outerG?.parentGroupId).toBe(null);
  });

  it('notifies subscribers on change', () => {
    let n = 0;
    const unsub = mockSubscribe(() => {
      n += 1;
    });
    mockCreateFolder(MOCK_BAR_ID, 'x');
    mockCreateFolder(MOCK_BAR_ID, 'y');
    expect(n).toBe(2);
    unsub();
    mockCreateFolder(MOCK_BAR_ID, 'z');
    expect(n).toBe(2);
  });
});
