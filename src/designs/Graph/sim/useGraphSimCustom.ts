/**
 * React hook wrapping the physics `Engine`.
 *
 * The engine is long-lived — we build it once per mount and keep feeding
 * it new topologies as props change. That way node identity (and therefore
 * position/velocity) survives across topology rebuilds, which is what
 * keeps the layout visually stable when a user adds or removes bookmarks.
 *
 * The hook exposes the same `GraphSim` surface that `GraphCanvas`
 * consumes: a refs-based snapshot of nodes, a `SimulationLike` for the
 * rAF loop, and drag helpers.
 */

import { useEffect, useRef } from 'react';
import type { GraphNode } from '../../../types';
import { folderCentroid, folderHue } from '../folderHue';
import { Engine, type EngineLink } from './engine';
import type { GraphSim, SimParams, SimulationLike } from './types';

function radiusFor(visits: number): number {
  return 11 + Math.min(13, Math.sqrt(Math.max(0, visits)) * 0.9);
}

export function useGraphSimCustom({
  bookmarks,
  groups,
  edges,
  pins,
  hueOverrides,
}: SimParams): GraphSim {
  const nodesRef = useRef<GraphNode[]>([]);
  const engineRef = useRef<Engine | null>(null);
  const simulationRef = useRef<SimulationLike | null>(null);
  const draggingRef = useRef<string | null>(null);

  // Engine is allocated once per mount; topology and node arrays are swapped
  // via `setTopology` on each rebuild.
  if (engineRef.current === null) {
    engineRef.current = new Engine();
    simulationRef.current = engineRef.current;
  }

  // Latest hue overrides — read at rebuild time without being a dep.
  // Keeps expensive topology rebuilds off the hot path of the hue slider;
  // live hue changes are instead mutated in place by the effect below.
  const hueOverridesRef = useRef(hueOverrides);

  useEffect(() => {
    hueOverridesRef.current = hueOverrides;
    for (const n of nodesRef.current) {
      n.groupHue = hueOverrides?.[n.parentId] ?? folderHue(n.parentId);
    }
  }, [hueOverrides]);

  useEffect(() => {
    const engine = engineRef.current!;
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
        groupHue: hueOverridesRef.current?.[b.parentId] ?? folderHue(b.parentId),
      };
    });

    // Edge filter mirrors d3-force's behaviour: silently drop dangling links.
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    const links: EngineLink[] = [];
    for (const e of edges) {
      const source = byId.get(e.from);
      const target = byId.get(e.to);
      if (source && target) links.push({ source, target });
    }

    // Sparse graphs benefit from a softer group pull so nodes don't pile
    // onto their centroid. Matches d3-force's `strength(groups.length > 12
    // ? 0.02 : 0.04)`.
    engine.setGroupStrength(groups.length > 12 ? 0.02 : 0.04);
    engine.setTopology(nodes, links, groupIndex);
    engine.alpha(1);

    nodesRef.current = nodes;

    return () => {
      // Don't destroy the engine — we reuse it across topology changes.
      // Just cool it so stray ticks don't run against swapped-out nodes.
      engine.stop();
    };
  }, [bookmarks, groups, edges, pins]);

  const reheat = (alpha = 0.4) => {
    const engine = engineRef.current;
    if (engine) engine.alpha(alpha);
  };

  const startDrag = (id: string, wx: number, wy: number) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    draggingRef.current = id;
    node.fx = wx;
    node.fy = wy;
    const engine = engineRef.current;
    if (engine) {
      engine.alphaTarget(0.3);
      if (engine.alpha() < 0.3) engine.alpha(0.3);
    }
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
    const engine = engineRef.current;
    if (engine) engine.alphaTarget(0);
    return pos;
  };

  const findById = (id: string) =>
    nodesRef.current.find((n) => n.id === id) ?? null;

  return { nodesRef, simulationRef, startDrag, dragTo, endDrag, reheat, findById };
}
