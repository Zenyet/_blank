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
