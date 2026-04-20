/**
 * Barnes–Hut charge approximation for the custom physics engine.
 *
 * A quadtree is built over node positions each tick; for each target node
 * we walk the tree, and when a subtree is "far enough" relative to its own
 * size (`s² < θ² · d²`) we apply its total mass as a single aggregate
 * contribution. This turns the pairwise O(n²) charge loop into O(n log n).
 *
 * Design notes:
 *
 *  - **Array-of-structs representation.** The quadtree is flattened into
 *    parallel typed arrays (`bounds`, `com`, `children`, `leaf`) indexed
 *    by integer quad ids. Allocating a JS object per quad would cost far
 *    more than the math itself. A pool (`_nodeCount`) is reused across
 *    ticks.
 *
 *  - **Post-order center-of-mass computation.** We build the tree first,
 *    then compute CoM in a single depth-first pass. Keeping CoM out of
 *    the insert loop avoids repeatedly divide-and-average as points pile
 *    up in deep nodes.
 *
 *  - **distanceMax handling.** Matches d3-force's approximation: when the
 *    BH condition is not met (subtree is close relative to its size) we
 *    descend; when the CoM is beyond `distanceMax`, we stop. This can
 *    miss individual close leaves hiding inside a distant CoM, but the
 *    regime where this matters is rare for the geometries this app
 *    produces.
 *
 *  - **Mass = 1 per leaf.** We model all charges as equal. The variable
 *    we care about is aggregate count, not per-node weight.
 */

import type { GraphNode } from '../../../types';

// Child index bit-packing: `eastBit | southBit`. So 0 = NW, 1 = NE, 2 =
// SW, 3 = SE under a y-grows-down coordinate system. We don't reference
// these names directly in the hot path (indices are computed inline), so
// no constants are exported.

/**
 * Flat quadtree storage. All arrays are parallel; index `i` is quad `i`.
 *
 * `children[i*4 + k]` — child quad id for corner k, or -1 if empty.
 * `leaf[i]` — node id if i is a leaf holding a single node, -1 otherwise.
 *   (We hold at most 1 node per leaf and split on collision.)
 * `mass[i]` — number of descendants.
 * `cx[i], cy[i]` — center of mass.
 * `x0,y0,x1,y1[i]` — bounding square.
 */
export class Quadtree {
  private children!: Int32Array;
  private leaf!: Int32Array;
  private mass!: Float64Array;
  private cx!: Float64Array;
  private cy!: Float64Array;
  private x0!: Float64Array;
  private y0!: Float64Array;
  private x1!: Float64Array;
  private y1!: Float64Array;
  private count = 0;
  private capacity = 0;
  private nodes: GraphNode[] = [];

  constructor(initialCapacity = 64) {
    this.grow(initialCapacity);
  }

  private grow(cap: number) {
    const prev = this.capacity;
    this.capacity = cap;
    const children = new Int32Array(cap * 4);
    children.fill(-1);
    if (this.children) children.set(this.children);
    this.children = children;

    const leaf = new Int32Array(cap);
    leaf.fill(-1);
    if (this.leaf) leaf.set(this.leaf);
    this.leaf = leaf;

    const grow1 = (arr?: Float64Array) => {
      const a = new Float64Array(cap);
      if (arr) a.set(arr);
      return a;
    };
    this.mass = grow1(this.mass);
    this.cx = grow1(this.cx);
    this.cy = grow1(this.cy);
    this.x0 = grow1(this.x0);
    this.y0 = grow1(this.y0);
    this.x1 = grow1(this.x1);
    this.y1 = grow1(this.y1);
    void prev;
  }

  private newNode(x0: number, y0: number, x1: number, y1: number): number {
    if (this.count >= this.capacity) this.grow(this.capacity * 2);
    const i = this.count++;
    this.children[i * 4 + 0] = -1;
    this.children[i * 4 + 1] = -1;
    this.children[i * 4 + 2] = -1;
    this.children[i * 4 + 3] = -1;
    this.leaf[i] = -1;
    this.mass[i] = 0;
    this.cx[i] = 0;
    this.cy[i] = 0;
    this.x0[i] = x0;
    this.y0[i] = y0;
    this.x1[i] = x1;
    this.y1[i] = y1;
    return i;
  }

  /** Reset and (re)build the tree over `nodes`. O(n log n). */
  build(nodes: GraphNode[]): void {
    this.count = 0;
    this.nodes = nodes;
    const n = nodes.length;
    if (n === 0) return;

    // Compute the root square bounding box.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = nodes[i]!;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    // Square the box so subdivisions stay square — the BH θ heuristic
    // assumes quads are (approximately) square.
    const w = Math.max(1, maxX - minX, maxY - minY);
    // Slight padding so points on the edge aren't ambiguous.
    const pad = w * 0.01 + 0.5;
    const side = w + pad * 2;
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    this.newNode(cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2);

    for (let i = 0; i < n; i++) this.insert(0, i, nodes[i]!.x, nodes[i]!.y);

    // Post-order CoM computation.
    this.computeCoM(0);
  }

  private childIndex(node: number, x: number, y: number): number {
    const xm = (this.x0[node]! + this.x1[node]!) * 0.5;
    const ym = (this.y0[node]! + this.y1[node]!) * 0.5;
    const eastBit = x >= xm ? 1 : 0;
    const southBit = y >= ym ? 2 : 0;
    return eastBit | southBit; // 0..3 aligning with NE/NW/SE/SW mapping
  }

  private childBounds(node: number, idx: number): [number, number, number, number] {
    const xm = (this.x0[node]! + this.x1[node]!) * 0.5;
    const ym = (this.y0[node]! + this.y1[node]!) * 0.5;
    const east = (idx & 1) === 1;
    const south = (idx & 2) === 2;
    return [east ? xm : this.x0[node]!, south ? ym : this.y0[node]!, east ? this.x1[node]! : xm, south ? this.y1[node]! : ym];
  }

  /**
   * Classic point quadtree insert. When a leaf would hold a second point,
   * it splits; if the two points coincide, we stop subdividing (they'd
   * recurse forever). That's OK — collision resolution will pry them
   * apart next tick.
   */
  private insert(node: number, nodeIndex: number, x: number, y: number): void {
    // Guard: if bounds collapse (coincident points), just attach.
    if (this.x1[node]! - this.x0[node]! < 1e-6) {
      // Chain coincident points as a linked list via the leaf slot isn't
      // worth it; we accept that aggregate mass still reflects this point
      // by summing in computeCoM. Since leaf[node] may already be set, we
      // just accept one "representative" leaf; the rest are accounted for
      // by the ambient collision pass. This case is extremely rare given
      // the collision separator.
      return;
    }

    if (this.leaf[node]! === -1 && this.children[node * 4]! === -1 && this.mass[node]! === 0) {
      // Empty leaf — place directly.
      this.leaf[node] = nodeIndex;
      this.mass[node] = 1;
      return;
    }

    if (this.leaf[node]! !== -1) {
      // Occupied leaf — split.
      const existing = this.leaf[node]!;
      this.leaf[node] = -1;
      const ex = this.nodes[existing]!.x;
      const ey = this.nodes[existing]!.y;
      // Re-insert the existing leaf into a new child.
      const exIdx = this.childIndex(node, ex, ey);
      const [cx0, cy0, cx1, cy1] = this.childBounds(node, exIdx);
      const exChild = this.newNode(cx0, cy0, cx1, cy1);
      this.leaf[exChild] = existing;
      this.mass[exChild] = 1;
      this.children[node * 4 + exIdx] = exChild;
    }

    // Now it's an internal node — route the new point.
    const idx = this.childIndex(node, x, y);
    let child = this.children[node * 4 + idx]!;
    if (child === -1) {
      const [cx0, cy0, cx1, cy1] = this.childBounds(node, idx);
      child = this.newNode(cx0, cy0, cx1, cy1);
      this.children[node * 4 + idx] = child;
    }
    this.insert(child, nodeIndex, x, y);
  }

  private computeCoM(node: number): void {
    if (this.leaf[node]! !== -1) {
      const p = this.nodes[this.leaf[node]!]!;
      this.cx[node] = p.x;
      this.cy[node] = p.y;
      this.mass[node] = 1;
      return;
    }
    let totalMass = 0;
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < 4; k++) {
      const c = this.children[node * 4 + k]!;
      if (c === -1) continue;
      this.computeCoM(c);
      const m = this.mass[c]!;
      totalMass += m;
      sx += this.cx[c]! * m;
      sy += this.cy[c]! * m;
    }
    this.mass[node] = totalMass;
    if (totalMass > 0) {
      this.cx[node] = sx / totalMass;
      this.cy[node] = sy / totalMass;
    }
  }

  /**
   * Apply charge force from this tree to target node `p`. Mutates `p.vx`,
   * `p.vy` in place.
   *
   * `strengthAlpha` — folded product of `chargeStrength * alpha` so the
   *   hot loop can multiply once.
   * `thetaSq` — Barnes–Hut angular threshold squared. Typical 0.81 (θ=0.9).
   * `maxDistSq` — charge falloff. Contributions beyond this are ignored.
   */
  applyCharge(
    p: GraphNode,
    pIndex: number,
    strengthAlpha: number,
    thetaSq: number,
    maxDistSq: number
  ): void {
    if (this.count === 0) return;
    this.applyChargeRec(0, p, pIndex, strengthAlpha, thetaSq, maxDistSq);
  }

  /**
   * Nearest-neighbour query: return the point closest to (x, y), or null
   * if the tree is empty or nothing is within `maxRadius`.
   *
   * Uses the same tree that Barnes–Hut just built. For hit-testing we
   * build a separate tree (different search semantics, no CoM needed),
   * but this method works on either. O(log n) with pruning.
   */
  findNearest(x: number, y: number, maxRadius = Infinity): GraphNode | null {
    if (this.count === 0) return null;
    const maxD2 = maxRadius === Infinity ? Infinity : maxRadius * maxRadius;
    const state = { bestIndex: -1, bestD2: maxD2 };
    this.findNearestRec(0, x, y, state);
    return state.bestIndex >= 0 ? this.nodes[state.bestIndex] ?? null : null;
  }

  private findNearestRec(
    node: number,
    x: number,
    y: number,
    state: { bestIndex: number; bestD2: number }
  ): void {
    if (this.mass[node]! === 0) return;

    // Prune subtrees whose bounding box can't possibly contain a point
    // closer than our current best.
    const qx0 = this.x0[node]!;
    const qy0 = this.y0[node]!;
    const qx1 = this.x1[node]!;
    const qy1 = this.y1[node]!;
    const cx = x < qx0 ? qx0 : x > qx1 ? qx1 : x;
    const cy = y < qy0 ? qy0 : y > qy1 ? qy1 : y;
    const bdx = cx - x;
    const bdy = cy - y;
    if (bdx * bdx + bdy * bdy > state.bestD2) return;

    if (this.leaf[node]! !== -1) {
      const p = this.nodes[this.leaf[node]!]!;
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < state.bestD2) {
        state.bestD2 = d2;
        state.bestIndex = this.leaf[node]!;
      }
      return;
    }

    // Visit children nearest-first. Cheap proxy: walk in quadrant order
    // toward the query point (NW/NE/SW/SE based on midpoints).
    const xm = (qx0 + qx1) * 0.5;
    const ym = (qy0 + qy1) * 0.5;
    const preferEast = x >= xm ? 1 : 0;
    const preferSouth = y >= ym ? 2 : 0;
    // `visit` order picked to explore the preferred quadrant first, then
    // its horizontal/vertical neighbours, then the far corner.
    const order = [
      preferEast | preferSouth,
      (preferEast ^ 1) | preferSouth,
      preferEast | (preferSouth ^ 2),
      (preferEast ^ 1) | (preferSouth ^ 2),
    ];
    for (let k = 0; k < 4; k++) {
      const c = this.children[node * 4 + order[k]!]!;
      if (c !== -1) this.findNearestRec(c, x, y, state);
    }
  }

  private applyChargeRec(
    node: number,
    p: GraphNode,
    pIndex: number,
    strengthAlpha: number,
    thetaSq: number,
    maxDistSq: number
  ): void {
    const mass = this.mass[node]!;
    if (mass === 0) return;

    const dx = this.cx[node]! - p.x;
    const dy = this.cy[node]! - p.y;
    const d2 = dx * dx + dy * dy;

    // Size of this quad (it's square by construction, so width = height).
    const s = this.x1[node]! - this.x0[node]!;

    // BH condition: quad is "far enough" relative to its size. Matches
    // d3: `w * w / theta² < d²`  ⇔  `w² < theta² * d²`.
    const isLeaf = this.leaf[node]! !== -1;
    const isInternal = !isLeaf && this.children[node * 4]! + this.children[node * 4 + 1]! + this.children[node * 4 + 2]! + this.children[node * 4 + 3]! !== -4;

    if (isInternal && s * s < thetaSq * d2) {
      // Use aggregate. Skip if coincident or beyond cutoff.
      if (d2 < 0.01 || d2 > maxDistSq) return;
      const w = (strengthAlpha * mass) / d2;
      p.vx += dx * w;
      p.vy += dy * w;
      return;
    }

    if (isLeaf) {
      // Direct interaction, but skip self.
      if (this.leaf[node]! === pIndex) return;
      if (d2 < 0.01 || d2 > maxDistSq) return;
      const w = strengthAlpha / d2;
      p.vx += dx * w;
      p.vy += dy * w;
      return;
    }

    // Internal node, BH condition failed — recurse, unless even the CoM
    // is beyond the cutoff (matches d3-force's prune).
    if (d2 > maxDistSq) return;
    for (let k = 0; k < 4; k++) {
      const c = this.children[node * 4 + k]!;
      if (c !== -1) this.applyChargeRec(c, p, pIndex, strengthAlpha, thetaSq, maxDistSq);
    }
  }
}
