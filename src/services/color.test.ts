import { describe, expect, it } from 'vitest';
import { hexToOklchHue, parseHex } from './color';

describe('parseHex', () => {
  it('accepts 6-digit hex', () => {
    expect(parseHex('#ff0000')).toEqual([255, 0, 0]);
  });
  it('accepts 3-digit hex', () => {
    expect(parseHex('#f00')).toEqual([255, 0, 0]);
  });
  it('accepts without leading hash', () => {
    expect(parseHex('00ff00')).toEqual([0, 255, 0]);
  });
  it('rejects garbage', () => {
    expect(parseHex('not-a-color')).toBeNull();
    expect(parseHex('')).toBeNull();
    expect(parseHex('#zzzzzz')).toBeNull();
  });
});

describe('hexToOklchHue', () => {
  it('returns null for near-greys', () => {
    expect(hexToOklchHue('#ffffff')).toBeNull();
    expect(hexToOklchHue('#808080')).toBeNull();
    expect(hexToOklchHue('#000000')).toBeNull();
  });

  it('returns a hue in [0, 360) for chromatic colors', () => {
    const red = hexToOklchHue('#ff0000');
    const green = hexToOklchHue('#00ff00');
    const blue = hexToOklchHue('#0000ff');
    for (const h of [red, green, blue]) {
      expect(h).not.toBeNull();
      expect(h!).toBeGreaterThanOrEqual(0);
      expect(h!).toBeLessThan(360);
    }
  });

  it('maps primary colors into expected OKLCH sectors', () => {
    // Reference OKLCH hues (Björn Ottosson):
    //   red   ~29°
    //   green ~142°
    //   blue  ~264°
    const red = hexToOklchHue('#ff0000')!;
    const green = hexToOklchHue('#00ff00')!;
    const blue = hexToOklchHue('#0000ff')!;
    expect(red).toBeGreaterThan(15);
    expect(red).toBeLessThan(45);
    expect(green).toBeGreaterThan(125);
    expect(green).toBeLessThan(160);
    expect(blue).toBeGreaterThan(245);
    expect(blue).toBeLessThan(285);
  });
});
