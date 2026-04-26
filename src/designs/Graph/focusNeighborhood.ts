import type { GraphEdge } from '../../types';

/**
 * BFS from `rootId` over the undirected edge graph, returning every node
 * reachable within `depth` hops (inclusive of the root). When `rootId` has
 * no incident edges the result is just `{rootId}` — focus mode then shows
 * the lone node without any context, which is the right tell that the user
 * hasn't curated relations yet.
 */
export function focusNeighborhood(
  edges: GraphEdge[],
  rootId: string,
  depth = 1
): Set<string> {
  const out = new Set<string>([rootId]);
  if (depth <= 0) return out;

  // Adjacency built lazily from the edge list. Edges are unordered pairs,
  // so each edge contributes to both endpoints.
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    let a = adj.get(e.from);
    if (!a) {
      a = [];
      adj.set(e.from, a);
    }
    a.push(e.to);
    let b = adj.get(e.to);
    if (!b) {
      b = [];
      adj.set(e.to, b);
    }
    b.push(e.from);
  }

  let frontier: string[] = [rootId];
  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      const neighbors = adj.get(id);
      if (!neighbors) continue;
      for (const n of neighbors) {
        if (!out.has(n)) {
          out.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return out;
}
