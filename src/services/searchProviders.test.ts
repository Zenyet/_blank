import { describe, expect, it } from 'vitest';
import { urlFromTemplate } from './searchProviders';

describe('urlFromTemplate', () => {
  it('replaces the {query} placeholder with an encoded query', () => {
    expect(
      urlFromTemplate('https://example.com/ask?q={query}', 'hello world')
    ).toBe('https://example.com/ask?q=hello%20world');
  });

  it('supports %s search templates', () => {
    expect(urlFromTemplate('https://example.com/search/%s', 'a/b')).toBe(
      'https://example.com/search/a%2Fb'
    );
  });

  it('adds q when the template has no placeholder', () => {
    expect(urlFromTemplate('https://example.com/search', 'new tab')).toBe(
      'https://example.com/search?q=new+tab'
    );
  });
});
