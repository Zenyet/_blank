import { useCallback, useEffect, useRef, useState } from 'react';
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
  /**
   * Animate the camera so (wx, wy) lands at the viewport center at the given
   * scale — a "Hitchcock-style" dolly zoom. Cancels any in-flight animation.
   */
  focusOnWorldPoint: (
    wx: number,
    wy: number,
    targetScale: number,
    size: { width: number; height: number },
    durationMs?: number
  ) => void;
  /** Animate back to scale=1, tx=ty=0. */
  focusReset: (durationMs?: number) => void;
  /** Stop any in-flight focus animation without changing the camera. */
  cancelFocus: () => void;
  /** Force a React re-render (e.g., when the HUD should update). Rarely needed. */
  force: () => void;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Camera state lives in a ref so pointer / wheel events can mutate it at 60fps
 * without triggering React renders. Consumers subscribe to be notified that a
 * redraw is needed.
 */
export function useCamera(initial: Camera = { scale: 1, tx: 0, ty: 0 }): UseCamera {
  const cameraRef = useRef<Camera>(initial);
  const listenersRef = useRef<Set<() => void>>(new Set());
  const animRafRef = useRef<number | null>(null);
  const [, rerender] = useState(0);

  const emit = useCallback(() => {
    for (const l of listenersRef.current) l();
  }, []);

  const cancelAnim = useCallback(() => {
    if (animRafRef.current != null) {
      cancelAnimationFrame(animRafRef.current);
      animRafRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelAnim(), [cancelAnim]);

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  const wheelZoom = useCallback(
    (vx: number, vy: number, delta: number, size: { width: number; height: number }) => {
      cancelAnim(); // user took over — drop any in-flight focus animation
      // Delta-aware, Obsidian-style gentle zoom. Small trackpad deltas yield
      // tiny changes; each event is clamped so bursty wheel/trackpad streams
      // can never zoom more than ~6% per tick.
      const raw = Math.exp(-delta * 0.0015);
      const factor = Math.max(0.94, Math.min(1.06, raw));
      cameraRef.current = zoomAt(cameraRef.current, cameraRef.current.scale * factor, vx, vy, size);
      emit();
    },
    [emit, cancelAnim]
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      cancelAnim();
      const c = cameraRef.current;
      cameraRef.current = { ...c, tx: c.tx + dx, ty: c.ty + dy };
      emit();
    },
    [emit, cancelAnim]
  );

  const reset = useCallback(() => {
    cancelAnim();
    cameraRef.current = { scale: 1, tx: 0, ty: 0 };
    emit();
  }, [emit, cancelAnim]);

  const animateTo = useCallback(
    (target: Camera, durationMs: number) => {
      cancelAnim();
      const start: Camera = { ...cameraRef.current };
      // If we're already there (within epsilon), skip.
      if (
        Math.abs(start.scale - target.scale) < 1e-3 &&
        Math.abs(start.tx - target.tx) < 0.5 &&
        Math.abs(start.ty - target.ty) < 0.5
      ) {
        return;
      }
      const t0 = performance.now();
      const logStart = Math.log(start.scale);
      const logEnd = Math.log(target.scale);
      const step = () => {
        const raw = (performance.now() - t0) / durationMs;
        const t = Math.min(1, Math.max(0, raw));
        const e = easeInOutCubic(t);
        // Log-interp the scale so dolly feels evenly paced across big zooms.
        const scale = Math.exp(logStart + (logEnd - logStart) * e);
        const tx = start.tx + (target.tx - start.tx) * e;
        const ty = start.ty + (target.ty - start.ty) * e;
        cameraRef.current = { scale, tx, ty };
        emit();
        if (t < 1) {
          animRafRef.current = requestAnimationFrame(step);
        } else {
          animRafRef.current = null;
        }
      };
      animRafRef.current = requestAnimationFrame(step);
    },
    [emit, cancelAnim]
  );

  const focusOnWorldPoint = useCallback(
    (wx: number, wy: number, targetScale: number, _size: { width: number; height: number }, durationMs = 520) => {
      const s = clampScale(targetScale);
      // Center the world point: worldToView(wx,wy) should equal (W/2, H/2),
      // which reduces to tx = -wx*s, ty = -wy*s (the size cancels out).
      animateTo({ scale: s, tx: -wx * s, ty: -wy * s }, durationMs);
    },
    [animateTo]
  );

  const focusReset = useCallback(
    (durationMs = 420) => {
      animateTo({ scale: 1, tx: 0, ty: 0 }, durationMs);
    },
    [animateTo]
  );

  const force = useCallback(() => rerender((n) => n + 1), []);

  return {
    cameraRef,
    subscribe,
    wheelZoom,
    panBy,
    reset,
    focusOnWorldPoint,
    focusReset,
    cancelFocus: cancelAnim,
    force,
  };
}
