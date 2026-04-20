import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import type { Bookmark, GraphEdge, Group, PinsMap } from '../../types';
import { FaviconCache } from './faviconCache';
import { buildNodeIndex, findEdgeAt, findNodeAt } from './hitTest';
import { drawGraph, resizeCanvas, type RenderState, type Theme } from './render';
import { useCamera, viewToWorld } from './useCamera';
import { useGraphSim } from './useGraphSim';

interface Props {
  bookmarks: Bookmark[];
  groups: Group[];
  edges: GraphEdge[];
  pins: PinsMap;
  filterText: string;
  /** When set, camera dolly-zooms onto this node. When cleared, camera resets. */
  focusBookmarkId: string | null;
  /** When set, draw a soft hull around the group's nodes. */
  highlightGroupId: string | null;
  /** Optional user-picked hue per folder id; overrides the hash default. */
  hueOverrides?: Record<string, number>;
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
    ...(props.hueOverrides ? { hueOverrides: props.hueOverrides } : {}),
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

  // Force a redraw whenever render-relevant props change. Without this the
  // rAF loop would skip frames when the simulation has cooled (alpha ≈ 0),
  // causing e.g. filter changes to not paint until the next interaction.
  useEffect(() => {
    needsFrameRef.current = true;
  }, [
    props.filterText,
    props.edges,
    props.pins,
    props.bookmarks,
    props.highlightGroupId,
    props.hueOverrides,
  ]);

  // Dolly-zoom onto the focus node (triggered when the search narrows to a
  // single match), or drift camera back to identity when focus is cleared.
  // Nothing happens while multiple candidates remain.
  useEffect(() => {
    const id = props.focusBookmarkId;
    if (id) {
      const node = sim.findById(id);
      const size = lastSizeRef.current;
      if (!node || size.width === 0) return;
      // Warm the simulation so the node settles visibly while the camera zooms.
      camera.focusOnWorldPoint(node.x, node.y, 2.2, size, 520);
    } else {
      camera.focusReset(420);
    }
    // findById reads a live ref, which is fine. We intentionally depend only
    // on the id so a moving node doesn't retrigger focus mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusBookmarkId, camera]);

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
          highlightGroupId: props.highlightGroupId,
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
    // A pointer-down on a node stays "pending": we don't touch the physics
    // simulation until the cursor moves past the slop threshold. Pure clicks
    // (down+up with no movement) therefore never reheat the sim, so
    // unrelated nodes don't wobble every time the user opens a bookmark.
    let pendingDrag: { id: string; downX: number; downY: number; pointerId: number } | null =
      null;
    const CLICK_SLOP_PX = 4;

    const promoteToDrag = (wx: number, wy: number) => {
      if (!pendingDrag) return;
      dragIdRef.current = pendingDrag.id;
      sim.startDrag(pendingDrag.id, wx, wy);
      try {
        canvas.setPointerCapture(pendingDrag.pointerId);
      } catch {
        /* pointer already gone */
      }
      pendingDrag = null;
    };

    const onDown = (ev: PointerEvent) => {
      if (ev.button === 2) return; // right-click handled on contextmenu
      camera.cancelFocus(); // user is taking over
      const [wx, wy] = toWorld(ev);
      const node = nodeAt(wx, wy);
      if (node && ev.shiftKey) {
        ghostFromId = node.id;
        ghostRef.current = { fromX: node.x, fromY: node.y, toX: wx, toY: wy };
        needsFrameRef.current = true;
      } else if (node) {
        pendingDrag = {
          id: node.id,
          downX: ev.clientX,
          downY: ev.clientY,
          pointerId: ev.pointerId,
        };
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
      if (pendingDrag) {
        // Promote to a real drag only once the user moves past the slop.
        if (
          Math.abs(ev.clientX - pendingDrag.downX) > CLICK_SLOP_PX ||
          Math.abs(ev.clientY - pendingDrag.downY) > CLICK_SLOP_PX
        ) {
          promoteToDrag(wx, wy);
        }
      }
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
      if (pendingDrag) {
        // Pointer never crossed slop → this is a pure click. Open without
        // touching the physics simulation.
        props.onOpenBookmark(pendingDrag.id);
        pendingDrag = null;
        return;
      }
      if (dragIdRef.current) {
        sim.endDrag(false);
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
