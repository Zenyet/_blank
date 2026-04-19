import { describe, it, expect } from 'vitest';
import { viewToWorld, worldToView, clampScale, zoomAt } from './useCamera';

const cam = { scale: 1, tx: 0, ty: 0 };
const size = { width: 1000, height: 600 };

describe('viewToWorld / worldToView', () => {
  it('inverse at identity', () => {
    const [wx, wy] = viewToWorld(cam, 100, 80, size);
    const [vx, vy] = worldToView(cam, wx, wy, size);
    expect(vx).toBeCloseTo(100, 5);
    expect(vy).toBeCloseTo(80, 5);
  });

  it('respects pan', () => {
    const c = { scale: 1, tx: 50, ty: 25 };
    const [wx, wy] = viewToWorld(c, 500, 300, size);
    expect(wx).toBeCloseTo(-50, 5);
    expect(wy).toBeCloseTo(-25, 5);
  });

  it('respects scale', () => {
    const c = { scale: 2, tx: 0, ty: 0 };
    const [wx, wy] = viewToWorld(c, 600, 400, size);
    expect(wx).toBeCloseTo(50, 5);
    expect(wy).toBeCloseTo(50, 5);
  });
});

describe('clampScale', () => {
  it('clamps within bounds', () => {
    expect(clampScale(0.1)).toBe(0.3);
    expect(clampScale(5)).toBe(3);
    expect(clampScale(1)).toBe(1);
  });
});

describe('zoomAt', () => {
  it('keeps the anchor point fixed in world space', () => {
    const next = zoomAt(cam, 2, 600, 400, size);
    const [wx, wy] = viewToWorld(next, 600, 400, size);
    const [wxStart, wyStart] = viewToWorld(cam, 600, 400, size);
    expect(wx).toBeCloseTo(wxStart, 3);
    expect(wy).toBeCloseTo(wyStart, 3);
  });
});
