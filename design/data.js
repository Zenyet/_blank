// Shared data across designs
window.NEWTAB_DATA = {
  bookmarks: [
    { id: 'gh',   name: 'GitHub',       url: 'github.com',          group: 'Work',  color: '#1a1a1a', letter: 'Gh', visits: 412, last: '2m' },
    { id: 'li',   name: 'Linear',       url: 'linear.app',          group: 'Work',  color: '#5e6ad2', letter: 'Ln', visits: 287, last: '8m' },
    { id: 'fg',   name: 'Figma',        url: 'figma.com',           group: 'Work',  color: '#a259ff', letter: 'Fg', visits: 201, last: '24m' },
    { id: 'nt',   name: 'Notion',       url: 'notion.so',           group: 'Work',  color: '#e8e8e3', letter: 'Nt', visits: 389, last: '4m' },
    { id: 'sl',   name: 'Slack',        url: 'slack.com',           group: 'Work',  color: '#4a154b', letter: 'Sl', visits: 512, last: '1m' },
    { id: 'gm',   name: 'Gmail',        url: 'mail.google.com',     group: 'Work',  color: '#ea4335', letter: 'Gm', visits: 321, last: '12m' },
    { id: 'cal',  name: 'Calendar',     url: 'calendar.google.com', group: 'Work',  color: '#4285f4', letter: 'Ca', visits: 178, last: '30m' },
    { id: 'dr',   name: 'Drive',        url: 'drive.google.com',    group: 'Work',  color: '#1fa463', letter: 'Dr', visits: 143, last: '2h' },

    { id: 'yt',   name: 'YouTube',      url: 'youtube.com',         group: 'Media', color: '#ff0033', letter: 'Yt', visits: 634, last: '3h' },
    { id: 'sp',   name: 'Spotify',      url: 'open.spotify.com',    group: 'Media', color: '#1db954', letter: 'Sp', visits: 289, last: '18m' },
    { id: 'nf',   name: 'Netflix',      url: 'netflix.com',         group: 'Media', color: '#e50914', letter: 'Nf', visits: 87,  last: '1d' },
    { id: 'rd',   name: 'Reddit',       url: 'reddit.com',          group: 'Media', color: '#ff4500', letter: 'Rd', visits: 421, last: '45m' },
    { id: 'tw',   name: 'Twitter',      url: 'x.com',               group: 'Media', color: '#000000', letter: 'X',  visits: 512, last: '6m' },

    { id: 'mdn',  name: 'MDN',          url: 'developer.mozilla.org', group: 'Read', color: '#000000', letter: 'Md', visits: 167, last: '2h' },
    { id: 'rd2',  name: 'Readwise',     url: 'readwise.io',         group: 'Read',  color: '#202020', letter: 'Rw', visits: 54,  last: '1d' },
    { id: 'so',   name: 'Stack Overflow', url: 'stackoverflow.com', group: 'Read',  color: '#f48024', letter: 'So', visits: 234, last: '1h' },
    { id: 'hn',   name: 'Hacker News',  url: 'news.ycombinator.com', group: 'Read', color: '#ff6600', letter: 'Hn', visits: 398, last: '20m' },
    { id: 'sub',  name: 'Substack',     url: 'substack.com',        group: 'Read',  color: '#ff6719', letter: 'Su', visits: 72,  last: '4h' },

    { id: 'cp',   name: 'Claude',       url: 'claude.ai',           group: 'Tools', color: '#cc785c', letter: 'Cl', visits: 756, last: 'now' },
    { id: 'cg',   name: 'ChatGPT',      url: 'chat.openai.com',     group: 'Tools', color: '#10a37f', letter: 'Gp', visits: 432, last: '15m' },
    { id: 'vs',   name: 'VS Code Web',  url: 'vscode.dev',          group: 'Tools', color: '#007acc', letter: 'Vs', visits: 98,  last: '3h' },
    { id: 'rc',   name: 'Raycast',      url: 'raycast.com',         group: 'Tools', color: '#ff6363', letter: 'Rc', visits: 44,  last: '2d' },
  ],
  recents: [
    { title: 'How to design a command palette', url: 'uxplanet.org/command-palette', at: '14:22' },
    { title: 'Linear — triage inbox', url: 'linear.app/triage', at: '13:58' },
    { title: 'oklch color picker', url: 'oklch.com', at: '13:40' },
    { title: 'Geist typeface', url: 'vercel.com/font', at: '12:19' },
    { title: 'Stripe — dashboard design patterns', url: 'stripe.com/blog', at: '11:05' },
    { title: 'Are.na — design systems channel', url: 'are.na/channel/design-systems', at: '10:33' },
  ],
  todos: [
    { done: false, text: 'Review onboarding flow v3', tag: 'work' },
    { done: false, text: 'Reply to Mark re: Q3 roadmap', tag: 'work' },
    { done: true,  text: 'Ship changelog draft', tag: 'work' },
    { done: false, text: 'Book flights for offsite', tag: 'life' },
  ],
  quote: { text: 'The details are not the details. They make the design.', by: 'Charles Eames' },
  weather: { city: 'Shenzhen', temp: 26, cond: 'Partly cloudy', hi: 29, lo: 22 },
};
