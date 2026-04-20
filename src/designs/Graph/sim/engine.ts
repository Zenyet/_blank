/**
 * Handrolled 2-D force-directed physics engine.
 *
 * Intentionally minimal and problem-specific — replaces d3-force for this
 * app's single use case. Compared to d3-force we give up:
 *
 *   - Barnes–Hut approximation for charge (we do naive O(n²) instead).
 *     Fine up to ~1k nodes on a modern machine; this app targets ≤ a few
 *     hundred so the constant factor wins over the extra code.
 *   - The generic `force()` plug-in API. Everything is baked in here.
 *
 * What we keep:
 *
 *   - Velocity Verlet-ish integration with a single velocity-decay factor.
 *   - Per-pair charge repulsion with a distance cap (matches d3 defaults).
 *   - Position-level collision resolution with iteration count.
 *   - Spring links with velocity-predicted separation (d3's trick to damp
 *     spring oscillation without needing stiffer decay).
 *   - Per-node group attraction toward a folder centroid (replaces forceX
 *     + forceY).
 *   - Centroid drift correction (replaces forceCenter).
 *   - Alpha decay toward an alphaTarget, plus pinned-node clamping.
 *
 * The engine is deliberately state-light: `setTopology` rebuilds the node
 * list, and `tick()` advances one step. Consumers (see `useGraphSimCustom`)
 * wrap it in a React hook that drives ticks from a rAF loop.
 */

import type { GraphNode } from '../../../types';
import { folderCentroid } from '../folderHue';
import { Quadtree } from './barnesHut';

export interface EngineLink {
  source: GraphNode;
  target: GraphNode;
}

/**
 * Charge algorithm selector.
 *
 *  - `pairwise` — naive O(n²) Coulomb sum. Lower constants; wins for
 *    small N (< ~300 in practice on this data).
 *  - `barnes-hut` — quadtree approximation, O(n log n) per tick. Wins
 *    above that threshold.
 *  - `auto` — picks one based on node count (default).
 */
export type ChargeMode = 'pairwise' | 'barnes-hut' | 'auto';

export interface EngineOptions {
  /** Negative = repulsion. d3 default is roughly -30; ours is tuned for
   *  this app's density and group layout. */
  chargeStrength: number;
  /** Charge falls off fully past this distance — keeps far-away clusters
   *  from tugging on each other and caps worst-case force magnitude. */
  chargeDistanceMax: number;
  /** Pairwise vs Barnes–Hut selection. See `ChargeMode`. */
  chargeMode: ChargeMode;
  /** Barnes–Hut angular threshold. Higher = more aggressive approximation.
   *  d3-force default is 0.9 (we use the same). */
  chargeTheta: number;
  /** When `chargeMode === 'auto'`, the N threshold at which we switch
   *  from pairwise to Barnes–Hut. The crossover on commodity hardware
   *  is around 250–400 nodes; 300 is a safe default. */
  chargeAutoThreshold: number;
  linkDistance: number;
  /** 0..1. Higher = stiffer springs. */
  linkStrength: number;
  /** 0..1. Strength of folder-centroid attraction. */
  groupStrength: number;
  /** Radius of the circle that folder centroids sit on. */
  groupRadius: number;
  collidePadding: number;
  collideIterations: number;
  /** 0..1. Fraction of velocity damped per tick. d3 default is 0.4. */
  velocityDecay: number;
  /** 0..1. Alpha decays toward alphaTarget at this rate per tick. */
  alphaDecay: number;
  /** Below this, tick() is a cheap no-op (modulo alpha decay). */
  alphaMin: number;
  /** 0..1. How aggressively to recenter the cloud to (0,0) each tick. */
  centerStrength: number;
}

export const DEFAULT_OPTIONS: EngineOptions = {
  chargeStrength: -180,
  chargeDistanceMax: 400,
  chargeMode: 'auto',
  chargeTheta: 0.9,
  // Empirical crossover on this app's graph shapes sits around N=450.
  // See `scripts/bench-sim.ts`; pairwise is within ~10% of BH at N=500
  // but decisively faster below N≈300, so 400 is a middle ground.
  chargeAutoThreshold: 400,
  linkDistance: 120,
  linkStrength: 0.3,
  groupStrength: 0.04,
  groupRadius: 260,
  collidePadding: 3,
  collideIterations: 2,
  velocityDecay: 0.4,
  alphaDecay: 0.02,
  alphaMin: 0.001,
  centerStrength: 1,
};

export class Engine {
  private nodes: GraphNode[] = [];
  private links: EngineLink[] = [];
  private groupIndex: Map<string, number> = new Map();
  private groupCount = 1;
  private opts: EngineOptions;
  /** Lazily-allocated Barnes–Hut tree. Rebuilt at the top of each tick
   *  whose charge pass uses BH. */
  private quadtree: Quadtree | null = null;

  private _alpha = 1;
  private _alphaTarget = 0;

  constructor(opts: Partial<EngineOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
  }

  setTopology(
    nodes: GraphNode[],
    links: EngineLink[],
    groupIndex: Map<string, number>
  ): void {
    this.nodes = nodes;
    this.links = links;
    this.groupIndex = groupIndex;
    this.groupCount = Math.max(1, groupIndex.size);
  }

  /**
   * Dynamically adjust the group attraction strength. Useful when the
   * number of groups changes (sparse layout prefers a weaker pull).
   */
  setGroupStrength(strength: number): void {
    this.opts.groupStrength = strength;
  }

  alpha(value?: number): number {
    if (value !== undefined) this._alpha = value;
    return this._alpha;
  }

  alphaTarget(value?: number): number {
    if (value !== undefined) this._alphaTarget = value;
    return this._alphaTarget;
  }

  stop(): void {
    this._alpha = 0;
    this._alphaTarget = 0;
  }

  /** One integration step. Mutates node positions and velocities in place. */
  tick(): void {
    const o = this.opts;
    const nodes = this.nodes;
    const n = nodes.length;
    if (n === 0) {
      // Still decay alpha so `running` loops will eventually fall below
      // alphaMin and go to sleep.
      this._alpha += (this._alphaTarget - this._alpha) * o.alphaDecay;
      return;
    }

    // Below alphaMin we still need to decay so the caller can detect sleep,
    // but we skip the expensive force evaluation.
    if (this._alpha < o.alphaMin && this._alphaTarget === 0) {
      this._alpha += (this._alphaTarget - this._alpha) * o.alphaDecay;
      return;
    }

    const alpha = this._alpha;

    // ── 1. Charge ────────────────────────────────────────────────────────
    // Two paths:
    //   - pairwise: tight O(n²) double loop. Very low constant factor; wins
    //     below the crossover (~300 nodes on this app's data).
    //   - Barnes–Hut: quadtree, O(n log n). Wins above that.
    // The `auto` mode picks based on `chargeAutoThreshold`.
    const chargeAlpha = o.chargeStrength * alpha;
    const maxD2 = o.chargeDistanceMax * o.chargeDistanceMax;
    const useBH =
      o.chargeMode === 'barnes-hut' ||
      (o.chargeMode === 'auto' && n >= o.chargeAutoThreshold);

    if (useBH) {
      if (!this.quadtree) this.quadtree = new Quadtree(Math.max(64, n * 2));
      this.quadtree.build(nodes);
      const thetaSq = o.chargeTheta * o.chargeTheta;
      // Each node walks the tree; the tree itself carries aggregate CoM.
      // Force sign is baked into `chargeAlpha` (negative = repulsion).
      for (let i = 0; i < n; i++) {
        this.quadtree.applyCharge(nodes[i]!, i, chargeAlpha, thetaSq, maxD2);
      }
    } else {
      // Nodes can't escape to infinity because chargeDistanceMax truncates
      // the summed force and because collision re-establishes a minimum
      // gap on the following pass.
      for (let i = 0; i < n; i++) {
        const a = nodes[i]!;
        for (let j = i + 1; j < n; j++) {
          const b = nodes[j]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          // Near-coincident pairs are handled by the collision pass; skipping
          // them here avoids explosive forces that can NaN out the sim.
          if (d2 < 0.01 || d2 > maxD2) continue;
          const w = chargeAlpha / d2;
          const fx = dx * w;
          const fy = dy * w;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }
    }

    // ── 2. Links: spring toward `linkDistance` ───────────────────────────
    // Using (x + vx) — velocity-predicted position — damps spring oscillation
    // without requiring high velocityDecay. Same idea as d3-force.
    for (const link of this.links) {
      const s = link.source;
      const t = link.target;
      const dx = t.x + t.vx - s.x - s.vx;
      const dy = t.y + t.vy - s.y - s.vy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const bias = ((d - o.linkDistance) / d) * alpha * o.linkStrength;
      const fx = dx * bias;
      const fy = dy * bias;
      t.vx -= fx;
      t.vy -= fy;
      s.vx += fx;
      s.vy += fy;
    }

    // ── 3. Group attraction ──────────────────────────────────────────────
    const gs = o.groupStrength * alpha;
    const gr = o.groupRadius;
    const gc = this.groupCount;
    for (let i = 0; i < n; i++) {
      const node = nodes[i]!;
      const idx = this.groupIndex.get(node.parentId) ?? 0;
      const c = folderCentroid(idx, gc, gr);
      node.vx += (c.x - node.x) * gs;
      node.vy += (c.y - node.y) * gs;
    }

    // ── 4. Integrate + dampen ────────────────────────────────────────────
    const damp = 1 - o.velocityDecay;
    for (let i = 0; i < n; i++) {
      const node = nodes[i]!;
      node.vx *= damp;
      node.vy *= damp;
      node.x += node.vx;
      node.y += node.vy;
    }

    // ── 5. Pin clamp ─────────────────────────────────────────────────────
    // Pinned nodes (fx/fy) are held at their fixed spot and don't accumulate
    // velocity; forces may still have pushed on them this tick, which we
    // now discard.
    for (let i = 0; i < n; i++) {
      const node = nodes[i]!;
      if (node.fx != null) {
        node.x = node.fx;
        node.vx = 0;
      }
      if (node.fy != null) {
        node.y = node.fy;
        node.vy = 0;
      }
    }

    // ── 6. Collision (position-level, iterated) ──────────────────────────
    const pad = o.collidePadding;
    for (let iter = 0; iter < o.collideIterations; iter++) {
      for (let i = 0; i < n; i++) {
        const a = nodes[i]!;
        const aPinned = a.fx != null || a.fy != null;
        const ar = a.radius + pad;
        for (let j = i + 1; j < n; j++) {
          const b = nodes[j]!;
          const br = b.radius + pad;
          const rSum = ar + br;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rSum * rSum) continue;
          let d = Math.sqrt(d2);
          if (d < 0.01) {
            // Perfect overlap — jitter along a random axis so the push has
            // a direction. Rare in practice thanks to initial seeding, but
            // guards against NaN.
            const theta = Math.random() * Math.PI * 2;
            dx = Math.cos(theta);
            dy = Math.sin(theta);
            d = 1;
          }
          const overlap = (rSum - d) / d;
          const bPinned = b.fx != null || b.fy != null;
          if (aPinned && !bPinned) {
            b.x += dx * overlap;
            b.y += dy * overlap;
          } else if (bPinned && !aPinned) {
            a.x -= dx * overlap;
            a.y -= dy * overlap;
          } else if (!aPinned && !bPinned) {
            const half = overlap * 0.5;
            a.x -= dx * half;
            a.y -= dy * half;
            b.x += dx * half;
            b.y += dy * half;
          }
          // Both pinned: nothing to resolve.
        }
      }
    }

    // ── 7. Center drift correction ───────────────────────────────────────
    // Without this, net force asymmetries could let the cloud drift. We
    // don't move pinned nodes — they define an anchor frame.
    if (o.centerStrength > 0) {
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < n; i++) {
        const node = nodes[i]!;
        cx += node.x;
        cy += node.y;
      }
      cx = (cx / n) * o.centerStrength;
      cy = (cy / n) * o.centerStrength;
      for (let i = 0; i < n; i++) {
        const node = nodes[i]!;
        if (node.fx == null) node.x -= cx;
        if (node.fy == null) node.y -= cy;
      }
    }

    // ── 8. Alpha decay ───────────────────────────────────────────────────
    this._alpha += (this._alphaTarget - this._alpha) * o.alphaDecay;
  }
}
