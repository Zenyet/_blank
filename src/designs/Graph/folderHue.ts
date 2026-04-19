function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Deterministic hue in [0, 360) for a folder id. */
export function folderHue(folderId: string): number {
  return hashStr(folderId) % 360;
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
