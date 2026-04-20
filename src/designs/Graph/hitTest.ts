import type { GraphEdge, GraphNode } from '../../types';
import { Quadtree } from './sim/barnesHut';

/**
 * A spatial index over nodes for fast mouse hit-testing. We reuse the
 * same `Quadtree` implementation the physics engine uses for Barnes–Hut,
 * because the underlying data structure (a point quadtree over node
 * positions) is identical — only the query differs.
 */
export type NodeIndex = Quadtree;

export function buildNodeIndex(nodes: GraphNode[]): NodeIndex {
  const q = new Quadtree(Math.max(64, nodes.length * 2));
  q.build(nodes);
  return q;
}

/** Return the nearest node whose radius contains (x, y), else null. */
export function findNodeAt(tree: NodeIndex, x: number, y: number): GraphNode | null {
  const candidate = tree.findNearest(x, y);
  if (!candidate) return null;
  const dx = candidate.x - x;
  const dy = candidate.y - y;
  return Math.hypot(dx, dy) <= candidate.radius ? candidate : null;
}

/** Shortest distance from point P to line segment AB. */
export function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const fx = ax + t * dx;
  const fy = ay + t * dy;
  return Math.hypot(px - fx, py - fy);
}

/**
 * Return the first edge whose centerline lies within `threshold` px of (x, y).
 * For our scale (< 200 edges) a linear scan is fine; add a midpoint quadtree
 * only if profiling shows it's needed.
 */
export function findEdgeAt(
  edges: GraphEdge[],
  nodes: GraphNode[],
  x: number,
  y: number,
  threshold: number
): GraphEdge | null {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  let best: { edge: GraphEdge; d: number } | null = null;
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const d = pointToSegmentDistance(x, y, a.x, a.y, b.x, b.y);
    if (d <= threshold && (!best || d < best.d)) best = { edge: e, d };
  }
  return best?.edge ?? null;
}
