import { describe, it, expect } from 'vitest';
import type { Bookmark, GraphEdge } from '../../types';
import { clustersForHost, suggestRelated } from './relationSuggest';

const bm = (
  id: string,
  url: string,
  visits = 0,
  name = id
): Bookmark => ({
  id,
  parentId: 'root',
  name,
  url,
  group: 'g',
  color: '#000',
  letter: name[0]!.toUpperCase(),
  visits,
  last: '',
});

const edge = (from: string, to: string): GraphEdge => ({
  id: `${from} ${to}`,
  from,
  to,
  kind: 'manual',
});

describe('clustersForHost', () => {
  it('matches a known host into the expected cluster', () => {
    const clusters = clustersForHost('chatgpt.com');
    expect(clusters.map((c) => c.id)).toContain('llm-chat');
  });

  it('strips www. and is case-insensitive', () => {
    expect(clustersForHost('www.GitHub.com').map((c) => c.id)).toContain(
      'code-host'
    );
  });

  it('returns nothing for hosts outside the curated table', () => {
    expect(clustersForHost('example.com')).toEqual([]);
  });
});

describe('suggestRelated', () => {
  it('returns same-cluster bookmarks ranked by visits', () => {
    const focused = bm('a', 'https://chatgpt.com', 50, 'ChatGPT');
    const all = [
      focused,
      bm('b', 'https://claude.ai', 80, 'Claude'),
      bm('c', 'https://gemini.google.com', 30, 'Gemini'),
      bm('d', 'https://grok.com', 10, 'Grok'),
      bm('e', 'https://example.com', 999, 'Unrelated'),
    ];
    const out = suggestRelated(focused, all, [], 3);
    expect(out.map((b) => b.id)).toEqual(['b', 'c', 'd']);
  });

  it('excludes already-connected bookmarks', () => {
    const focused = bm('a', 'https://chatgpt.com');
    const all = [focused, bm('b', 'https://claude.ai'), bm('c', 'https://grok.com')];
    const edges = [edge('a', 'b')];
    const out = suggestRelated(focused, all, edges);
    expect(out.map((b) => b.id)).toEqual(['c']);
  });

  it('ignores the focused bookmark itself', () => {
    const focused = bm('a', 'https://chatgpt.com', 99);
    const all = [focused, bm('b', 'https://claude.ai', 1)];
    const out = suggestRelated(focused, all, []);
    expect(out.map((b) => b.id)).toEqual(['b']);
  });

  it('returns empty when the focused host has no cluster', () => {
    const focused = bm('a', 'https://example.com');
    const all = [focused, bm('b', 'https://chatgpt.com')];
    expect(suggestRelated(focused, all, [])).toEqual([]);
  });

  it('respects the limit', () => {
    const focused = bm('a', 'https://chatgpt.com');
    const all = [
      focused,
      bm('b', 'https://claude.ai', 4),
      bm('c', 'https://gemini.google.com', 3),
      bm('d', 'https://grok.com', 2),
      bm('e', 'https://perplexity.ai', 1),
    ];
    expect(suggestRelated(focused, all, [], 2).map((b) => b.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('handles malformed urls without throwing', () => {
    const focused = bm('a', 'not-a-url');
    expect(suggestRelated(focused, [focused], [])).toEqual([]);
  });
});
