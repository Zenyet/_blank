function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const GOLDEN_ANGLE = 137.50776405003785;

/** Deterministic hue in [0, 360) for a folder id. */
export function folderHue(folderId: string): number {
  return (hashStr(folderId) * GOLDEN_ANGLE) % 360;
}

export function hueDistance(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Pick the hue with the largest distance from already-used group colors.
 * This avoids exhausting a tiny preset palette when the user has many folders.
 */
export function pickDistinctHue(usedHues: number[], fallback = 200): number {
  if (usedHues.length === 0) return fallback;

  let bestHue = fallback;
  let bestDistance = -1;
  for (let hue = 0; hue < 360; hue += 1) {
    const nearest = Math.min(...usedHues.map((used) => hueDistance(hue, used)));
    if (nearest > bestDistance) {
      bestDistance = nearest;
      bestHue = hue;
    }
  }
  return bestHue;
}

/** Virtual folder centroid — i-th of n folders on a circle of given radius. */
export function folderCentroid(
  index: number,
  total: number,
  radius: number
): { x: number; y: number } {
  if (total <= 1) return { x: 0, y: 0 };
  const angle = (index / total) * 2 * Math.PI;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}
