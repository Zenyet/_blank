import type { Bookmark, GraphEdge } from '../../types';

export interface HostCluster {
  /** Stable id used in tests and (later) settings overrides. */
  id: string;
  /** Short, user-facing label (zh). */
  label: string;
  /** Lower-case hostnames *after* stripping a leading `www.`. Match is exact;
   *  no wildcards on purpose — keeps surprises out of suggestions. */
  hosts: readonly string[];
}

/**
 * Curated, conservative cluster table. Each cluster groups bookmarks that
 * users almost certainly think of together, so suggestion strips don't
 * suggest nonsense. Add hosts here as the table proves itself in practice
 * — wildcard matching would be a separate, riskier change.
 */
export const HOST_CLUSTERS: readonly HostCluster[] = [
  {
    id: 'llm-chat',
    label: 'AI 聊天',
    hosts: [
      'chatgpt.com',
      'chat.openai.com',
      'claude.ai',
      'gemini.google.com',
      'aistudio.google.com',
      'grok.com',
      'x.ai',
      'copilot.microsoft.com',
      'perplexity.ai',
      'poe.com',
      'kimi.com',
      'tongyi.aliyun.com',
      'yiyan.baidu.com',
      'chat.deepseek.com',
    ],
  },
  {
    id: 'code-host',
    label: '代码托管',
    hosts: [
      'github.com',
      'gitlab.com',
      'bitbucket.org',
      'gitee.com',
      'codeberg.org',
      'sourcehut.org',
    ],
  },
  {
    id: 'cloud-ide',
    label: '在线 IDE',
    hosts: [
      'codesandbox.io',
      'stackblitz.com',
      'replit.com',
      'glitch.com',
      'gitpod.io',
    ],
  },
  {
    id: 'video',
    label: '视频',
    hosts: [
      'youtube.com',
      'bilibili.com',
      'vimeo.com',
      'twitch.tv',
      'nicovideo.jp',
    ],
  },
  {
    id: 'social',
    label: '社交',
    hosts: [
      'twitter.com',
      'x.com',
      'threads.net',
      'bsky.app',
      'mastodon.social',
      'weibo.com',
      'xiaohongshu.com',
    ],
  },
  {
    id: 'design',
    label: '设计',
    hosts: [
      'figma.com',
      'sketch.com',
      'framer.com',
      'penpot.app',
      'excalidraw.com',
    ],
  },
  {
    id: 'productivity',
    label: '协作',
    hosts: [
      'notion.so',
      'notion.com',
      'linear.app',
      'asana.com',
      'clickup.com',
      'monday.com',
      'trello.com',
    ],
  },
  {
    id: 'ai-image',
    label: 'AI 绘图',
    hosts: [
      'midjourney.com',
      'leonardo.ai',
      'runwayml.com',
      'openart.ai',
      'krea.ai',
      'ideogram.ai',
    ],
  },
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** All clusters that contain `host`. Most hosts will match 0 or 1 clusters
 *  but the function tolerates overlap for forward-compatibility. */
export function clustersForHost(host: string): readonly HostCluster[] {
  const normalized = host.toLowerCase().replace(/^www\./, '');
  return HOST_CLUSTERS.filter((c) => c.hosts.includes(normalized));
}

/**
 * Find bookmarks that share a host cluster with `focused` but are not yet
 * connected to it via an edge. Ranked by visits (desc) so the suggestions
 * that surface first are the ones the user reaches for most.
 *
 * Returns at most `limit` results; passes through `[]` quickly when the
 * focused bookmark's host doesn't match any cluster (the common case for
 * niche bookmarks).
 */
export function suggestRelated(
  focused: Bookmark,
  all: Bookmark[],
  edges: GraphEdge[],
  limit = 3
): Bookmark[] {
  const focusedHost = hostOf(focused.url);
  if (!focusedHost) return [];
  const myClusters = clustersForHost(focusedHost);
  if (myClusters.length === 0) return [];

  // Hosts in any cluster that the focused bookmark belongs to.
  const candidateHosts = new Set<string>();
  for (const c of myClusters) for (const h of c.hosts) candidateHosts.add(h);

  // Already-connected ids — these don't need a suggestion, they're in the
  // local graph already.
  const connected = new Set<string>();
  for (const e of edges) {
    if (e.from === focused.id) connected.add(e.to);
    else if (e.to === focused.id) connected.add(e.from);
  }

  const out: Bookmark[] = [];
  for (const b of all) {
    if (b.id === focused.id) continue;
    if (connected.has(b.id)) continue;
    const h = hostOf(b.url);
    if (h && candidateHosts.has(h)) out.push(b);
  }
  out.sort((a, b) => b.visits - a.visits);
  return out.slice(0, limit);
}
