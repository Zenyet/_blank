export interface Group {
  id: string;
  label: string;
  /** ID of this group's parent folder, or `null` if it sits directly under
   *  the bookmarks bar root. Lets the UI render a nested tree while the
   *  underlying list stays flat. */
  parentGroupId: string | null;
  /** 0 for top-level, 1 for subgroups of a top-level, etc. Pre-computed to
   *  avoid re-walking the parent chain at render time. */
  depth: number;
}

export interface Bookmark {
  id: string;
  parentId: string;
  name: string;
  url: string;
  group: string;
  color: string;
  letter: string;
  visits: number;
  last: string;
}

export interface HistoryItem {
  title: string;
  url: string;
  at: string;
  lastVisitTime: number;
}

export interface Todo {
  id: string;
  done: boolean;
  text: string;
  tag: 'work' | 'life';
}

export interface Quote {
  text: string;
  by: string;
}

export type Theme = 'dark' | 'light';
export type Density = 'cozy' | 'compact';
export type BgPattern = 'flat' | 'grain' | 'grid' | 'image';
export type SearchProviderId =
  | 'google'
  | 'bing'
  | 'duckduckgo'
  | 'perplexity'
  | 'chatgpt'
  | 'claude'
  | 'custom';

export interface Settings {
  theme: Theme;
  accentHue: number;
  density: Density;
  bg: BgPattern;
  /** Only used when `bg === 'image'`. A data URL (uploaded) or remote URL. */
  bgImage: string | null;
  /** 0..1. Darkening overlay on top of the background image so foreground
   *  text stays legible. */
  bgImageDim: number;
  /** Shorter force-graph and search zoom animations. */
  reduceMotion: boolean;
  /** Show the floating “frequent / recent” strip at the bottom. */
  showStrip: boolean;
  /** Open bookmark URLs in a new tab; if false, navigate the current tab. */
  openInNewTab: boolean;
  /** Fallback target used when graph search has no bookmark matches. */
  searchProvider: SearchProviderId;
  /** Label shown for the custom fallback search / ask target. */
  customSearchName: string;
  /** URL template for custom fallback queries. Use `{query}` as placeholder. */
  customSearchUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accentHue: 55,
  density: 'cozy',
  bg: 'flat',
  bgImage: null,
  bgImageDim: 0.35,
  reduceMotion: false,
  showStrip: true,
  openInNewTab: true,
  searchProvider: 'google',
  customSearchName: '自定义',
  customSearchUrl: 'https://www.google.com/search?q={query}',
};

export interface ChromeData {
  bookmarks: Bookmark[];
  recents: HistoryItem[];
  groups: Group[];
  /** ID of the bookmarks bar root (parent for new top-level folders). */
  barId: string | null;
  source: 'chrome' | 'fallback';
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: 'manual';
  label?: string;
}

export interface GraphPin {
  x: number;
  y: number;
}

export type PinsMap = Record<string, GraphPin>;

export interface Camera {
  scale: number;
  tx: number;
  ty: number;
}

export interface GraphNode extends Bookmark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  radius: number;
  groupHue: number;
}
