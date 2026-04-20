/**
 * Built-in background presets shipped with the extension.
 *
 * Each entry's `value` is a CSS `background-image` expression — either a
 * `url("…")` for raster/remote assets or a gradient (`linear-gradient(…)`,
 * `radial-gradient(…)`, etc.). `useSettings` stores the raw string in
 * `settings.bgImage` and `[data-bg="image"]` picks it up via
 * `background-image: var(--bg-image)`.
 *
 * We keep the palette OKLCH-centred so built-in backgrounds harmonise with
 * the UI regardless of theme.
 */

export interface BuiltinBackground {
  id: string;
  label: string;
  /** Full CSS background-image value (gradient or url(…)). */
  value: string;
}

export const BUILTIN_BACKGROUNDS: BuiltinBackground[] = [
  {
    id: 'twilight',
    label: '暮色',
    value:
      'linear-gradient(135deg, oklch(0.35 0.12 280) 0%, oklch(0.55 0.16 230) 60%, oklch(0.78 0.14 80) 100%)',
  },
  {
    id: 'reef',
    label: '珊瑚礁',
    value:
      'linear-gradient(135deg, oklch(0.55 0.16 200) 0%, oklch(0.70 0.18 170) 100%)',
  },
  {
    id: 'ember',
    label: '余烬',
    value:
      'radial-gradient(ellipse at 30% 20%, oklch(0.70 0.18 55) 0%, oklch(0.45 0.14 25) 55%, oklch(0.22 0.06 20) 100%)',
  },
  {
    id: 'aurora',
    label: '极光',
    value:
      'linear-gradient(135deg, oklch(0.30 0.08 260) 0%, oklch(0.55 0.18 160) 55%, oklch(0.75 0.14 120) 100%)',
  },
  {
    id: 'peach',
    label: '桃子',
    value:
      'linear-gradient(135deg, oklch(0.85 0.10 60) 0%, oklch(0.72 0.16 20) 100%)',
  },
  {
    id: 'noir',
    label: '夜幕',
    value:
      'radial-gradient(ellipse at top, oklch(0.28 0.04 260) 0%, oklch(0.14 0.02 260) 100%)',
  },
  {
    id: 'paper',
    label: '米纸',
    value:
      'linear-gradient(180deg, oklch(0.96 0.015 85) 0%, oklch(0.92 0.02 80) 100%)',
  },
  {
    id: 'mint',
    label: '薄荷',
    value:
      'linear-gradient(135deg, oklch(0.92 0.04 160) 0%, oklch(0.78 0.10 180) 100%)',
  },
];

/** Background-image strings starting with a gradient keyword should be used
 *  as-is; everything else is treated as a URL and wrapped in `url("…")`. */
export function isGradientValue(v: string): boolean {
  return /^(?:linear|radial|conic)-gradient\s*\(/.test(v.trim());
}

/** Normalise any stored `bgImage` value into a valid CSS background-image. */
export function backgroundImageCssValue(stored: string): string {
  const trimmed = stored.trim();
  if (!trimmed) return 'none';
  if (isGradientValue(trimmed)) return trimmed;
  // Already wrapped (e.g. from a prior migration)?
  if (/^url\(/i.test(trimmed)) return trimmed;
  return `url("${trimmed.replace(/"/g, '\\"')}")`;
}
