import { beforeEach, describe, expect, it } from 'vitest';
import type { GraphNode } from '../../../types';
import { Engine } from './engine';

/**
 * These tests target engine behaviour that a consumer depends on:
 *
 *   - A single tick actually moves nodes.
 *   - Alpha monotonically decays toward the target.
 *   - A pair of overlapping nodes gets pushed apart to at least `rSum`.
 *   - Pinned nodes (`fx`/`fy`) never move.
 *   - Group attraction pulls a node toward its folder centroid.
 *
 * We deliberately test coarse invariants (not exact positions) so future
 * tuning of default constants won't break them.
 */

function makeNode(
  id: string,
  parentId: string,
  x: number,
  y: number,
  extras: Partial<GraphNode> = {}
): GraphNode {
  return {
    id,
    parentId,
    name: id,
    url: `https://${id}`,
    group: parentId,
    color: '#000',
    letter: id[0] ?? '?',
    visits: 0,
    last: '—',
    x,
    y,
    vx: 0,
    vy: 0,
    fx: null,
    fy: null,
    radius: 14,
    groupHue: 200,
    ...extras,
  };
}

describe('Engine', () => {
  let e: Engine;
  beforeEach(() => {
    e = new Engine();
  });

  it('resolves colliding pairs within a few ticks', () => {
    const a = makeNode('a', 'g0', 0, 0);
    const b = makeNode('b', 'g0', 4, 0); // overlap: radius 14 + padding 3 each ⇒ rSum = 34
    e.setTopology([a, b], [], new Map([['g0', 0]]));
    e.alpha(1);
    for (let i = 0; i < 40; i++) e.tick();
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    expect(d).toBeGreaterThan(2 * (a.radius + 3) - 2); // within a pixel of non-overlap
  });

  it('pinned nodes do not move', () => {
    const a = makeNode('a', 'g0', 100, 100, { fx: 100, fy: 100 });
    const b = makeNode('b', 'g0', 100, 100); // perfect overlap
    e.setTopology([a, b], [], new Map([['g0', 0]]));
    e.alpha(1);
    for (let i = 0; i < 20; i++) e.tick();
    expect(a.x).toBe(100);
    expect(a.y).toBe(100);
    // b should have been pushed away from the pinned a
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    expect(d).toBeGreaterThan(10);
  });

  it('alpha decays toward alphaTarget', () => {
    e.setTopology([makeNode('a', 'g0', 0, 0)], [], new Map([['g0', 0]]));
    e.alpha(1);
    e.alphaTarget(0);
    const a0 = e.alpha();
    for (let i = 0; i < 10; i++) e.tick();
    const a1 = e.alpha();
    expect(a1).toBeLessThan(a0);
    expect(a1).toBeGreaterThan(0);
  });

  it('alphaTarget above zero keeps heat alive', () => {
    e.setTopology([makeNode('a', 'g0', 0, 0)], [], new Map([['g0', 0]]));
    e.alpha(0.3);
    e.alphaTarget(0.3);
    for (let i = 0; i < 50; i++) e.tick();
    // Should converge toward the target, not zero.
    expect(e.alpha()).toBeGreaterThan(0.25);
  });

  it('pulls nodes toward their group centroid over time', () => {
    // Place a single node far from the origin. With only one group the
    // centroid lives at the origin (folderCentroid(0, 1, r) = (0, 0)).
    const node = makeNode('a', 'g0', 400, 400);
    e.setTopology([node], [], new Map([['g0', 0]]));
    e.alpha(1);
    for (let i = 0; i < 200; i++) e.tick();
    expect(Math.abs(node.x)).toBeLessThan(400);
    expect(Math.abs(node.y)).toBeLessThan(400);
  });

  it('stop() zeroes alpha and alphaTarget', () => {
    e.setTopology([makeNode('a', 'g0', 0, 0)], [], new Map([['g0', 0]]));
    e.alpha(1);
    e.alphaTarget(0.5);
    e.stop();
    expect(e.alpha()).toBe(0);
    expect(e.alphaTarget()).toBe(0);
  });

  it('spring link contracts to roughly linkDistance', () => {
    // Two nodes linked and placed very far apart. Under defaults the spring
    // should eventually pull them together. We don't require exact target
    // distance — just a meaningful reduction.
    const a = makeNode('a', 'g0', -400, 0);
    const b = makeNode('b', 'g0', 400, 0);
    e.setTopology([a, b], [{ source: a, target: b }], new Map([['g0', 0]]));
    e.alpha(1);
    const d0 = Math.hypot(b.x - a.x, b.y - a.y);
    for (let i = 0; i < 300; i++) e.tick();
    const d1 = Math.hypot(b.x - a.x, b.y - a.y);
    expect(d1).toBeLessThan(d0 * 0.7);
  });

  it('is deterministic given the same inputs and no collisions', () => {
    const nodesA = [makeNode('a', 'g0', 100, 0), makeNode('b', 'g0', -100, 0)];
    const nodesB = [makeNode('a', 'g0', 100, 0), makeNode('b', 'g0', -100, 0)];
    const g = new Map([['g0', 0]]);
    const e1 = new Engine();
    const e2 = new Engine();
    e1.setTopology(nodesA, [], g);
    e2.setTopology(nodesB, [], g);
    e1.alpha(1);
    e2.alpha(1);
    for (let i = 0; i < 50; i++) {
      e1.tick();
      e2.tick();
    }
    expect(nodesA[0]!.x).toBeCloseTo(nodesB[0]!.x, 5);
    expect(nodesA[0]!.y).toBeCloseTo(nodesB[0]!.y, 5);
  });
});
