import { describe, it, expect } from 'vitest';
import type { Bookmark, Group } from '../../types';
import { groupMembers } from './groupMembers';

const g = (id: string, parent: string | null = null, depth = 0): Group => ({
  id,
  label: id,
  parentGroupId: parent,
  depth,
});

const b = (id: string, parentId: string): Bookmark => ({
  id,
  parentId,
  name: id,
  url: `https://${id}.test`,
  group: parentId,
  color: '#000',
  letter: id[0]!.toUpperCase(),
  visits: 0,
  last: '',
});

describe('groupMembers', () => {
  it('returns bookmarks directly inside the root group', () => {
    const groups = [g('root')];
    const bookmarks = [b('a', 'root'), b('b', 'root'), b('c', 'other')];
    expect(groupMembers('root', groups, bookmarks)).toEqual(new Set(['a', 'b']));
  });

  it('includes bookmarks in descendant groups', () => {
    const groups = [
      g('root'),
      g('child', 'root', 1),
      g('grandchild', 'child', 2),
      g('sibling'),
    ];
    const bookmarks = [
      b('a', 'root'),
      b('b', 'child'),
      b('c', 'grandchild'),
      b('d', 'sibling'),
    ];
    expect(groupMembers('root', groups, bookmarks)).toEqual(
      new Set(['a', 'b', 'c'])
    );
  });

  it('returns empty when the root id is unknown', () => {
    const groups = [g('root')];
    const bookmarks = [b('a', 'root')];
    expect(groupMembers('ghost', groups, bookmarks)).toEqual(new Set());
  });

  it('returns empty when the group has no bookmarks anywhere', () => {
    const groups = [g('root'), g('child', 'root', 1)];
    expect(groupMembers('root', groups, [])).toEqual(new Set());
  });

  it('does not leak across sibling subtrees', () => {
    const groups = [g('a'), g('b'), g('a-child', 'a', 1), g('b-child', 'b', 1)];
    const bookmarks = [
      b('x', 'a-child'),
      b('y', 'b-child'),
    ];
    expect(groupMembers('a', groups, bookmarks)).toEqual(new Set(['x']));
    expect(groupMembers('b', groups, bookmarks)).toEqual(new Set(['y']));
  });

  it('handles deep chains without recursion', () => {
    const depth = 200;
    const groups: Group[] = [g('g0')];
    for (let i = 1; i <= depth; i++) groups.push(g(`g${i}`, `g${i - 1}`, i));
    const bookmarks = [b('leaf', `g${depth}`)];
    expect(groupMembers('g0', groups, bookmarks)).toEqual(new Set(['leaf']));
  });
});
