import type { Bookmark, Group } from '../../types';

/**
 * Set of bookmark ids that live under `rootGroupId` or any of its descendant
 * groups. Used by group focus mode to dim the rest of the canvas.
 *
 * Implementation is iterative (BFS) rather than recursive so very deep
 * folder trees can't blow the call stack. Returns just `{}` if the root id
 * doesn't match any group — group focus then shows nothing, which is the
 * right tell that the caller passed a stale id (e.g. a deleted group).
 */
export function groupMembers(
  rootGroupId: string,
  groups: readonly Group[],
  bookmarks: readonly Bookmark[]
): Set<string> {
  // 1) Collect all group ids in the subtree rooted at `rootGroupId`.
  const subtree = new Set<string>();
  if (!groups.some((g) => g.id === rootGroupId)) return new Set();
  subtree.add(rootGroupId);

  // Pre-build a parent → children index so subtree expansion is O(N) total
  // instead of O(N^2) on each frontier expansion.
  const childrenByParent = new Map<string, Group[]>();
  for (const g of groups) {
    if (g.parentGroupId == null) continue;
    let list = childrenByParent.get(g.parentGroupId);
    if (!list) {
      list = [];
      childrenByParent.set(g.parentGroupId, list);
    }
    list.push(g);
  }

  let frontier: string[] = [rootGroupId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      const kids = childrenByParent.get(id);
      if (!kids) continue;
      for (const k of kids) {
        if (!subtree.has(k.id)) {
          subtree.add(k.id);
          next.push(k.id);
        }
      }
    }
    frontier = next;
  }

  // 2) Bookmark ids whose parentId is anywhere in the subtree.
  const out = new Set<string>();
  for (const b of bookmarks) {
    if (subtree.has(b.parentId)) out.add(b.id);
  }
  return out;
}
