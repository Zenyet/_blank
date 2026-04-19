export interface Group {
  id: string;
  label: string;
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
export type BgPattern = 'flat' | 'grain' | 'grid';

export interface Settings {
  theme: Theme;
  accentHue: number;
  density: Density;
  bg: BgPattern;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accentHue: 55,
  density: 'cozy',
  bg: 'flat',
};

export interface ChromeData {
  bookmarks: Bookmark[];
  recents: HistoryItem[];
  groups: Group[];
  /** ID of the bookmarks bar root (parent for new top-level folders). */
  barId: string | null;
  source: 'chrome' | 'fallback';
}
