# Graph View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing `Constellation.tsx` new-tab view with an Obsidian-style force-directed Graph view (Canvas 2D + d3-force), supporting same-folder clustering via weak gravity, manual user-created edges, drag & pin, zoom & pan, and 60fps at 500 nodes.

**Architecture:** One React shell (`Graph.tsx`) hosting a single `<canvas>` (`GraphCanvas.tsx`) that runs its own `requestAnimationFrame` loop — physics via `d3-force`, hit-testing via `d3-quadtree`, pure Canvas 2D draw. Zoom/pan live in a non-React camera ref to avoid per-frame re-renders. Persistent state (manual edges + pins) uses `chrome.storage.local` with `localStorage` fallback.

**Tech Stack:** React 18 + TypeScript + Vite (existing) · `d3-force` · `d3-quadtree` · Canvas 2D · chrome.storage.local · Vitest (new, for pure-logic tests).

**Spec:** `docs/superpowers/specs/2026-04-19-graph-view-design.md`

---

## Task 0: Project setup — git, dependencies, test runner

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Initialize git repository**

```bash
cd /Users/zy/Projects/_blank
git init
git add -A
git commit -m "chore: baseline snapshot before Graph view refactor"
```

Expected: a single commit with the existing Constellation extension.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install d3-force d3-quadtree
npm install -D @types/d3-force @types/d3-quadtree vitest @vitest/ui jsdom
```

Expected: new dependencies appear in `package.json`. No peer-dep warnings that block install.

- [ ] **Step 3: Add test scripts to `package.json`**

In the `"scripts"` section add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

- [ ] **Step 5: Create test setup file**

`src/test/setup.ts`:

```ts
// Minimal jsdom augmentations for browser APIs used by our code.
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as unknown as { crypto: Crypto }).crypto = {} as Crypto;
}
```

- [ ] **Step 6: Update `tsconfig.app.json` types field**

Modify the `"types"` array to include `vitest/globals`:

```json
"types": ["chrome", "vite/client", "vitest/globals"]
```

- [ ] **Step 7: Run a smoke test to verify vitest works**

```bash
echo "it('smoke', () => { expect(1 + 1).toBe(2); });" > src/test/smoke.test.ts
npm test
rm src/test/smoke.test.ts
```

Expected: `1 passed`. Confirms vitest + jsdom run.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: add d3-force, d3-quadtree, vitest"
```

---

## Task 1: Graph types and folder-hue utility

**Files:**
- Modify: `src/types.ts`
- Create: `src/designs/Graph/folderHue.ts`
- Create: `src/designs/Graph/folderHue.test.ts`

- [ ] **Step 1: Extend `src/types.ts` with Graph types**

Append to the end of the file:

```ts
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: 'manual';
  label?: string;
}

export interface GraphPin {
  x: number;
  y: number;
}

export type PinsMap = Record<string, GraphPin>;

export interface Camera {
  scale: number;
  tx: number;
  ty: number;
}

export interface GraphNode extends Bookmark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  radius: number;
  groupHue: number;
}
```

- [ ] **Step 2: Write the failing test for folderHue**

Create `src/designs/Graph/folderHue.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test — expect fail**

```bash
npm test -- folderHue
```

Expected: FAIL with "Cannot find module './folderHue'".

- [ ] **Step 4: Implement folderHue + folderCentroid**

Create `src/designs/Graph/folderHue.ts`:

```ts
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
```

- [ ] **Step 5: Run test — expect pass**

```bash
npm test -- folderHue
```

Expected: `3 passed` (folderHue) + `2 passed` (folderCentroid).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(graph): add types and folderHue/folderCentroid utilities"
```

---

## Task 2: Persistent edges (TDD)

**Files:**
- Create: `src/designs/Graph/edges.ts`
- Create: `src/designs/Graph/edges.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/designs/Graph/edges.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  edgeId,
  addEdge,
  removeEdge,
  cleanOrphans,
} from './edges';
import type { GraphEdge } from '../../types';

describe('edgeId', () => {
  it('produces the same id regardless of argument order', () => {
    expect(edgeId('a', 'b')).toBe(edgeId('b', 'a'));
  });

  it('produces different ids for different pairs', () => {
    expect(edgeId('a', 'b')).not.toBe(edgeId('a', 'c'));
  });
});

describe('addEdge', () => {
  it('adds a new edge', () => {
    const next = addEdge([], 'a', 'b');
    expect(next).toHaveLength(1);
    expect(next[0]!.from).toBe('a');
    expect(next[0]!.to).toBe('b');
    expect(next[0]!.kind).toBe('manual');
  });

  it('is idempotent — does not duplicate same pair', () => {
    const once = addEdge([], 'a', 'b');
    const twice = addEdge(once, 'b', 'a');
    expect(twice).toHaveLength(1);
  });

  it('ignores self-edges', () => {
    expect(addEdge([], 'a', 'a')).toEqual([]);
  });

  it('preserves optional label', () => {
    const next = addEdge([], 'a', 'b', 'relates-to');
    expect(next[0]!.label).toBe('relates-to');
  });
});

describe('removeEdge', () => {
  it('removes edge by id', () => {
    const seed: GraphEdge[] = [{ id: 'a:b', from: 'a', to: 'b', kind: 'manual' }];
    expect(removeEdge(seed, 'a:b')).toEqual([]);
  });

  it('is a no-op when id is missing', () => {
    const seed: GraphEdge[] = [{ id: 'a:b', from: 'a', to: 'b', kind: 'manual' }];
    expect(removeEdge(seed, 'x:y')).toEqual(seed);
  });
});

describe('cleanOrphans', () => {
  it('drops edges whose endpoints are no longer valid', () => {
    const seed: GraphEdge[] = [
      { id: 'a:b', from: 'a', to: 'b', kind: 'manual' },
      { id: 'b:c', from: 'b', to: 'c', kind: 'manual' },
    ];
    const valid = new Set(['a', 'b']);
    expect(cleanOrphans(seed, valid)).toEqual([seed[0]]);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
npm test -- edges
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `edges.ts`**

Create `src/designs/Graph/edges.ts`:

```ts
import type { GraphEdge } from '../../types';

/** Order-independent, collision-safe id for an unordered {from,to} pair. */
export function edgeId(from: string, to: string): string {
  return from < to ? `${from}\u0000${to}` : `${to}\u0000${from}`;
}

export function addEdge(
  edges: GraphEdge[],
  from: string,
  to: string,
  label?: string
): GraphEdge[] {
  if (from === to) return edges;
  const id = edgeId(from, to);
  if (edges.some((e) => e.id === id)) return edges;
  const next: GraphEdge = { id, from, to, kind: 'manual' };
  if (label) next.label = label;
  return [...edges, next];
}

export function removeEdge(edges: GraphEdge[], id: string): GraphEdge[] {
  return edges.filter((e) => e.id !== id);
}

export function cleanOrphans(
  edges: GraphEdge[],
  validNodeIds: Set<string>
): GraphEdge[] {
  return edges.filter((e) => validNodeIds.has(e.from) && validNodeIds.has(e.to));
}

// ─── Persistence ─────────────────────────────────────────────────────────

const KEY = 'newtab-graph-edges';

function hasStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

export async function loadEdges(): Promise<GraphEdge[]> {
  if (hasStorage()) {
    const obj = await chrome.storage.local.get(KEY);
    const raw = obj[KEY];
    return Array.isArray(raw) ? (raw as GraphEdge[]) : [];
  }
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GraphEdge[]) : [];
  } catch {
    return [];
  }
}

export async function saveEdges(edges: GraphEdge[]): Promise<void> {
  if (hasStorage()) {
    await chrome.storage.local.set({ [KEY]: edges });
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(edges));
  } catch {
    /* noop */
  }
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm test -- edges
```

Expected: all edges tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(graph): add edge model, CRUD, and persistence"
```

---

## Task 3: Persistent pins (TDD)

**Files:**
- Create: `src/designs/Graph/pins.ts`
- Create: `src/designs/Graph/pins.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/designs/Graph/pins.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { setPin, unsetPin, cleanOrphanPins } from './pins';
import type { PinsMap } from '../../types';

describe('setPin', () => {
  it('adds a pin', () => {
    const next = setPin({}, 'n1', 10, 20);
    expect(next.n1).toEqual({ x: 10, y: 20 });
  });

  it('overwrites existing pin', () => {
    const next = setPin({ n1: { x: 0, y: 0 } }, 'n1', 5, 5);
    expect(next.n1).toEqual({ x: 5, y: 5 });
  });
});

describe('unsetPin', () => {
  it('removes existing pin', () => {
    const next = unsetPin({ n1: { x: 0, y: 0 } }, 'n1');
    expect(next.n1).toBeUndefined();
  });

  it('no-op on missing id', () => {
    const start: PinsMap = { n1: { x: 0, y: 0 } };
    const next = unsetPin(start, 'nX');
    expect(next).toEqual(start);
  });
});

describe('cleanOrphanPins', () => {
  it('drops pins whose id is not in validNodeIds', () => {
    const start: PinsMap = { n1: { x: 0, y: 0 }, n2: { x: 1, y: 1 } };
    const next = cleanOrphanPins(start, new Set(['n1']));
    expect(next).toEqual({ n1: { x: 0, y: 0 } });
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
npm test -- pins
```

Expected: module-not-found fail.

- [ ] **Step 3: Implement `pins.ts`**

Create `src/designs/Graph/pins.ts`:

```ts
import type { PinsMap } from '../../types';

export function setPin(pins: PinsMap, id: string, x: number, y: number): PinsMap {
  return { ...pins, [id]: { x, y } };
}

export function unsetPin(pins: PinsMap, id: string): PinsMap {
  if (!(id in pins)) return pins;
  const next = { ...pins };
  delete next[id];
  return next;
}

export function cleanOrphanPins(pins: PinsMap, validNodeIds: Set<string>): PinsMap {
  const next: PinsMap = {};
  for (const [id, p] of Object.entries(pins)) {
    if (validNodeIds.has(id)) next[id] = p;
  }
  return next;
}

// ─── Persistence ─────────────────────────────────────────────────────────

const KEY = 'newtab-graph-pins';

function hasStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

export async function loadPins(): Promise<PinsMap> {
  if (hasStorage()) {
    const obj = await chrome.storage.local.get(KEY);
    const raw = obj[KEY];
    return raw && typeof raw === 'object' ? (raw as PinsMap) : {};
  }
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PinsMap) : {};
  } catch {
    return {};
  }
}

export async function savePins(pins: PinsMap): Promise<void> {
  if (hasStorage()) {
    await chrome.storage.local.set({ [KEY]: pins });
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(pins));
  } catch {
    /* noop */
  }
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm test -- pins
```

Expected: all pins tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(graph): add pin model, CRUD, and persistence"
```

---

## Task 4: Hit testing (TDD)

**Files:**
- Create: `src/designs/Graph/hitTest.ts`
- Create: `src/designs/Graph/hitTest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/designs/Graph/hitTest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildNodeIndex,
  findNodeAt,
  findEdgeAt,
  pointToSegmentDistance,
} from './hitTest';
import type { GraphEdge, GraphNode } from '../../types';

function node(id: string, x: number, y: number, r = 10): GraphNode {
  return {
    id,
    parentId: 'p',
    name: id,
    url: `https://${id}.example`,
    group: 'p',
    color: '#000',
    letter: id.slice(0, 2).toUpperCase(),
    visits: 0,
    last: '—',
    x,
    y,
    vx: 0,
    vy: 0,
    radius: r,
    groupHue: 0,
  };
}

describe('findNodeAt', () => {
  it('returns node whose radius contains the point', () => {
    const nodes = [node('a', 0, 0, 10), node('b', 100, 0, 10)];
    const tree = buildNodeIndex(nodes);
    expect(findNodeAt(tree, 3, 3)?.id).toBe('a');
  });

  it('returns null when no node is within its radius', () => {
    const nodes = [node('a', 0, 0, 10)];
    const tree = buildNodeIndex(nodes);
    expect(findNodeAt(tree, 50, 50)).toBeNull();
  });

  it('picks the nearer node when two are close', () => {
    const nodes = [node('a', 0, 0, 20), node('b', 30, 0, 20)];
    const tree = buildNodeIndex(nodes);
    expect(findNodeAt(tree, 5, 0)?.id).toBe('a');
    expect(findNodeAt(tree, 25, 0)?.id).toBe('b');
  });
});

describe('pointToSegmentDistance', () => {
  it('is 0 for point on segment', () => {
    expect(pointToSegmentDistance(5, 0, 0, 0, 10, 0)).toBe(0);
  });

  it('equals perpendicular distance when foot is inside segment', () => {
    expect(pointToSegmentDistance(5, 4, 0, 0, 10, 0)).toBe(4);
  });

  it('falls back to endpoint distance when foot is outside segment', () => {
    expect(pointToSegmentDistance(-3, 0, 0, 0, 10, 0)).toBe(3);
    expect(pointToSegmentDistance(14, 0, 0, 0, 10, 0)).toBe(4);
  });
});

describe('findEdgeAt', () => {
  const nodes = [node('a', 0, 0), node('b', 100, 0)];
  const edges: GraphEdge[] = [
    { id: 'a:b', from: 'a', to: 'b', kind: 'manual' },
  ];

  it('hits a point near the edge centerline', () => {
    const hit = findEdgeAt(edges, nodes, 50, 3, 6);
    expect(hit?.id).toBe('a:b');
  });

  it('misses when beyond the threshold', () => {
    expect(findEdgeAt(edges, nodes, 50, 20, 6)).toBeNull();
  });

  it('misses when the point is off the end of the segment', () => {
    expect(findEdgeAt(edges, nodes, 200, 0, 6)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
npm test -- hitTest
```

Expected: module-not-found.

- [ ] **Step 3: Implement `hitTest.ts`**

Create `src/designs/Graph/hitTest.ts`:

```ts
import { quadtree, type Quadtree } from 'd3-quadtree';
import type { GraphEdge, GraphNode } from '../../types';

export type NodeIndex = Quadtree<GraphNode>;

export function buildNodeIndex(nodes: GraphNode[]): NodeIndex {
  return quadtree<GraphNode>()
    .x((n) => n.x)
    .y((n) => n.y)
    .addAll(nodes);
}

/** Return the nearest node whose radius contains (x, y), else null. */
export function findNodeAt(tree: NodeIndex, x: number, y: number): GraphNode | null {
  const candidate = tree.find(x, y);
  if (!candidate) return null;
  const dx = candidate.x - x;
  const dy = candidate.y - y;
  return Math.hypot(dx, dy) <= candidate.radius ? candidate : null;
}

/** Shortest distance from point P to line segment AB. */
export function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const fx = ax + t * dx;
  const fy = ay + t * dy;
  return Math.hypot(px - fx, py - fy);
}

/**
 * Return the first edge whose centerline lies within `threshold` px of (x, y).
 * For our scale (< 200 edges) a linear scan is fine; add a midpoint quadtree
 * only if profiling shows it's needed.
 */
export function findEdgeAt(
  edges: GraphEdge[],
  nodes: GraphNode[],
  x: number,
  y: number,
  threshold: number
): GraphEdge | null {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  let best: { edge: GraphEdge; d: number } | null = null;
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const d = pointToSegmentDistance(x, y, a.x, a.y, b.x, b.y);
    if (d <= threshold && (!best || d < best.d)) best = { edge: e, d };
  }
  return best?.edge ?? null;
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm test -- hitTest
```

Expected: all hitTest tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(graph): add hit-test helpers (quadtree + segment distance)"
```

---

## Task 5: Favicon cache

**Files:**
- Create: `src/designs/Graph/faviconCache.ts`

- [ ] **Step 1: Implement the cache**

Create `src/designs/Graph/faviconCache.ts`:

```ts
import { faviconUrl } from '../../services/chromeApi';

type Entry = HTMLImageElement | 'loading' | 'error';

/**
 * Lazily preloads site favicons (https://{domain}/favicon.ico) and caches them.
 * `ensureLoaded` triggers a background fetch and calls `onReady` the moment
 * a previously missing image becomes available — use this to request a redraw.
 * `get` returns a ready image or null (the caller should draw a letter fallback).
 */
export class FaviconCache {
  private cache = new Map<string, Entry>();

  get(pageUrl: string): HTMLImageElement | null {
    const key = faviconUrl(pageUrl);
    if (!key) return null;
    const entry = this.cache.get(key);
    return entry instanceof HTMLImageElement ? entry : null;
  }

  ensureLoaded(pageUrl: string, onReady: () => void): void {
    const key = faviconUrl(pageUrl);
    if (!key) return;
    if (this.cache.has(key)) return;
    this.cache.set(key, 'loading');
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (img.naturalWidth >= 8) {
        this.cache.set(key, img);
        onReady();
      } else {
        this.cache.set(key, 'error');
      }
    };
    img.onerror = () => {
      this.cache.set(key, 'error');
    };
    img.src = key;
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: no errors in `faviconCache.ts`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(graph): add favicon cache for Canvas rendering"
```

---

## Task 6: Canvas rendering (pure draw functions)

**Files:**
- Create: `src/designs/Graph/render.ts`

- [ ] **Step 1: Implement pure draw functions**

Create `src/designs/Graph/render.ts`:

```ts
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
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: no errors in `render.ts`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(graph): add Canvas 2D render.ts with nodes, edges, labels, ghost"
```

---

## Task 7: Camera (zoom + pan state)

**Files:**
- Create: `src/designs/Graph/useCamera.ts`
- Create: `src/designs/Graph/useCamera.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/designs/Graph/useCamera.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test — expect fail**

```bash
npm test -- useCamera
```

Expected: module-not-found.

- [ ] **Step 3: Implement the camera module**

Create `src/designs/Graph/useCamera.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import type { Camera } from '../../types';

const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

export function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

export function viewToWorld(
  cam: Camera,
  vx: number,
  vy: number,
  size: { width: number; height: number }
): [number, number] {
  const x = (vx - size.width / 2 - cam.tx) / cam.scale;
  const y = (vy - size.height / 2 - cam.ty) / cam.scale;
  return [x, y];
}

export function worldToView(
  cam: Camera,
  wx: number,
  wy: number,
  size: { width: number; height: number }
): [number, number] {
  return [wx * cam.scale + size.width / 2 + cam.tx, wy * cam.scale + size.height / 2 + cam.ty];
}

/** Zoom keeping (anchorVx, anchorVy) fixed in world space. */
export function zoomAt(
  cam: Camera,
  nextScale: number,
  anchorVx: number,
  anchorVy: number,
  size: { width: number; height: number }
): Camera {
  const s = clampScale(nextScale);
  const [wx, wy] = viewToWorld(cam, anchorVx, anchorVy, size);
  const tx = anchorVx - size.width / 2 - wx * s;
  const ty = anchorVy - size.height / 2 - wy * s;
  return { scale: s, tx, ty };
}

export interface UseCamera {
  cameraRef: React.MutableRefObject<Camera>;
  subscribe: (cb: () => void) => () => void;
  wheelZoom: (vx: number, vy: number, delta: number, size: { width: number; height: number }) => void;
  panBy: (dx: number, dy: number) => void;
  reset: () => void;
  /** Force a React re-render (e.g., when the HUD should update). Rarely needed. */
  force: () => void;
}

/**
 * Camera state lives in a ref so pointer / wheel events can mutate it at 60fps
 * without triggering React renders. Consumers subscribe to be notified that a
 * redraw is needed.
 */
export function useCamera(initial: Camera = { scale: 1, tx: 0, ty: 0 }): UseCamera {
  const cameraRef = useRef<Camera>(initial);
  const listenersRef = useRef<Set<() => void>>(new Set());
  const [, rerender] = useState(0);

  const emit = useCallback(() => {
    for (const l of listenersRef.current) l();
  }, []);

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  const wheelZoom = useCallback(
    (vx: number, vy: number, delta: number, size: { width: number; height: number }) => {
      const factor = delta < 0 ? 1.12 : 1 / 1.12;
      cameraRef.current = zoomAt(cameraRef.current, cameraRef.current.scale * factor, vx, vy, size);
      emit();
    },
    [emit]
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const c = cameraRef.current;
      cameraRef.current = { ...c, tx: c.tx + dx, ty: c.ty + dy };
      emit();
    },
    [emit]
  );

  const reset = useCallback(() => {
    cameraRef.current = { scale: 1, tx: 0, ty: 0 };
    emit();
  }, [emit]);

  const force = useCallback(() => rerender((n) => n + 1), []);

  return { cameraRef, subscribe, wheelZoom, panBy, reset, force };
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm test -- useCamera
```

Expected: all camera tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(graph): add camera (zoom + pan) with viewport ↔ world transforms"
```

---

## Task 8: Force simulation (`useGraphSim`)

**Files:**
- Create: `src/designs/Graph/useGraphSim.ts`

- [ ] **Step 1: Implement the simulation hook**

Create `src/designs/Graph/useGraphSim.ts`:

```ts
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';
import { useEffect, useRef } from 'react';
import type { Bookmark, GraphEdge, GraphNode, Group, PinsMap } from '../../types';
import { folderCentroid, folderHue } from './folderHue';

interface Params {
  bookmarks: Bookmark[];
  groups: Group[];
  edges: GraphEdge[];
  pins: PinsMap;
}

export interface GraphSim {
  nodesRef: React.MutableRefObject<GraphNode[]>;
  simulationRef: React.MutableRefObject<Simulation<GraphNode, LinkDatum> | null>;
  /** Start a drag on a node: set fx/fy and wake the simulation. */
  startDrag: (id: string, wx: number, wy: number) => void;
  dragTo: (wx: number, wy: number) => void;
  endDrag: (pinInsteadOfRelease: boolean) => { id: string; x: number; y: number } | null;
  /** Kick the physics (alpha) after a topology change. */
  reheat: (alpha?: number) => void;
  /** Return node by id (O(N); OK for 500). */
  findById: (id: string) => GraphNode | null;
}

interface LinkDatum {
  source: GraphNode | string;
  target: GraphNode | string;
}

function radiusFor(visits: number): number {
  return 11 + Math.min(13, Math.sqrt(Math.max(0, visits)) * 0.9);
}

/**
 * Build / rebuild the d3-force simulation whenever the underlying inputs change.
 * Node identity is preserved across rebuilds so that positions survive.
 */
export function useGraphSim({ bookmarks, groups, edges, pins }: Params): GraphSim {
  const nodesRef = useRef<GraphNode[]>([]);
  const simulationRef = useRef<Simulation<GraphNode, LinkDatum> | null>(null);
  const draggingRef = useRef<string | null>(null);

  useEffect(() => {
    // Preserve positions of existing nodes when rebuilding.
    const prev = new Map(nodesRef.current.map((n) => [n.id, n] as const));
    const groupIndex = new Map(groups.map((g, i) => [g.id, i] as const));
    const total = Math.max(1, groups.length);
    const radius = 260;

    const nodes: GraphNode[] = bookmarks.map((b) => {
      const prior = prev.get(b.id);
      const pin = pins[b.id];
      const idx = groupIndex.get(b.parentId) ?? 0;
      const centroid = folderCentroid(idx, total, radius);
      return {
        ...b,
        x: pin?.x ?? prior?.x ?? centroid.x + (Math.random() - 0.5) * 20,
        y: pin?.y ?? prior?.y ?? centroid.y + (Math.random() - 0.5) * 20,
        vx: prior?.vx ?? 0,
        vy: prior?.vy ?? 0,
        fx: pin?.x ?? null,
        fy: pin?.y ?? null,
        radius: radiusFor(b.visits),
        groupHue: folderHue(b.parentId),
      };
    });

    const links: LinkDatum[] = edges
      .filter((e) => nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to))
      .map((e) => ({ source: e.from, target: e.to }));

    const sim = forceSimulation<GraphNode, LinkDatum>(nodes)
      .force('charge', forceManyBody<GraphNode>().strength(-180).distanceMax(400))
      .force('collide', forceCollide<GraphNode>((n) => n.radius + 3).iterations(2))
      .force(
        'link',
        forceLink<GraphNode, LinkDatum>(links)
          .id((n) => n.id)
          .distance(120)
          .strength(0.3)
      )
      .force(
        'groupX',
        forceX<GraphNode>((n) => {
          const i = groupIndex.get(n.parentId) ?? 0;
          return folderCentroid(i, total, radius).x;
        }).strength(groups.length > 12 ? 0.02 : 0.04)
      )
      .force(
        'groupY',
        forceY<GraphNode>((n) => {
          const i = groupIndex.get(n.parentId) ?? 0;
          return folderCentroid(i, total, radius).y;
        }).strength(groups.length > 12 ? 0.02 : 0.04)
      )
      .force('center', forceCenter<GraphNode>(0, 0))
      .alphaDecay(0.02);

    sim.stop(); // GraphCanvas will drive ticks through rAF.

    nodesRef.current = nodes;
    simulationRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [bookmarks, groups, edges, pins]);

  const reheat = (alpha = 0.4) => {
    const sim = simulationRef.current;
    if (sim) sim.alpha(alpha);
  };

  const startDrag = (id: string, wx: number, wy: number) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    draggingRef.current = id;
    node.fx = wx;
    node.fy = wy;
    reheat(0.3);
  };

  const dragTo = (wx: number, wy: number) => {
    const id = draggingRef.current;
    if (!id) return;
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    node.fx = wx;
    node.fy = wy;
  };

  const endDrag = (pinInsteadOfRelease: boolean) => {
    const id = draggingRef.current;
    if (!id) return null;
    draggingRef.current = null;
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return null;
    const pos = { id, x: node.fx ?? node.x, y: node.fy ?? node.y };
    if (!pinInsteadOfRelease) {
      node.fx = null;
      node.fy = null;
    }
    reheat(0.15);
    return pos;
  };

  const findById = (id: string) => nodesRef.current.find((n) => n.id === id) ?? null;

  return { nodesRef, simulationRef, startDrag, dragTo, endDrag, reheat, findById };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(graph): add d3-force simulation hook with drag + pin support"
```

---

## Task 9: `GraphCanvas` component — rAF loop + pointer events

**Files:**
- Create: `src/designs/Graph/GraphCanvas.tsx`

- [ ] **Step 1: Implement GraphCanvas**

Create `src/designs/Graph/GraphCanvas.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import type { Bookmark, GraphEdge, Group, PinsMap } from '../../types';
import { FaviconCache } from './faviconCache';
import { buildNodeIndex, findEdgeAt, findNodeAt } from './hitTest';
import { drawGraph, resizeCanvas, type RenderState, type Theme } from './render';
import { useCamera, viewToWorld } from './useCamera';
import { useGraphSim } from './useGraphSim';

export interface GraphCanvasHandle {
  focusFilter: () => void;
}

interface Props {
  bookmarks: Bookmark[];
  groups: Group[];
  edges: GraphEdge[];
  pins: PinsMap;
  filterText: string;
  onRequestEdge: (fromId: string, toId: string) => void;
  onOpenBookmark: (id: string) => void;
  onBookmarkMenu: (x: number, y: number, id: string, worldPos: { x: number; y: number }) => void;
  onEdgeMenu: (x: number, y: number, id: string) => void;
  onCanvasMenu: (x: number, y: number) => void;
}

export function GraphCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sim = useGraphSim({
    bookmarks: props.bookmarks,
    groups: props.groups,
    edges: props.edges,
    pins: props.pins,
  });
  const camera = useCamera();
  const faviconsRef = useRef(new FaviconCache());

  // Interaction state — kept in refs to avoid re-renders.
  const hoverNodeRef = useRef<string | null>(null);
  const hoverEdgeRef = useRef<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const ghostRef = useRef<RenderState['ghost']>(null);
  const panRef = useRef<{ startX: number; startY: number; tx0: number; ty0: number } | null>(null);
  const needsFrameRef = useRef(true);
  const lastSizeRef = useRef({ width: 0, height: 0, dpr: 1 });

  // Preload favicons whenever bookmarks change.
  useEffect(() => {
    for (const b of props.bookmarks) {
      faviconsRef.current.ensureLoaded(b.url, () => {
        needsFrameRef.current = true;
      });
    }
  }, [props.bookmarks]);

  // Subscribe to camera changes so we redraw when the user zooms/pans.
  useEffect(() => {
    return camera.subscribe(() => {
      needsFrameRef.current = true;
    });
  }, [camera]);

  // Resize observer.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      const dpr = resizeCanvas(canvas, rect.width, rect.height);
      lastSizeRef.current = { width: rect.width, height: rect.height, dpr };
      needsFrameRef.current = true;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // rAF loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const theme: Theme = {
      fg: getComputedStyle(document.body).getPropertyValue('--fg') || '#fff',
      fgMuted: getComputedStyle(document.body).getPropertyValue('--fg-3') || '#888',
      bg: getComputedStyle(document.body).getPropertyValue('--bg') || '#111',
      line: getComputedStyle(document.body).getPropertyValue('--line') || '#333',
    };

    let raf = 0;
    let running = true;

    const loop = () => {
      if (!running) return;
      const simulation = sim.simulationRef.current;
      const alpha = simulation?.alpha() ?? 0;
      const active =
        alpha > 0.003 ||
        needsFrameRef.current ||
        dragIdRef.current !== null ||
        panRef.current !== null ||
        ghostRef.current !== null;

      if (active) {
        if (simulation && alpha > 0.003) simulation.tick();

        const filterMatches = deriveFilter(props.bookmarks, props.filterText);
        const state: RenderState = {
          nodes: sim.nodesRef.current,
          edges: props.edges,
          pins: props.pins,
          hoverNodeId: hoverNodeRef.current,
          hoverEdgeId: hoverEdgeRef.current,
          draggingId: dragIdRef.current,
          filterMatches,
          ghost: ghostRef.current,
          favicons: faviconsRef.current,
        };
        drawGraph(ctx, state, camera.cameraRef.current, theme, lastSizeRef.current);
        needsFrameRef.current = false;
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        needsFrameRef.current = true;
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [sim, props.bookmarks, props.edges, props.pins, props.filterText, camera]);

  // Pointer events.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toWorld = (ev: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return viewToWorld(
        camera.cameraRef.current,
        ev.clientX - rect.left,
        ev.clientY - rect.top,
        { width: rect.width, height: rect.height }
      );
    };

    const nodeAt = (wx: number, wy: number) =>
      findNodeAt(buildNodeIndex(sim.nodesRef.current), wx, wy);
    const edgeAt = (wx: number, wy: number) =>
      findEdgeAt(props.edges, sim.nodesRef.current, wx, wy, 6 / camera.cameraRef.current.scale);

    let ghostFromId: string | null = null;

    const onDown = (ev: PointerEvent) => {
      if (ev.button === 2) return; // right-click handled on contextmenu
      const [wx, wy] = toWorld(ev);
      const node = nodeAt(wx, wy);
      if (node && ev.shiftKey) {
        ghostFromId = node.id;
        ghostRef.current = { fromX: node.x, fromY: node.y, toX: wx, toY: wy };
        needsFrameRef.current = true;
      } else if (node) {
        dragIdRef.current = node.id;
        sim.startDrag(node.id, wx, wy);
        canvas.setPointerCapture(ev.pointerId);
      } else {
        panRef.current = {
          startX: ev.clientX,
          startY: ev.clientY,
          tx0: camera.cameraRef.current.tx,
          ty0: camera.cameraRef.current.ty,
        };
      }
    };

    const onMove = (ev: PointerEvent) => {
      const [wx, wy] = toWorld(ev);
      if (dragIdRef.current) {
        sim.dragTo(wx, wy);
        needsFrameRef.current = true;
        return;
      }
      if (ghostFromId) {
        const from = sim.findById(ghostFromId);
        if (from) ghostRef.current = { fromX: from.x, fromY: from.y, toX: wx, toY: wy };
        needsFrameRef.current = true;
        return;
      }
      if (panRef.current) {
        const dx = ev.clientX - panRef.current.startX;
        const dy = ev.clientY - panRef.current.startY;
        camera.cameraRef.current = {
          ...camera.cameraRef.current,
          tx: panRef.current.tx0 + dx,
          ty: panRef.current.ty0 + dy,
        };
        needsFrameRef.current = true;
        return;
      }
      // Hover detection.
      const node = nodeAt(wx, wy);
      const edge = node ? null : edgeAt(wx, wy);
      if (node?.id !== hoverNodeRef.current || edge?.id !== hoverEdgeRef.current) {
        hoverNodeRef.current = node?.id ?? null;
        hoverEdgeRef.current = edge?.id ?? null;
        needsFrameRef.current = true;
      }
    };

    const onUp = (ev: PointerEvent) => {
      const [wx, wy] = toWorld(ev);
      if (ghostFromId) {
        const target = nodeAt(wx, wy);
        if (target && target.id !== ghostFromId) {
          props.onRequestEdge(ghostFromId, target.id);
        }
        ghostFromId = null;
        ghostRef.current = null;
        needsFrameRef.current = true;
        return;
      }
      if (dragIdRef.current) {
        const pos = sim.endDrag(false);
        const moved = pos && (Math.abs((pos.x - wx)) > 2 || Math.abs((pos.y - wy)) > 2);
        if (!moved && pos) {
          props.onOpenBookmark(pos.id);
        }
        dragIdRef.current = null;
        try {
          canvas.releasePointerCapture(ev.pointerId);
        } catch {
          /* already released */
        }
        needsFrameRef.current = true;
        return;
      }
      panRef.current = null;
    };

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      camera.wheelZoom(ev.clientX - rect.left, ev.clientY - rect.top, ev.deltaY, {
        width: rect.width,
        height: rect.height,
      });
    };

    const onDblClick = () => {
      camera.reset();
      sim.reheat(0.3);
    };

    const onCtx = (ev: MouseEvent) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const [wx, wy] = viewToWorld(
        camera.cameraRef.current,
        ev.clientX - rect.left,
        ev.clientY - rect.top,
        { width: rect.width, height: rect.height }
      );
      const node = nodeAt(wx, wy);
      if (node) return props.onBookmarkMenu(ev.clientX, ev.clientY, node.id, { x: node.x, y: node.y });
      const edge = edgeAt(wx, wy);
      if (edge) return props.onEdgeMenu(ev.clientX, ev.clientY, edge.id);
      props.onCanvasMenu(ev.clientX, ev.clientY);
    };

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('contextmenu', onCtx);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('contextmenu', onCtx);
    };
  }, [sim, camera, props]);

  return (
    <div ref={wrapRef} style={wrapStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
    </div>
  );
}

function deriveFilter(bookmarks: Bookmark[], text: string): Set<string> | null {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  const matches = new Set<string>();
  for (const b of bookmarks) {
    if ((b.name + ' ' + b.url + ' ' + b.group).toLowerCase().includes(q)) {
      matches.add(b.id);
    }
  }
  return matches;
}

const wrapStyle: CSSProperties = {
  position: 'relative',
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
};

const canvasStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  cursor: 'grab',
};
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(graph): add GraphCanvas with rAF loop, hit-test, and pointer handlers"
```

---

## Task 10: `Graph` React shell

**Files:**
- Create: `src/designs/Graph/Graph.tsx`

- [ ] **Step 1: Implement the shell**

Create `src/designs/Graph/Graph.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bookmark, ChromeData, GraphEdge, Group, PinsMap } from '../../types';
import { BookmarkDialog } from '../../components/BookmarkDialog';
import { ContextMenu, type MenuItem } from '../../components/ContextMenu';
import { Modal } from '../../components/Modal';
import { TodoPanel } from '../../components/TodoPanel';
import {
  createBookmark,
  createFolder,
  moveBookmark,
  openUrl,
  removeBookmark,
  subscribeBookmarkChanges,
  updateBookmark,
} from '../../services/chromeApi';
import { useTodos } from '../../hooks/useTodos';
import { copy } from '../../i18n';
import { GraphCanvas } from './GraphCanvas';
import {
  addEdge as addEdgeFn,
  cleanOrphans as cleanOrphanEdges,
  loadEdges,
  removeEdge as removeEdgeFn,
  saveEdges,
} from './edges';
import {
  cleanOrphanPins,
  loadPins,
  savePins,
  setPin,
  unsetPin,
} from './pins';

interface Props {
  data: ChromeData;
}

export function Graph({ data }: Props) {
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [pins, setPins] = useState<PinsMap>({});
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [todosOpen, setTodosOpen] = useState(false);
  const [bmMenu, setBmMenu] = useState<{
    x: number;
    y: number;
    id: string;
    worldPos: { x: number; y: number };
  } | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number } | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const { todos, toggle, add, remove } = useTodos();

  // Load persisted edges + pins; auto-refresh when bookmarks tree changes.
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadEdges(), loadPins()]).then(([e, p]) => {
      if (!cancelled) {
        setEdges(e);
        setPins(p);
      }
    });
    const unsub = subscribeBookmarkChanges(() => {
      Promise.all([loadEdges(), loadPins()]).then(([e, p]) => {
        if (!cancelled) {
          setEdges(e);
          setPins(p);
        }
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Clean orphans whenever bookmarks change.
  useEffect(() => {
    const validIds = new Set(data.bookmarks.map((b) => b.id));
    const cleanedEdges = cleanOrphanEdges(edges, validIds);
    const cleanedPins = cleanOrphanPins(pins, validIds);
    if (cleanedEdges.length !== edges.length) {
      setEdges(cleanedEdges);
      void saveEdges(cleanedEdges);
    }
    if (Object.keys(cleanedPins).length !== Object.keys(pins).length) {
      setPins(cleanedPins);
      void savePins(cleanedPins);
    }
    // Intentionally omit edges/pins from deps — we only clean on bookmark change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.bookmarks]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key === '/' && !typing) {
        e.preventDefault();
        filterRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (bmMenu) setBmMenu(null);
        else if (edgeMenu) setEdgeMenu(null);
        else if (canvasMenu) setCanvasMenu(null);
        else if (todosOpen) setTodosOpen(false);
        else if (typing) {
          (document.activeElement as HTMLElement).blur();
          setFilter('');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bmMenu, edgeMenu, canvasMenu, todosOpen]);

  const onRequestEdge = (fromId: string, toId: string) => {
    const next = addEdgeFn(edges, fromId, toId);
    if (next !== edges) {
      setEdges(next);
      void saveEdges(next);
    }
  };

  const onPinToggle = (id: string, worldX: number, worldY: number) => {
    const node = data.bookmarks.find((b) => b.id === id);
    if (!node) return;
    if (pins[id]) {
      const next = unsetPin(pins, id);
      setPins(next);
      void savePins(next);
    } else {
      const next = setPin(pins, id, worldX, worldY);
      setPins(next);
      void savePins(next);
    }
  };

  const buildBookmarkMenu = (id: string, worldPos: { x: number; y: number }): MenuItem[] => {
    const bm = data.bookmarks.find((b) => b.id === id);
    if (!bm) return [];
    const isPinned = !!pins[id];
    return [
      { label: '在新标签页打开', onClick: () => openUrl(bm.url) },
      { label: copy.workspace.editBookmarkTitle + '…', onClick: () => setEditing(bm) },
      { label: isPinned ? '取消固定' : '固定位置', onClick: () => onPinToggle(id, worldPos.x, worldPos.y) },
      {
        label: copy.workspace.deleteBookmark,
        danger: true,
        onClick: () => void removeBookmark(id),
      },
    ];
  };

  const buildEdgeMenu = (id: string): MenuItem[] => {
    return [
      {
        label: '删除连接',
        danger: true,
        onClick: () => {
          const next = removeEdgeFn(edges, id);
          setEdges(next);
          void saveEdges(next);
        },
      },
    ];
  };

  const buildCanvasMenu = (): MenuItem[] => {
    return [
      { label: '+ ' + copy.workspace.addBookmark, onClick: () => setAdding(true) },
      {
        label: '+ ' + copy.workspace.newFolder,
        disabled: !data.barId,
        onClick: () => setCreatingFolder(true),
      },
    ];
  };

  const submitFolder = async () => {
    const name = folderName.trim();
    if (!name || !data.barId) return;
    await createFolder(data.barId, name);
    setFolderName('');
    setCreatingFolder(false);
  };

  const openCount = todos.filter((t) => !t.done).length;

  return (
    <div style={styles.root}>
      <div style={styles.topBar}>
        <div style={styles.filter}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={filterRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={copy.constellation.filterPlaceholder}
            style={styles.filterInput}
          />
          <span className="kbd">/</span>
        </div>
        <div style={styles.actions}>
          <button onClick={() => setAdding(true)} style={styles.actionBtn}>
            ＋ {copy.workspace.addBookmark}
          </button>
          <button
            onClick={() => setCreatingFolder(true)}
            disabled={!data.barId}
            style={{ ...styles.actionBtn, opacity: data.barId ? 1 : 0.5 }}
          >
            ＋ {copy.workspace.newFolder}
          </button>
          <button
            onClick={() => setTodosOpen((v) => !v)}
            style={{
              ...styles.actionBtn,
              ...(todosOpen ? { background: 'var(--accent-soft)', color: 'var(--fg)' } : {}),
            }}
          >
            {copy.workspace.todayLabel}
            {openCount > 0 && <span style={styles.badge}>{openCount}</span>}
          </button>
        </div>
      </div>

      <GraphCanvas
        bookmarks={data.bookmarks}
        groups={data.groups as Group[]}
        edges={edges}
        pins={pins}
        filterText={filter}
        onRequestEdge={onRequestEdge}
        onOpenBookmark={(id) => {
          const bm = data.bookmarks.find((b) => b.id === id);
          if (bm) openUrl(bm.url);
        }}
        onBookmarkMenu={(x, y, id, worldPos) => setBmMenu({ x, y, id, worldPos })}
        onEdgeMenu={(x, y, id) => setEdgeMenu({ x, y, id })}
        onCanvasMenu={(x, y) => setCanvasMenu({ x, y })}
      />

      <div style={styles.bottomStrip}>
        <div style={styles.stripSection}>
          <div className="mono" style={styles.stripLabel}>
            {copy.constellation.stripTop}
          </div>
          <div style={styles.stripRow}>
            {[...data.bookmarks]
              .sort((a, b) => b.visits - a.visits)
              .slice(0, 5)
              .map((b) => (
                <button
                  key={b.id}
                  style={styles.stripChip}
                  onClick={() => openUrl(b.url)}
                >
                  <span
                    className="favicon"
                    style={{ background: b.color, width: 20, height: 20, fontSize: 9 }}
                  >
                    {b.letter}
                  </span>
                  <span style={{ fontSize: 12 }}>{b.name}</span>
                </button>
              ))}
          </div>
        </div>
        <div style={styles.stripDiv} />
        <div style={styles.stripSection}>
          <div className="mono" style={styles.stripLabel}>
            {copy.constellation.stripRecent}
          </div>
          <div style={styles.stripRow}>
            {data.recents.slice(0, 4).map((r, i) => (
              <button
                key={i}
                style={styles.stripChip}
                onClick={() => openUrl(r.url)}
              >
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>
                  {r.at}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    maxWidth: 180,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {r.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {bmMenu && (
        <ContextMenu
          x={bmMenu.x}
          y={bmMenu.y}
          items={buildBookmarkMenu(bmMenu.id, bmMenu.worldPos)}
          onClose={() => setBmMenu(null)}
        />
      )}
      {edgeMenu && (
        <ContextMenu
          x={edgeMenu.x}
          y={edgeMenu.y}
          items={buildEdgeMenu(edgeMenu.id)}
          onClose={() => setEdgeMenu(null)}
        />
      )}
      {canvasMenu && (
        <ContextMenu
          x={canvasMenu.x}
          y={canvasMenu.y}
          items={buildCanvasMenu()}
          onClose={() => setCanvasMenu(null)}
        />
      )}

      <BookmarkDialog
        open={adding}
        mode="create"
        groups={data.groups}
        defaultGroupId={data.groups[0]?.id}
        onCancel={() => setAdding(false)}
        onSubmit={async ({ name, url, groupId }) => {
          setAdding(false);
          await createBookmark(groupId, name, url);
        }}
      />

      <BookmarkDialog
        open={!!editing}
        mode="edit"
        initial={
          editing ? { name: editing.name, url: editing.url, groupId: editing.parentId } : undefined
        }
        groups={data.groups}
        onCancel={() => setEditing(null)}
        onSubmit={async ({ name, url, groupId }) => {
          if (!editing) return;
          const id = editing.id;
          setEditing(null);
          await updateBookmark(id, { title: name, url });
          if (groupId !== editing.parentId) {
            await moveBookmark(id, { parentId: groupId });
          }
        }}
      />

      <Modal
        open={creatingFolder}
        onClose={() => {
          setCreatingFolder(false);
          setFolderName('');
        }}
        title={copy.workspace.newFolder}
        width={360}
      >
        <input
          autoFocus
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitFolder();
          }}
          placeholder={copy.workspace.newFolderPlaceholder}
          style={styles.folderInput}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              setCreatingFolder(false);
              setFolderName('');
            }}
            style={styles.btnGhost}
          >
            {copy.workspace.cancel}
          </button>
          <button
            onClick={() => void submitFolder()}
            disabled={!folderName.trim()}
            style={folderName.trim() ? styles.btnPrimary : styles.btnDisabled}
          >
            {copy.workspace.ok}
          </button>
        </div>
      </Modal>

      {todosOpen && (
        <div style={styles.todosPanel}>
          <div style={styles.todosHead}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{copy.workspace.todayLabel}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
              {copy.workspace.todayOpen(openCount)}
            </span>
            <button onClick={() => setTodosOpen(false)} style={styles.todosClose} aria-label="关闭">
              ×
            </button>
          </div>
          <TodoPanel todos={todos} onToggle={toggle} onAdd={add} onRemove={remove} />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    padding: '14px 20px 14px',
    gap: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
    maxWidth: 960,
    width: '100%',
    margin: '0 auto',
  },
  filter: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    flex: 1,
    minWidth: 0,
    boxShadow: 'var(--shadow-sm)',
  },
  filterInput: {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 0,
    outline: 'none',
    fontSize: 14,
    color: 'var(--fg)',
  },
  actions: { display: 'flex', gap: 6, flexShrink: 0 },
  actionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    color: 'var(--fg-2)',
    fontSize: 12.5,
    boxShadow: 'var(--shadow-sm)',
    cursor: 'pointer',
  },
  badge: {
    padding: '1px 6px',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    borderRadius: 999,
    lineHeight: 1.4,
  },
  bottomStrip: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 14,
    padding: '8px 12px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-soft)',
    borderRadius: 10,
    flexShrink: 0,
  },
  stripSection: { display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  stripLabel: { fontSize: 10, letterSpacing: '0.15em', color: 'var(--fg-3)' },
  stripRow: { display: 'flex', gap: 6, overflow: 'hidden', flex: 1 },
  stripChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid var(--line-soft)',
    background: 'var(--bg-2)',
    color: 'var(--fg-1)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  stripDiv: { width: 1, background: 'var(--line-soft)' },
  folderInput: {
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '8px 10px',
    color: 'var(--fg)',
    outline: 'none',
    fontSize: 13,
    width: '100%',
  },
  btnGhost: {
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    color: 'var(--fg-2)',
    border: '1px solid var(--line)',
  },
  btnPrimary: {
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    color: 'var(--accent-ink)',
    background: 'var(--accent)',
    fontWeight: 500,
  },
  btnDisabled: {
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    color: 'var(--fg-3)',
    background: 'var(--bg-2)',
    cursor: 'not-allowed',
  },
  todosPanel: {
    position: 'fixed',
    top: 80,
    right: 20,
    width: 320,
    maxHeight: '70vh',
    overflowY: 'auto',
    zIndex: 120,
    padding: 14,
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-lg)',
  },
  todosHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  todosClose: {
    marginLeft: 'auto',
    width: 22,
    height: 22,
    borderRadius: 5,
    color: 'var(--fg-3)',
    fontSize: 16,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(graph): add Graph React shell (toolbar, bottom strip, dialogs)"
```

---

## Task 11: Replace Constellation in App + remove old view

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/designs/Constellation.tsx`
- Modify: `src/styles/shell.css` (remove dead selectors for removed views)
- Modify: `src/i18n.ts` (update legend wording)

- [ ] **Step 1: Update App.tsx**

Open `src/App.tsx` and replace the Constellation import/usage:

Change line that imports `Constellation`:

```tsx
import { Constellation } from './designs/Constellation';
```

to

```tsx
import { Graph } from './designs/Graph/Graph';
```

And change the JSX:

```tsx
<Constellation data={data} />
```

to

```tsx
<Graph data={data} />
```

- [ ] **Step 2: Delete the old Constellation file**

```bash
rm src/designs/Constellation.tsx
```

- [ ] **Step 3: Update i18n legend wording**

Modify `src/i18n.ts` — update the `constellation` section's legend-related copy:

```ts
constellation: {
  filterPlaceholder: '过滤图…',
  matchCount: (n: number) => `${n} 项匹配`,
  siteCount: (n: number) => `${n} 个站点`,
  sizeLegend: '节点颜色 = 所属分组',
  distanceLegend: '连线 = 手动关联（Shift+拖拽创建）',
  summary: (sites: number, clusters: number) => `${sites} 个站点 · ${clusters} 个分组`,
  today: '今天',
  stripTop: '常用',
  stripRecent: '最近',
},
```

- [ ] **Step 4: Clean dead selectors in shell.css**

Modify `src/styles/shell.css` — remove the block:

```css
/* Hover helpers (for inline-style components) */
[data-qd-cell]:hover { background: var(--bg-1); }
[data-qd-recent]:hover { background: var(--bg-1); }
[data-bm-card]:hover { border-color: var(--line); background: var(--bg-2); }
[data-heat-item]:hover { background: var(--bg-3); }
[data-strip-chip]:hover { background: var(--bg-3); }
[data-pinned]:hover { background: var(--bg-3); }
[data-engine-btn]:hover { color: var(--fg); }
```

Replace with only the selectors the Graph view still needs:

```css
/* Hover helpers */
[data-strip-chip]:hover { background: var(--bg-3); }
```

- [ ] **Step 5: Build + type-check**

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(graph): replace Constellation with Graph view; clean dead CSS"
```

---

## Task 12: Smoke test, README, final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the dev server**

```bash
npm run dev
```

Open <http://localhost:5173>. Verify visually:
- Graph appears with fallback bookmark data (dev has no chrome APIs).
- Nodes coloured by folder; same-folder nodes cluster.
- Hover a node shows name + url.
- Click a node opens URL in new tab.
- Wheel scrolls to zoom (anchored on cursor).
- Drag empty space pans the camera.
- Double-click empty space resets camera.
- Shift-drag from node A to node B creates a line; refresh keeps the line (localStorage fallback).
- Right-click node opens menu (open/edit/pin/delete).

Kill the dev server with Ctrl-C.

- [ ] **Step 2: Build the production bundle**

```bash
npm run build
```

Expected: `dist/` produced. Note the gzipped JS size — should be ≤ ~68 KB gzip.

- [ ] **Step 3: Confirm CSP-clean output**

```bash
grep -c "eval\|new Function" dist/assets/*.js || echo "0 — clean"
```

Expected: `0 — clean`. Chrome MV3 will accept the bundle.

- [ ] **Step 4: Update README**

Replace `README.md` with:

```markdown
# 新标签页 · 图视图 (Graph)

Chrome 扩展（Manifest V3），替换新标签页，把书签渲染成一张 **Obsidian 风格的力导向图**：

- 节点 = 书签；颜色 = 所属文件夹（同分组自然聚类）
- 连线 = 你手动画的"关联" — Shift 拖一个节点到另一个节点即可创建
- 物理模拟、缩放平移、图钉固定，500 节点 60fps
- 底部保留「常用 5 + 最近 4」快速入口

## 功能

| 操作 | 入口 |
| ---- | ---- |
| 打开书签 | 点击节点（新标签页） |
| 添加书签 | 顶部 ＋ 添加，或右键空白 |
| 新建分组 | 顶部 ＋ 新建分组，或右键空白 |
| 编辑书签 | 右键节点 → 编辑 |
| 删除书签 | 右键节点 → 删除 |
| 固定 / 取消固定节点 | 右键节点 → 固定位置 / 取消固定 |
| 建立关联 | **Shift + 拖**节点到另一节点 |
| 删除关联 | 右键连线 → 删除连接 |
| 缩放 | 鼠标滚轮（以光标为中心） |
| 平移 | 拖空白区域 |
| 重置视角 | 双击空白 |
| 过滤 | 顶部输入框，或按 `/` 聚焦 |
| 任务 | 顶部「今天」按钮 |
| 外观 | 右下齿轮 |

## 数据来源

- `chrome.bookmarks` — 书签与分组（第一层文件夹）
- `chrome.history` — 近 30 天访问频次 → 节点大小
- `chrome.topSites` — 书签为空时兜底
- `chrome.storage.local` — 关联 / 图钉 / 设置 / 任务
- `https://{domain}/favicon.ico` — 站点图标（失败回落字母色块）

## 开发

```bash
npm install
npm run dev        # 使用 fallback mock 数据预览
npm test           # 跑 vitest 单元测试
npm run build      # 构建 dist/
```

## 安装到 Chrome

1. `npm run build`
2. 打开 `chrome://extensions`，启用开发者模式
3. 「加载已解压的扩展程序」→ 选择 `dist/`
4. 打开新标签页

## 权限

| 权限 | 用途 |
| ---- | ---- |
| `bookmarks` | 读写书签 |
| `history` | 聚合访问频次 |
| `topSites` | 书签为空时兜底 |
| `storage` | 关联、图钉、设置、任务持久化 |
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "docs: update README for Graph view"
```

- [ ] **Step 6: Summary**

Report to the user:
- Tests passed
- Dev smoke walkthrough passed
- Build size
- Any observed performance issue during the smoke walkthrough with N nodes

---

## Self-review checklist (internal)

**Spec coverage:**
- [x] Architecture (Graph/GraphCanvas/useGraphSim/useCamera/render) — Tasks 1, 6, 7, 8, 9, 10
- [x] Data model (GraphNode/GraphEdge/PinsMap/Camera) — Task 1
- [x] edges.ts persistence + CRUD — Task 2
- [x] pins.ts persistence + CRUD — Task 3
- [x] Hit test (node + edge + segment distance) — Task 4
- [x] Favicon cache — Task 5
- [x] Canvas draw (edges, nodes, labels, ghost, pin mark) — Task 6
- [x] Camera with wheel-zoom anchored and pan — Task 7
- [x] d3-force config (charge/collide/link/groupXY/center) — Task 8
- [x] rAF loop with idle pause + visibility handling — Task 9
- [x] Pointer handlers (click, drag, shift-drag, pan, wheel, ctx) — Task 9
- [x] React shell: toolbar, bottom strip, dialogs, menus, todos panel — Task 10
- [x] Esc / `/` shortcuts — Task 10
- [x] Auto-clean orphan edges/pins on bookmark delete — Task 10
- [x] Migration from Constellation — Task 11
- [x] README update — Task 12

**Type consistency:** `GraphNode`, `GraphEdge`, `PinsMap`, `Camera` used consistently; function names (`edgeId`, `addEdge`, `removeEdge`, `cleanOrphans`, `setPin`, `unsetPin`, `cleanOrphanPins`, `loadEdges/saveEdges`, `loadPins/savePins`, `buildNodeIndex`, `findNodeAt`, `findEdgeAt`, `pointToSegmentDistance`, `viewToWorld`, `worldToView`, `clampScale`, `zoomAt`, `useCamera`, `useGraphSim`, `drawGraph`, `resizeCanvas`, `applyCamera`, `folderHue`, `folderCentroid`) match across the tasks where they're defined and called.

**No placeholders:** every step has concrete code or exact commands.
