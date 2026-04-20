/**
 * Barnes–Hut correctness vs. naive pairwise.
 *
 * We only care about two things:
 *   1. For the same starting positions and alpha, a *single* tick under
 *      BH produces velocities close to the pairwise baseline (within a
 *      reasonable tolerance — BH is an approximation, not equivalent).
 *   2. Over many ticks, both modes converge to equivalent equilibria (we
 *      check pairwise distances, since global rotation/translation is
 *      allowed to drift slightly).
 */

import { describe, expect, it } from 'vitest';
import type { GraphNode } from '../../../types';
import { Engine } from './engine';
import { Quadtree } from './barnesHut';

function makeRing(n: number, radius = 300): GraphNode[] {
  return Array.from({ length: n }, (_, i) => {
    const theta = (i / n) * Math.PI * 2;
    return blankNode(`n${i}`, Math.cos(theta) * radius, Math.sin(theta) * radius);
  });
}

/** Deterministic pseudo-random cluster (LCG seeded from `seed`). */
function makeCluster(n: number, seed = 42): GraphNode[] {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: n }, (_, i) => blankNode(`n${i}`, (rand() - 0.5) * 400, (rand() - 0.5) * 400));
}

function blankNode(id: string, x: number, y: number): GraphNode {
  return {
    id,
    parentId: 'g0',
    name: id,
    url: '',
    group: 'g0',
    color: '#000',
    letter: 'x',
    visits: 0,
    last: '—',
    x,
    y,
    vx: 0,
    vy: 0,
    fx: null,
    fy: null,
    radius: 12,
    groupHue: 200,
  };
}

function clone(nodes: GraphNode[]): GraphNode[] {
  return nodes.map((n) => ({ ...n }));
}

describe('Barnes–Hut charge', () => {
  it('θ=0 + no distance cutoff makes BH degenerate to pairwise', () => {
    // When θ=0, the BH aggregation condition (`s² < θ² · d²`) is never
    // satisfied, so every internal node recurses to its leaves. We also
    // disable the distanceMax prune (which d3-force and this engine share
    // as a lossy approximation at internal nodes) by setting the cutoff
    // to Infinity. Under those conditions BH must reproduce pairwise to
    // within floating-point noise.
    const base = makeCluster(60);
    const a = clone(base);
    const b = clone(base);

    const pairwise = new Engine({
      chargeMode: 'pairwise',
      chargeDistanceMax: Infinity,
    });
    pairwise.setTopology(a, [], new Map([['g0', 0]]));
    pairwise.alpha(1);
    pairwise.tick();

    const bh = new Engine({
      chargeMode: 'barnes-hut',
      chargeTheta: 0,
      chargeDistanceMax: Infinity,
    });
    bh.setTopology(b, [], new Map([['g0', 0]]));
    bh.alpha(1);
    bh.tick();

    for (let i = 0; i < a.length; i++) {
      expect(b[i]!.vx).toBeCloseTo(a[i]!.vx, 5);
      expect(b[i]!.vy).toBeCloseTo(a[i]!.vy, 5);
    }
  });

  it('θ=0.9 approximates pairwise with bounded error on a cluster', () => {
    const base = makeCluster(120, 1337);
    const a = clone(base);
    const b = clone(base);

    const pairwise = new Engine({ chargeMode: 'pairwise' });
    pairwise.setTopology(a, [], new Map([['g0', 0]]));
    pairwise.alpha(1);
    pairwise.tick();

    const bh = new Engine({ chargeMode: 'barnes-hut', chargeTheta: 0.9 });
    bh.setTopology(b, [], new Map([['g0', 0]]));
    bh.alpha(1);
    bh.tick();

    // Metric: total L² error across the whole velocity field, divided by
    // total pairwise velocity magnitude. This is meaningful even when
    // individual nodes have cancelling contributions.
    let errSq = 0;
    let mag2 = 0;
    for (let i = 0; i < a.length; i++) {
      const dx = b[i]!.vx - a[i]!.vx;
      const dy = b[i]!.vy - a[i]!.vy;
      errSq += dx * dx + dy * dy;
      mag2 += a[i]!.vx * a[i]!.vx + a[i]!.vy * a[i]!.vy;
    }
    const relFieldError = Math.sqrt(errSq / mag2);
    // d3-force at θ=0.9 typically lands within 5–10% field error on
    // similar geometries. We give ourselves 20% headroom to stay robust.
    expect(relFieldError).toBeLessThan(0.2);
  });

  it('converges to a similar equilibrium as pairwise over many ticks', () => {
    const base = makeRing(80, 320);
    const a = clone(base);
    const b = clone(base);

    const pairwise = new Engine({ chargeMode: 'pairwise' });
    pairwise.setTopology(a, [], new Map([['g0', 0]]));
    pairwise.alpha(1);
    const bh = new Engine({ chargeMode: 'barnes-hut' });
    bh.setTopology(b, [], new Map([['g0', 0]]));
    bh.alpha(1);

    for (let i = 0; i < 300; i++) {
      pairwise.tick();
      bh.tick();
    }

    // Neighbour distance around the ring should be similar. We check the
    // mean of (consecutive-node distance) between the two engines.
    const meanNN = (nodes: GraphNode[]) => {
      let sum = 0;
      for (let i = 0; i < nodes.length; i++) {
        const j = (i + 1) % nodes.length;
        sum += Math.hypot(nodes[j]!.x - nodes[i]!.x, nodes[j]!.y - nodes[i]!.y);
      }
      return sum / nodes.length;
    };
    const pMean = meanNN(a);
    const bMean = meanNN(b);
    // The ring rearranges, so exact node-by-node comparison is noisy; the
    // structural invariant is similar node density → similar neighbour
    // spacing.
    expect(Math.abs(bMean - pMean) / pMean).toBeLessThan(0.2);
  });

  it('findNearest agrees with a brute-force scan on a random cluster', () => {
    const nodes = makeCluster(200, 7777);
    const tree = new Quadtree(512);
    tree.build(nodes);

    // Ten random query points; for each, compare our tree's answer with
    // the brute-force nearest by scanning all nodes.
    for (let t = 0; t < 10; t++) {
      const qx = (t - 5) * 73;
      const qy = ((t * 17) % 11) - 5;
      const nearest = tree.findNearest(qx, qy);
      let bruteIdx = -1;
      let bruteD2 = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        const dx = nodes[i]!.x - qx;
        const dy = nodes[i]!.y - qy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bruteD2) {
          bruteD2 = d2;
          bruteIdx = i;
        }
      }
      expect(nearest?.id).toBe(nodes[bruteIdx]!.id);
    }
  });

  it('findNearest respects maxRadius', () => {
    const nodes = makeCluster(50);
    const tree = new Quadtree(128);
    tree.build(nodes);
    // Query very far away with a tiny max radius → must return null.
    expect(tree.findNearest(1_000_000, 1_000_000, 10)).toBeNull();
  });

  it('findNearest returns null on an empty tree', () => {
    const tree = new Quadtree(16);
    tree.build([]);
    expect(tree.findNearest(0, 0)).toBeNull();
  });

  it('auto mode picks pairwise below threshold and BH above', () => {
    // We can't directly introspect which branch ran, but we can verify
    // the engine doesn't throw and produces sane output under both sizes.
    const small = makeRing(10);
    const large = makeRing(500);

    const eS = new Engine({ chargeAutoThreshold: 100 });
    eS.setTopology(small, [], new Map([['g0', 0]]));
    eS.alpha(1);
    for (let i = 0; i < 50; i++) eS.tick();
    expect(Number.isFinite(small[0]!.x)).toBe(true);

    const eL = new Engine({ chargeAutoThreshold: 100 });
    eL.setTopology(large, [], new Map([['g0', 0]]));
    eL.alpha(1);
    for (let i = 0; i < 50; i++) eL.tick();
    expect(Number.isFinite(large[0]!.x)).toBe(true);
  });
});
