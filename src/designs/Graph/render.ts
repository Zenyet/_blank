import type { Camera, GraphEdge, GraphNode } from '../../types';
import { FaviconCache } from './faviconCache';

export interface RenderState {
  nodes: GraphNode[];
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
}

export interface Theme {
  fg: string;
  fgMuted: string;
  bg: string;
  line: string;
}

export function resizeCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number
): number {
  const dpr = window.devicePixelRatio || 1;
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

  drawEdges(ctx, state);
  if (state.ghost) drawGhost(ctx, state.ghost, theme);
  drawNodes(ctx, state, theme);
  drawLabels(ctx, state, theme);
}

function alphaFor(nodeId: string, filter: Set<string> | null): number {
  if (!filter) return 1;
  return filter.has(nodeId) ? 1 : 0.15;
}

function hueString(h: number, l = 70, c = 0.17): string {
  return `oklch(${l / 100} ${c} ${h})`;
}

function drawEdges(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const byId = new Map(state.nodes.map((n) => [n.id, n] as const));
  for (const e of state.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const isHover = state.hoverEdgeId === e.id;
    const aAlpha = alphaFor(a.id, state.filterMatches);
    const bAlpha = alphaFor(b.id, state.filterMatches);
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

function drawNodes(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  _theme: Theme
): void {
  for (const n of state.nodes) {
    const alpha = alphaFor(n.id, state.filterMatches);
    const isHover = state.hoverNodeId === n.id;
    const isDragging = state.draggingId === n.id;
    const isPinned = Object.prototype.hasOwnProperty.call(state.pins, n.id);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = n.color;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
    ctx.fill();

    // Group hue ring.
    ctx.strokeStyle = hueString(n.groupHue, isHover || isDragging ? 82 : 62);
    ctx.lineWidth = isHover || isDragging ? 2.5 : 1.2;
    ctx.stroke();

    if (isPinned) {
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

    // Center letter monogram.
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${Math.round(n.radius * 0.72)}px var(--font-mono, monospace)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.letter, n.x, n.y + 1);

    // Favicon overlay if loaded — draws on top of letter, same size as radius.
    const img = state.favicons.get(n.url);
    if (img) {
      const s = n.radius * 1.1;
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#fff';
      ctx.fillRect(n.x - s / 2, n.y - s / 2, s, s);
      ctx.drawImage(img, n.x - s / 2, n.y - s / 2, s, s);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function drawLabels(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  theme: Theme
): void {
  ctx.font = '12px var(--font-sans, sans-serif)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const n of state.nodes) {
    const isHover = state.hoverNodeId === n.id;
    const isMatch = state.filterMatches?.has(n.id) ?? false;
    const isPinned = Object.prototype.hasOwnProperty.call(state.pins, n.id);
    if (!isHover && !isMatch && !isPinned) continue;
    ctx.fillStyle = theme.fg;
    ctx.fillText(n.name, n.x, n.y + n.radius + 4);
    if (isHover) {
      ctx.fillStyle = theme.fgMuted;
      ctx.font = '10px var(--font-mono, monospace)';
      try {
        const host = new URL(n.url).hostname.replace(/^www\./, '');
        ctx.fillText(host, n.x, n.y + n.radius + 20);
      } catch {
        /* ignore malformed urls */
      }
      ctx.font = '12px var(--font-sans, sans-serif)';
    }
  }
}
