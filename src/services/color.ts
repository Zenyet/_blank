/**
 * Colour-space helpers centred on the OKLCH palette we use everywhere.
 *
 * The UI picks hues in [0, 360) and always renders them at the fixed
 * (L=0.74, C=0.17) point. When we sample a colour from the page via the
 * Eyedropper API we get back sRGB hex — this module converts that hex into
 * the equivalent OKLCH hue so the rest of the UI can keep working in hue
 * degrees without ever leaving the consistent lightness/chroma band.
 *
 * Math follows Björn Ottosson's OKLab reference:
 *   https://bottosson.github.io/posts/oklab/
 */

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

/**
 * Parse a `#rrggbb` / `#rgb` string into [0..255] triple. Returns null when
 * the input doesn't match a recognisable hex pattern.
 */
export function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    const r = parseInt(clean[0]! + clean[0]!, 16);
    const g = parseInt(clean[1]! + clean[1]!, 16);
    const b = parseInt(clean[2]! + clean[2]!, 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  return null;
}

/**
 * Convert an sRGB hex colour (`#rrggbb`) to an OKLCH hue in [0, 360).
 * Returns null when the hex is unparseable or the colour is so unsaturated
 * that hue is meaningless (very near-grey).
 */
export function hexToOklchHue(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r8, g8, b8] = rgb;
  const r = srgbChannelToLinear(r8);
  const g = srgbChannelToLinear(g8);
  const b = srgbChannelToLinear(b8);
  const [, a, bb] = linearRgbToOklab(r, g, b);
  const chroma = Math.sqrt(a * a + bb * bb);
  if (chroma < 0.002) return null; // basically grey — no meaningful hue.
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return h;
}
