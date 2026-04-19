import type { Bookmark } from '../types';

// Fallback mock data — mirrors design/data.js.
// Used when Chrome extension APIs are unavailable (e.g. `vite dev` in a normal browser)
// or when the user has no bookmarks / history.

const mk = (id: string, parentId: string, name: string, url: string, group: string, color: string, letter: string, visits: number, last: string): Bookmark => ({
  id, parentId, name, url, group, color, letter, visits, last,
});

export const FALLBACK_BOOKMARKS: Bookmark[] = [
  mk('gh', 'work', 'GitHub', 'https://github.com', '工作', '#1a1a1a', 'Gh', 412, '2m'),
  mk('li', 'work', 'Linear', 'https://linear.app', '工作', '#5e6ad2', 'Ln', 287, '8m'),
  mk('fg', 'work', 'Figma', 'https://figma.com', '工作', '#a259ff', 'Fg', 201, '24m'),
  mk('nt', 'work', 'Notion', 'https://notion.so', '工作', '#e8e8e3', 'Nt', 389, '4m'),
  mk('sl', 'work', 'Slack', 'https://slack.com', '工作', '#4a154b', 'Sl', 512, '1m'),
  mk('gm', 'work', 'Gmail', 'https://mail.google.com', '工作', '#ea4335', 'Gm', 321, '12m'),
  mk('cal', 'work', 'Calendar', 'https://calendar.google.com', '工作', '#4285f4', 'Ca', 178, '30m'),
  mk('dr', 'work', 'Drive', 'https://drive.google.com', '工作', '#1fa463', 'Dr', 143, '2h'),

  mk('yt', 'media', 'YouTube', 'https://youtube.com', '娱乐', '#ff0033', 'Yt', 634, '3h'),
  mk('sp', 'media', 'Spotify', 'https://open.spotify.com', '娱乐', '#1db954', 'Sp', 289, '18m'),
  mk('nf', 'media', 'Netflix', 'https://netflix.com', '娱乐', '#e50914', 'Nf', 87, '1d'),
  mk('rd', 'media', 'Reddit', 'https://reddit.com', '娱乐', '#ff4500', 'Rd', 421, '45m'),
  mk('tw', 'media', 'Twitter', 'https://x.com', '娱乐', '#000000', 'X', 512, '6m'),

  mk('mdn', 'read', 'MDN', 'https://developer.mozilla.org', '阅读', '#000000', 'Md', 167, '2h'),
  mk('rw', 'read', 'Readwise', 'https://readwise.io', '阅读', '#202020', 'Rw', 54, '1d'),
  mk('so', 'read', 'Stack Overflow', 'https://stackoverflow.com', '阅读', '#f48024', 'So', 234, '1h'),
  mk('hn', 'read', 'Hacker News', 'https://news.ycombinator.com', '阅读', '#ff6600', 'Hn', 398, '20m'),
  mk('sub', 'read', 'Substack', 'https://substack.com', '阅读', '#ff6719', 'Su', 72, '4h'),

  mk('cp', 'tools', 'Claude', 'https://claude.ai', '工具', '#cc785c', 'Cl', 756, 'now'),
  mk('cg', 'tools', 'ChatGPT', 'https://chat.openai.com', '工具', '#10a37f', 'Gp', 432, '15m'),
  mk('vs', 'tools', 'VS Code Web', 'https://vscode.dev', '工具', '#007acc', 'Vs', 98, '3h'),
  mk('rc', 'tools', 'Raycast', 'https://raycast.com', '工具', '#ff6363', 'Rc', 44, '2d'),
];

export const FALLBACK_GROUPS = [
  { id: 'work', label: '工作' },
  { id: 'media', label: '娱乐' },
  { id: 'read', label: '阅读' },
  { id: 'tools', label: '工具' },
];

export const FALLBACK_RECENTS = [
  { title: '如何设计命令面板', url: 'uxplanet.org/command-palette', at: '14:22', lastVisitTime: 0 },
  { title: 'Linear — triage inbox', url: 'linear.app/triage', at: '13:58', lastVisitTime: 0 },
  { title: 'oklch 颜色选择器', url: 'oklch.com', at: '13:40', lastVisitTime: 0 },
  { title: 'Geist 字体', url: 'vercel.com/font', at: '12:19', lastVisitTime: 0 },
  { title: 'Stripe dashboard 设计模式', url: 'stripe.com/blog', at: '11:05', lastVisitTime: 0 },
];
