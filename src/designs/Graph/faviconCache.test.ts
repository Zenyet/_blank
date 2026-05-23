import { describe, expect, it } from 'vitest';
import { isDrawableFaviconImage } from './faviconCache';

function image(overrides: Partial<HTMLImageElement> = {}): HTMLImageElement {
  return {
    complete: true,
    naturalWidth: 16,
    naturalHeight: 16,
    ...overrides,
  } as HTMLImageElement;
}

describe('isDrawableFaviconImage', () => {
  it('accepts loaded icons with usable dimensions', () => {
    expect(isDrawableFaviconImage(image())).toBe(true);
  });

  it('rejects unloaded or broken icons', () => {
    expect(isDrawableFaviconImage(image({ complete: false }))).toBe(false);
    expect(isDrawableFaviconImage(image({ naturalWidth: 0 }))).toBe(false);
    expect(isDrawableFaviconImage(image({ naturalHeight: 0 }))).toBe(false);
  });

  it('rejects oversized images that would waste decoded memory', () => {
    expect(isDrawableFaviconImage(image({ naturalWidth: 512 }))).toBe(false);
    expect(isDrawableFaviconImage(image({ naturalHeight: 512 }))).toBe(false);
  });
});
