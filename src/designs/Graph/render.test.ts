import { describe, expect, it, vi } from 'vitest';
import type { GraphNode } from '../../types';
import type { FaviconCache } from './faviconCache';
import { drawGraph, type RenderState, type Theme } from './render';

function createContext(drawImage: CanvasRenderingContext2D['drawImage']) {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    drawImage,
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    measureText: vi.fn((text: string) => ({ width: text.length * 6 }) as TextMetrics),
    setLineDash: vi.fn(),
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'center' as CanvasTextAlign,
    textBaseline: 'middle' as CanvasTextBaseline,
    lineJoin: 'round' as CanvasLineJoin,
    lineCap: 'round' as CanvasLineCap,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
  } as unknown as CanvasRenderingContext2D;
}

const node: GraphNode = {
  id: 'bookmark-1',
  parentId: 'folder-1',
  name: 'Example',
  url: 'https://example.com',
  group: 'Work',
  color: '#123456',
  letter: 'EX',
  visits: 0,
  last: '-',
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 20,
  groupHue: 120,
};

const theme: Theme = {
  fg: '#fff',
  fgMuted: '#888',
  bg: '#000',
  line: '#333',
};

function stateWithFavicons(favicons: FaviconCache): RenderState {
  return {
    nodes: [node],
    edges: [],
    pins: {},
    hoverNodeId: null,
    hoverEdgeId: null,
    draggingId: null,
    filterMatches: null,
    ghost: null,
    favicons,
    highlightGroupId: null,
    focusNeighborhood: null,
    focusKind: null,
  };
}

describe('drawGraph', () => {
  it('falls back instead of throwing when a cached favicon becomes broken', () => {
    const markBroken = vi.fn();
    const favicons = {
      get: vi.fn(
        () =>
          ({
            complete: true,
            naturalWidth: 16,
            naturalHeight: 16,
          }) as HTMLImageElement
      ),
      markBroken,
    } as unknown as FaviconCache;
    const drawImage = vi.fn(() => {
      throw new DOMException('broken image', 'InvalidStateError');
    }) as unknown as CanvasRenderingContext2D['drawImage'];
    const ctx = createContext(drawImage);

    expect(() =>
      drawGraph(
        ctx,
        stateWithFavicons(favicons),
        { scale: 1, tx: 0, ty: 0 },
        theme,
        { width: 100, height: 100, dpr: 1 }
      )
    ).not.toThrow();
    expect(markBroken).toHaveBeenCalledWith('https://example.com');
  });
});
