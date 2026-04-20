/**
 * Convex hull + inflation used to draw a soft blob behind a group of nodes.
 *
 * `convexHull` runs Andrew's monotone chain (O(n log n)) on a list of 2D
 * points. `inflateHull` pushes each vertex outward along its angle bisector
 * by a fixed padding so the resulting polygon encloses circles of that
 * radius sitting on the original hull.
 */

export interface Point {
  x: number;
  y: number;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function convexHull(points: Point[]): Point[] {
  if (points.length <= 1) return points.slice();
  // Sort by x, then y. Stable sort is not required here.
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Push every hull vertex outward along its bisector by `padding`. */
export function inflateHull(hull: Point[], padding: number): Point[] {
  if (hull.length === 0 || padding <= 0) return hull.slice();
  if (hull.length === 1) {
    return [{ x: hull[0]!.x, y: hull[0]!.y }];
  }
  // Centroid fallback gives a reasonable outward direction even for degenerate
  // (collinear) cases where bisectors would be zero-length.
  let cx = 0;
  let cy = 0;
  for (const p of hull) {
    cx += p.x;
    cy += p.y;
  }
  cx /= hull.length;
  cy /= hull.length;

  const n = hull.length;
  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = hull[(i - 1 + n) % n]!;
    const curr = hull[i]!;
    const next = hull[(i + 1) % n]!;

    // Outward-pointing bisector of the two edge normals.
    const e1x = curr.x - prev.x;
    const e1y = curr.y - prev.y;
    const e2x = next.x - curr.x;
    const e2y = next.y - curr.y;
    // Right-hand normals (for a CCW hull these point outward).
    let n1x = e1y;
    let n1y = -e1x;
    let n2x = e2y;
    let n2y = -e2x;
    const l1 = Math.hypot(n1x, n1y) || 1;
    const l2 = Math.hypot(n2x, n2y) || 1;
    n1x /= l1;
    n1y /= l1;
    n2x /= l2;
    n2y /= l2;
    let bx = n1x + n2x;
    let by = n1y + n2y;
    let blen = Math.hypot(bx, by);
    if (blen < 1e-6) {
      // Bisector degenerate — fall back to radial from centroid.
      bx = curr.x - cx;
      by = curr.y - cy;
      blen = Math.hypot(bx, by) || 1;
    }
    bx /= blen;
    by /= blen;
    result.push({ x: curr.x + bx * padding, y: curr.y + by * padding });
  }
  return result;
}

/**
 * Build a Canvas 2D path for a rounded-blob polygon: moves along hull edges
 * but smooths corners with quadratic curves through edge midpoints. This is
 * the "inflated squircle" look used for group highlights.
 */
export function pathSmoothBlob(ctx: CanvasRenderingContext2D, hull: Point[]): void {
  if (hull.length === 0) return;
  if (hull.length === 1) {
    const p = hull[0]!;
    ctx.moveTo(p.x, p.y);
    return;
  }
  const n = hull.length;
  const mid = (i: number) => ({
    x: (hull[i]!.x + hull[(i + 1) % n]!.x) / 2,
    y: (hull[i]!.y + hull[(i + 1) % n]!.y) / 2,
  });
  const start = mid(n - 1);
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const cp = hull[i]!;
    const m = mid(i);
    ctx.quadraticCurveTo(cp.x, cp.y, m.x, m.y);
  }
}
