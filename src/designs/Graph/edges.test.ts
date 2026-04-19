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
