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
