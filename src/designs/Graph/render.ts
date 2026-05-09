import type { Camera, GraphEdge, GraphNode } from '../../types';
import { FaviconCache } from './faviconCache';
import { convexHull, inflateHull, pathSmoothBlob } from './hull';

export interface RenderState {
  nodes: GraphNode[];
  nodeById: Map<string, GraphNode>;
  edges: GraphEdge[];
  pins: Record<string, { x: number; y: number }>;
  hoverNodeId: string | null;
  hoverEdgeId: string | null;
  draggingId: string | null;
  /** Set of node ids that match current filter; null = no filter active. */
  filterMatches: Set<string> | null;
  /** Source node + live cursor position while shift-drag is building an edge. */
  ghost: { fromX: number; fromY: number; toX: number; toY: number } | null;
  favicons: FaviconCache;
  /** When set, draw a soft hull behind all nodes whose parentId equals this. */
  highlightGroupId: string | null;
  /** Optional explicit node set for hulls that include descendant folders. */
  highlightGroupMembers?: Set<string> | null;
  highlightGroupHue?: number | null;
  /** Local-graph mode: when set, only nodes in this set render at full
   *  opacity and only edges with both endpoints inside it are drawn. */
  focusNeighborhood: Set<string> | null;
  focusKind: 'node' | 'group' | null;
  textCache: RenderTextCache;
}

export interface Theme {
  fg: string;
  fgMuted: string;
  bg: string;
  line: string;
}

const MAX_CANVAS_DPR = 1.6;
const MAX_BACKING_PIXELS = 4_000_000;
const DETAIL_LABEL_SCALE = 0.42;
const DETAIL_URL_SCALE = 0.82;
const DETAIL_FAVICON_SCALE = 0.72;
const DETAIL_MONOGRAM_SCALE = 0.32;

interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface RenderDetail {
  labels: boolean;
  urls: boolean;
  favicons: boolean;
  monograms: boolean;
}

export class RenderTextCache {
  private ellipsis = new Map<string, string>();
  private urls = new Map<string, string>();

  ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    const key = `${ctx.font}|${maxWidth}|${text}`;
    const cached = this.ellipsis.get(key);
    if (cached !== undefined) return cached;

    const value = ellipsizeMeasured(ctx, text, maxWidth);
    this.ellipsis.set(key, value);
    if (this.ellipsis.size > 5000) this.ellipsis.clear();
    return value;
  }

  displayUrl(url: string): string {
    const cached = this.urls.get(url);
    if (cached !== undefined) return cached;

    const value = displayUrl(url);
    this.urls.set(url, value);
    if (this.urls.size > 5000) this.urls.clear();
    return value;
  }
}

export function resizeCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number
): number {
  const rawDpr = window.devicePixelRatio || 1;
  const cssPixels = Math.max(1, cssWidth * cssHeight);
  const budgetDpr = Math.sqrt(MAX_BACKING_PIXELS / cssPixels);
  const dpr = Math.max(1, Math.min(rawDpr, MAX_CANVAS_DPR, budgetDpr));
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  return dpr;
}

export function applyCamera(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  cssWidth: number,
  cssHeight: number,
  dpr: number
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(cssWidth / 2 + camera.tx, cssHeight / 2 + camera.ty);
  ctx.scale(camera.scale, camera.scale);
}

export function drawGraph(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  camera: Camera,
  theme: Theme,
  size: { width: number; height: number; dpr: number }
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size.width * size.dpr, size.height * size.dpr);
  applyCamera(ctx, camera, size.width, size.height, size.dpr);
  const bounds = visibleWorldBounds(camera, size, 96);
  const detail = detailForScale(camera.scale);

  // Group highlight sits behind everything so nodes + edges remain readable.
  if (state.highlightGroupId) drawGroupHighlight(ctx, state);
  drawEdges(ctx, state, state.nodeById, bounds);
  if (state.ghost) drawGhost(ctx, state.ghost, theme);
  drawNodes(ctx, state, bounds, detail);
  if (detail.labels) drawLabels(ctx, state, theme, bounds, detail);
}

function visibleWorldBounds(
  camera: Camera,
  size: { width: number; height: number },
  padPx: number
): WorldBounds {
  const inv = 1 / camera.scale;
  const pad = padPx * inv;
  return {
    minX: (-size.width / 2 - camera.tx) * inv - pad,
    maxX: (size.width / 2 - camera.tx) * inv + pad,
    minY: (-size.height / 2 - camera.ty) * inv - pad,
    maxY: (size.height / 2 - camera.ty) * inv + pad,
  };
}

function detailForScale(scale: number): RenderDetail {
  return {
    labels: scale >= DETAIL_LABEL_SCALE,
    urls: scale >= DETAIL_URL_SCALE,
    favicons: scale >= DETAIL_FAVICON_SCALE,
    monograms: scale >= DETAIL_MONOGRAM_SCALE,
  };
}

function nodeIntersects(n: GraphNode, bounds: WorldBounds, pad = 0): boolean {
  const r = n.radius + pad;
  return (
    n.x + r >= bounds.minX &&
    n.x - r <= bounds.maxX &&
    n.y + r >= bounds.minY &&
    n.y - r <= bounds.maxY
  );
}

function segmentIntersectsBounds(
  a: GraphNode,
  b: GraphNode,
  bounds: WorldBounds,
  pad = 0
): boolean {
  return (
    Math.max(a.x, b.x) + pad >= bounds.minX &&
    Math.min(a.x, b.x) - pad <= bounds.maxX &&
    Math.max(a.y, b.y) + pad >= bounds.minY &&
    Math.min(a.y, b.y) - pad <= bounds.maxY
  );
}

/**
 * Soft, translucent "blob" behind the nodes of a group — makes the group's
 * spatial extent obvious while editing it in the Groups panel.
 */
function drawGroupHighlight(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const id = state.highlightGroupId!;
  const members = state.highlightGroupMembers
    ? state.nodes.filter((n) => state.highlightGroupMembers!.has(n.id))
    : state.nodes.filter((n) => n.parentId === id);
  if (members.length === 0) return;

  const hue = state.highlightGroupHue ?? members[0]!.groupHue;
  const padding = 36 + (members[0]!.radius ?? 14);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (members.length === 1) {
    // Single node: draw a halo circle around it.
    const n = members[0]!;
    const r = n.radius + padding;
    ctx.fillStyle = hueString(hue, 75, 0.14) + '';
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = hueString(hue, 82, 0.18);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    return;
  }

  const hull = convexHull(members.map((n) => ({ x: n.x, y: n.y })));
  const inflated = inflateHull(hull, padding);

  // Fill.
  ctx.beginPath();
  pathSmoothBlob(ctx, inflated);
  ctx.closePath();
  ctx.fillStyle = hueString(hue, 75, 0.14);
  ctx.globalAlpha = 0.22;
  ctx.fill();

  // Soft stroke.
  ctx.beginPath();
  pathSmoothBlob(ctx, inflated);
  ctx.closePath();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = hueString(hue, 82, 0.2);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function alphaFor(
  nodeId: string,
  filter: Set<string> | null,
  focus: Set<string> | null
): number {
  // Focus mode dominates: out-of-neighborhood nodes are heavily faded so the
  // sub-graph reads as foreground. Filter dim layers on top.
  let a = 1;
  if (focus && !focus.has(nodeId)) a = Math.min(a, 0.08);
  if (filter && !filter.has(nodeId)) a = Math.min(a, 0.15);
  return a;
}

function hueString(h: number, l = 70, c = 0.17): string {
  return `oklch(${l / 100} ${c} ${h})`;
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  byId: Map<string, GraphNode>,
  bounds: WorldBounds
): void {
  for (const e of state.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    if (!segmentIntersectsBounds(a, b, bounds, 48)) continue;
    // In focus mode, hide edges that leave the neighborhood — they only
    // create visual noise and would tether the foreground graph to faded
    // background nodes.
    if (state.focusNeighborhood) {
      if (!state.focusNeighborhood.has(a.id) || !state.focusNeighborhood.has(b.id))
        continue;
    }
    const isHover = state.hoverEdgeId === e.id;
    const aAlpha = alphaFor(a.id, state.filterMatches, state.focusNeighborhood);
    const bAlpha = alphaFor(b.id, state.filterMatches, state.focusNeighborhood);
    const alpha = Math.min(aAlpha, bAlpha) * (isHover ? 1 : 0.6);

    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, hueString(a.groupHue));
    grad.addColorStop(1, hueString(b.groupHue));
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = grad;
    ctx.lineWidth = isHover ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    if (isHover && e.label) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.globalAlpha = 1;
      ctx.font = '11px var(--font-sans, sans-serif)';
      ctx.fillStyle = hueString(a.groupHue, 85, 0.08);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.label, mx, my - 8);
    }
  }
  ctx.globalAlpha = 1;
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  g: NonNullable<RenderState['ghost']>,
  theme: Theme
): void {
  ctx.save();
  ctx.strokeStyle = theme.fgMuted;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(g.fromX, g.fromY);
  ctx.lineTo(g.toX, g.toY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawNodeMonogram(
  ctx: CanvasRenderingContext2D,
  n: GraphNode,
  isGroup: boolean,
  alpha: number
): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.round(n.radius * (isGroup ? 0.56 : 0.72))}px var(--font-mono, monospace)`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(n.letter, n.x, n.y + 1);
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  bounds: WorldBounds,
  detail: RenderDetail
): void {
  for (const n of state.nodes) {
    if (!nodeIntersects(n, bounds, 4)) continue;
    const alpha = alphaFor(n.id, state.filterMatches, state.focusNeighborhood);
    const isHover = state.hoverNodeId === n.id;
    const isDragging = state.draggingId === n.id;
    const isPinned = Object.prototype.hasOwnProperty.call(state.pins, n.id);
    const isGroup = n.nodeKind === 'group';

    ctx.globalAlpha = alpha;
    ctx.fillStyle = isGroup ? hueString(n.groupHue, 56, 0.13) : n.color;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
    ctx.fill();

    // Group hue ring.
    ctx.strokeStyle = hueString(n.groupHue, isHover || isDragging ? 82 : 62);
    ctx.lineWidth = isGroup ? (isHover || isDragging ? 3 : 2) : isHover || isDragging ? 2.5 : 1.2;
    ctx.stroke();

    if (isGroup) {
      ctx.globalAlpha = alpha * 0.34;
      ctx.strokeStyle = hueString(n.groupHue, 88, 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, Math.max(4, n.radius - 6), 0, Math.PI * 2);
      ctx.stroke();
    }

    if (isPinned && !isGroup) {
      ctx.fillStyle = hueString(n.groupHue, 88, 0.18);
      ctx.beginPath();
      const px = n.x + n.radius * 0.7;
      const py = n.y - n.radius * 0.7;
      ctx.moveTo(px, py - 3);
      ctx.lineTo(px + 3, py + 3);
      ctx.lineTo(px - 3, py + 3);
      ctx.closePath();
      ctx.fill();
    }

<<<<<<< HEAD
    // Center letter monogram.
    drawNodeMonogram(ctx, n, isGroup, alpha);
=======
    if (detail.monograms) {
      // Center letter monogram.
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${Math.round(n.radius * (isGroup ? 0.56 : 0.72))}px var(--font-mono, monospace)`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.letter, n.x, n.y + 1);
    }
>>>>>>> 34425ce46b538bacd4fd44b6362db4a834a1b872

    // Favicon overlay if loaded — draws on top of letter, same size as radius.
    const img = detail.favicons && !isGroup ? state.favicons.get(n.url) : null;
    if (img) {
      const s = n.radius * 1.1;
      let drawFailed = false;
      ctx.save();
      try {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius - 1, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = '#fff';
        ctx.fillRect(n.x - s / 2, n.y - s / 2, s, s);
        ctx.drawImage(img, n.x - s / 2, n.y - s / 2, s, s);
      } catch {
        drawFailed = true;
        state.favicons.markBroken(n.url);
        ctx.fillStyle = n.color;
        ctx.fillRect(n.x - s / 2, n.y - s / 2, s, s);
      } finally {
        ctx.restore();
      }
      if (drawFailed) drawNodeMonogram(ctx, n, isGroup, alpha);
    }
  }
  ctx.globalAlpha = 1;
}

function drawLabels(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  theme: Theme,
  bounds: WorldBounds,
  detail: RenderDetail
): void {
  for (const n of state.nodes) {
    if (!nodeIntersects(n, bounds, 180)) continue;
    const isGroup = n.nodeKind === 'group';
    const alpha = alphaFor(n.id, state.filterMatches, state.focusNeighborhood);
    const maxWidth = isGroup ? 140 : 170;
    const y = n.y + n.radius + 4;

    ctx.globalAlpha = Math.max(alpha, isGroup ? 0.7 : 0.38);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.font = `${isGroup ? 600 : 500} 12px var(--font-sans, sans-serif)`;
    ctx.fillStyle = theme.fg;
    ctx.fillText(state.textCache.ellipsize(ctx, n.name, maxWidth), n.x, y);

    if (!isGroup && detail.urls) {
      ctx.globalAlpha = alpha >= 0.5 ? alpha * 0.66 : alpha * 0.82;
      ctx.font = '10px var(--font-mono, monospace)';
      ctx.fillStyle = theme.fg;
      ctx.fillText(
        state.textCache.ellipsize(ctx, state.textCache.displayUrl(n.url), maxWidth),
        n.x,
        y + 15
      );
    }
  }
  ctx.globalAlpha = 1;
}

function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    return `${host}${path}`;
  } catch {
    return url;
  }
}

function ellipsizeMeasured(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}
