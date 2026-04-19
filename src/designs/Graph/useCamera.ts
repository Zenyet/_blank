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
