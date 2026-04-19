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
