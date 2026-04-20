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
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accentHue: 55,
  density: 'cozy',
  bg: 'flat',
  bgImage: null,
  bgImageDim: 0.35,
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
