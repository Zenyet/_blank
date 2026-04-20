import { describe, it, expect } from 'vitest';
import { convexHull, inflateHull, type Point } from './hull';

function pointSetEqual(a: Point[], b: Point[]): boolean {
  if (a.length !== b.length) return false;
  const key = (p: Point) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
  const bs = new Set(b.map(key));
  return a.every((p) => bs.has(key(p)));
}

describe('convexHull', () => {
  it('returns all input points when <= 1', () => {
    expect(convexHull([])).toEqual([]);
    expect(convexHull([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  });

  it('produces the four outer corners of a square+interior point set', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 }, // interior — should be dropped
    ];
    const hull = convexHull(pts);
    expect(hull.length).toBe(4);
    expect(
      pointSetEqual(hull, [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ])
    ).toBe(true);
  });
});

describe('inflateHull', () => {
  it('pushes every vertex outward so the bbox expands by ~padding on all sides', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const inflated = inflateHull(square, 5);
    expect(inflated.length).toBe(4);
    const xs = inflated.map((p) => p.x);
    const ys = inflated.map((p) => p.y);
    // Each corner moves diagonally outward by padding along bisector.
    // The bbox grows by ~padding * √2 / √2 = padding on each side.
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(10);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(10);
  });
});
