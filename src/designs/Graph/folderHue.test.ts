import { describe, it, expect } from 'vitest';
import { folderHue, folderCentroid } from './folderHue';

describe('folderHue', () => {
  it('returns a number in [0, 360) for any string', () => {
    const h = folderHue('abc');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });

  it('is deterministic — same id gives same hue', () => {
    expect(folderHue('folder-1')).toBe(folderHue('folder-1'));
  });

  it('spreads different ids to different hues', () => {
    const hues = ['a', 'b', 'c', 'd', 'e'].map(folderHue);
    const unique = new Set(hues);
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe('folderCentroid', () => {
  it('places each folder on a circle, deterministic by index', () => {
    const c0 = folderCentroid(0, 4, 400);
    const c1 = folderCentroid(1, 4, 400);
    expect(c0.x).not.toBe(c1.x);
    const r0 = Math.hypot(c0.x, c0.y);
    expect(r0).toBeCloseTo(400, 1);
  });

  it('single-folder case centers at origin', () => {
    const c = folderCentroid(0, 1, 400);
    expect(c).toEqual({ x: 0, y: 0 });
  });
});
