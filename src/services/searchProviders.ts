import type { SearchProviderId, Settings } from '../types';

export type SearchProviderKind = 'search' | 'ask';

export interface SearchProvider {
  id: SearchProviderId;
  label: string;
  description: string;
  kind: SearchProviderKind;
  urlTemplate: string;
}

export const DEFAULT_CUSTOM_SEARCH_URL = 'https://www.google.com/search?q={query}';

export const SEARCH_PROVIDERS: SearchProvider[] = [
  {
    id: 'google',
    label: 'Google',
    description: '通用网页搜索',
    kind: 'search',
    urlTemplate: 'https://www.google.com/search?q={query}',
  },
  {
    id: 'bing',
    label: 'Bing',
    description: '微软网页搜索',
    kind: 'search',
    urlTemplate: 'https://www.bing.com/search?q={query}',
  },
  {
    id: 'duckduckgo',
    label: 'DuckDuckGo',
    description: '隐私友好的网页搜索',
    kind: 'search',
    urlTemplate: 'https://duckduckgo.com/?q={query}',
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    description: '带引用的 AI 搜索',
    kind: 'ask',
    urlTemplate: 'https://www.perplexity.ai/search?q={query}',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    description: '打开新对话并带入问题',
    kind: 'ask',
    urlTemplate: 'https://chatgpt.com/?q={query}',
  },
  {
    id: 'claude',
    label: 'Claude',
    description: '打开 Claude 新对话',
    kind: 'ask',
    urlTemplate: 'https://claude.ai/new?q={query}',
  },
];

export function getSearchProvider(settings: Settings): SearchProvider {
  if (settings.searchProvider === 'custom') {
    return {
      id: 'custom',
      label: settings.customSearchName.trim() || '自定义',
      description: '使用自定义链接模板',
      kind: 'ask',
      urlTemplate: settings.customSearchUrl.trim() || DEFAULT_CUSTOM_SEARCH_URL,
    };
  }

  return (
    SEARCH_PROVIDERS.find((p) => p.id === settings.searchProvider) ??
    SEARCH_PROVIDERS[0]!
  );
}

export function searchUrlForSettings(query: string, settings: Settings): string {
  return urlFromTemplate(getSearchProvider(settings).urlTemplate, query);
}

export function urlFromTemplate(template: string, query: string): string {
  const trimmed = template.trim() || DEFAULT_CUSTOM_SEARCH_URL;
  const encoded = encodeURIComponent(query);

  if (trimmed.includes('{query}')) {
    return trimmed.replace(/\{query\}/g, encoded);
  }

  if (trimmed.includes('%s')) {
    return trimmed.replace(/%s/g, encoded);
  }

  try {
    const url = new URL(trimmed);
    url.searchParams.set('q', query);
    return url.toString();
  } catch {
    return DEFAULT_CUSTOM_SEARCH_URL.replace('{query}', encoded);
  }
}
