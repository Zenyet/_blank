import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bookmark, ChromeData, Group } from '../types';
import { ContextMenu, type MenuItem } from '../components/ContextMenu';
import { BookmarkDialog } from '../components/BookmarkDialog';
import { Modal } from '../components/Modal';
import { TodoPanel } from '../components/TodoPanel';
import {
  createBookmark,
  createFolder,
  moveBookmark,
  openUrl,
  removeBookmark,
  removeFolder,
  renameFolder,
  updateBookmark,
} from '../services/chromeApi';
import { useClock } from '../hooks/useClock';
import { useTodos } from '../hooks/useTodos';
import { copy } from '../i18n';

interface Props {
  data: ChromeData;
}

const QUAD_HUES = [55, 330, 150, 215, 280, 15, 95, 240];

interface Quadrant {
  name: string;
  groupId: string;
  angleStart: number;
  angleEnd: number;
  hue: number;
}

function buildQuadrants(groups: Group[]): Record<string, Quadrant> {
  const n = Math.max(1, Math.min(groups.length, 8));
  const arc = 360 / n;
  const offset = 200;
  const result: Record<string, Quadrant> = {};
  groups.slice(0, n).forEach((g, i) => {
    const start = (offset + i * arc) % 360;
    const end = start + arc * 0.6;
    result[g.id] = {
      name: g.label,
      groupId: g.id,
      angleStart: start,
      angleEnd: end,
      hue: QUAD_HUES[i % QUAD_HUES.length]!,
    };
  });
  return result;
}

export function Constellation({ data }: Props) {
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; bm: Bookmark } | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; g: Group } | null>(null);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [adding, setAdding] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [todosOpen, setTodosOpen] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);
  const now = useClock();
  const { todos, toggle, add, remove } = useTodos();

  const W = 1180;
  const H = 680;
  const cx = W / 2;
  const cy = H / 2;

  const groupsForQuadrants = useMemo(() => {
    return data.groups.length > 0 ? data.groups : [{ id: 'fallback', label: copy.workspace.pinned }];
  }, [data.groups]);

  const quadrants = useMemo(
    () => buildQuadrants(groupsForQuadrants),
    [groupsForQuadrants]
  );

  const positions = useMemo(() => {
    const out: Array<{
      id: string;
      bm: Bookmark;
      x: number;
      y: number;
      hue: number;
      groupLabel: string;
    }> = [];
    const maxV = Math.max(1, ...data.bookmarks.map((b) => b.visits || 1));
    Object.entries(quadrants).forEach(([groupId, cfg]) => {
      const bms = data.bookmarks.filter((b) => b.parentId === groupId);
      const n = bms.length;
      bms.forEach((b, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const ang = ((cfg.angleStart + (cfg.angleEnd - cfg.angleStart) * t) * Math.PI) / 180;
        const rFactor = 1 - ((b.visits || 1) / maxV) * 0.55;
        const r = 200 + rFactor * 160 + (i % 2) * 20;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r * 0.82;
        out.push({
          id: b.id,
          bm: b,
          x,
          y,
          hue: cfg.hue,
          groupLabel: cfg.name,
        });
      });
    });
    return out;
  }, [data.bookmarks, quadrants, cx, cy]);

  const matches = useMemo(() => {
    if (!q) return null;
    const s = q.toLowerCase();
    return new Set(
      positions
        .filter((p) => (p.bm.name + p.bm.url + p.groupLabel).toLowerCase().includes(s))
        .map((p) => p.id)
    );
  }, [q, positions]);

  const timeStr = now.toTimeString().slice(0, 5);
  const dateStr = now.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const openCount = todos.filter((t) => !t.done).length;

  const submitFolder = async () => {
    const name = folderName.trim();
    if (!name || !data.barId) return;
    await createFolder(data.barId, name);
    setFolderName('');
    setCreatingFolder(false);
  };

  // Close todos panel on Escape.
  useEffect(() => {
    if (!todosOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTodosOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [todosOpen]);

  const countIn = (gid: string) => data.bookmarks.filter((b) => b.parentId === gid).length;

  return (
    <div style={s.root}>
      <div style={s.topBar}>
        <div style={s.filter}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={filterRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={copy.constellation.filterPlaceholder}
            style={s.filterInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches && matches.size === 1) {
                const id = Array.from(matches)[0]!;
                const p = positions.find((x) => x.id === id);
                if (p) openUrl(p.bm.url);
              }
            }}
            autoFocus
          />
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
            {q
              ? copy.constellation.matchCount(matches?.size ?? 0)
              : copy.constellation.siteCount(positions.length)}
          </span>
          <span className="kbd">/</span>
        </div>
        <div style={s.actions}>
          <button
            onClick={() => setAdding(true)}
            style={s.actionBtn}
            title={copy.workspace.addBookmarkTitle}
          >
            ＋ {copy.workspace.addBookmark}
          </button>
          <button
            onClick={() => setCreatingFolder(true)}
            disabled={!data.barId}
            style={{ ...s.actionBtn, opacity: data.barId ? 1 : 0.5 }}
            title={copy.workspace.newFolder}
          >
            ＋ {copy.workspace.newFolder}
          </button>
          <button
            onClick={() => setTodosOpen((v) => !v)}
            style={{
              ...s.actionBtn,
              ...(todosOpen ? { background: 'var(--accent-soft)', color: 'var(--fg)' } : {}),
            }}
            title={copy.workspace.todayLabel}
          >
            {copy.workspace.todayLabel}
            {openCount > 0 && <span style={s.badge}>{openCount}</span>}
          </button>
        </div>
      </div>

      <div style={s.canvasWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} style={s.svg} preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="oklch(0.74 0.17 55 / 0.35)" />
              <stop offset="60%" stopColor="oklch(0.74 0.17 55 / 0.04)" />
              <stop offset="100%" stopColor="oklch(0.74 0.17 55 / 0)" />
            </radialGradient>
            {QUAD_HUES.map((h) => (
              <radialGradient key={h} id={`glow-${h}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={`oklch(0.74 0.17 ${h} / 0.22)`} />
                <stop offset="100%" stopColor={`oklch(0.74 0.17 ${h} / 0)`} />
              </radialGradient>
            ))}
          </defs>

          {[120, 200, 280, 360].map((r) => (
            <ellipse
              key={r}
              cx={cx}
              cy={cy}
              rx={r}
              ry={r * 0.82}
              fill="none"
              stroke="var(--line-soft)"
              strokeWidth="1"
              strokeDasharray="2 4"
              opacity="0.5"
            />
          ))}
          <line x1={60} y1={cy} x2={W - 60} y2={cy} stroke="var(--line-soft)" strokeWidth="1" opacity="0.4" />
          <line x1={cx} y1={60} x2={cx} y2={H - 60} stroke="var(--line-soft)" strokeWidth="1" opacity="0.4" />

          <circle cx={cx} cy={cy} r={260} fill="url(#center-glow)" />

          {Object.entries(quadrants).map(([gid, cfg]) => {
            const midAng = (((cfg.angleStart + cfg.angleEnd) / 2) * Math.PI) / 180;
            const gx = cx + Math.cos(midAng) * 320;
            const gy = cy + Math.sin(midAng) * 320 * 0.82;
            return <circle key={gid} cx={gx} cy={gy} r={180} fill={`url(#glow-${cfg.hue})`} />;
          })}

          {Object.entries(quadrants).map(([gid, cfg]) => {
            const midAng = (((cfg.angleStart + cfg.angleEnd) / 2) * Math.PI) / 180;
            const lx = cx + Math.cos(midAng) * 420;
            const ly = cy + Math.sin(midAng) * 420 * 0.82;
            const count = countIn(gid);
            const group = data.groups.find((g) => g.id === gid);
            return (
              <g
                key={gid}
                style={{ cursor: group ? 'pointer' : 'default' }}
                onContextMenu={(e) => {
                  if (!group) return;
                  e.preventDefault();
                  setFolderMenu({ x: e.clientX, y: e.clientY, g: group });
                }}
              >
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize="11"
                  letterSpacing="3"
                  fill={`oklch(0.82 0.14 ${cfg.hue})`}
                >
                  {cfg.name}
                </text>
                <text
                  x={lx}
                  y={ly + 14}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize="9.5"
                  fill="var(--fg-3)"
                >
                  {count} 项
                </text>
              </g>
            );
          })}

          {positions.map((p) => {
            const on = !matches || matches.has(p.id);
            return (
              <line
                key={'l-' + p.id}
                x1={cx}
                y1={cy}
                x2={p.x}
                y2={p.y}
                stroke={`oklch(0.74 0.17 ${p.hue})`}
                strokeOpacity={on ? 0.18 : 0.05}
                strokeWidth="1"
              />
            );
          })}

          {positions.map((p) => {
            const on = !matches || matches.has(p.id);
            const isHover = hover === p.id;
            const size = 20 + Math.min(24, (p.bm.visits || 0) / 30);
            return (
              <g
                key={p.id}
                style={{
                  cursor: 'pointer',
                  opacity: on ? 1 : 0.2,
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => openUrl(p.bm.url)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, bm: p.bm });
                }}
                transform={`translate(${p.x} ${p.y})`}
              >
                {isHover && on && (
                  <circle
                    r={size / 2 + 8}
                    fill="none"
                    stroke={`oklch(0.74 0.17 ${p.hue})`}
                    strokeWidth="1.5"
                    opacity="0.6"
                  />
                )}
                <rect
                  x={-size / 2}
                  y={-size / 2}
                  width={size}
                  height={size}
                  rx={size * 0.22}
                  fill={p.bm.color}
                  stroke={`oklch(0.74 0.17 ${p.hue} / 0.4)`}
                  strokeWidth="1"
                />
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontWeight="600"
                  fontSize={size * 0.38}
                  fill="#fff"
                >
                  {p.bm.letter}
                </text>
                {(isHover || (matches && matches.has(p.id))) && on && (
                  <g transform={`translate(0 ${size / 2 + 16})`}>
                    <text
                      textAnchor="middle"
                      fontFamily="var(--font-sans)"
                      fontSize="12"
                      fontWeight="500"
                      fill="var(--fg)"
                    >
                      {p.bm.name}
                    </text>
                    <text
                      y={14}
                      textAnchor="middle"
                      fontFamily="var(--font-mono)"
                      fontSize="10"
                      fill="var(--fg-3)"
                    >
                      {new URL(p.bm.url).hostname.replace(/^www\./, '')}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          <g transform={`translate(${cx} ${cy})`}>
            <circle r={80} fill="var(--bg)" stroke="var(--line)" strokeWidth="1" />
            <circle r={76} fill="var(--bg-1)" />
            <text
              textAnchor="middle"
              y={-14}
              fontFamily="var(--font-mono)"
              fontSize="10"
              letterSpacing="3"
              fill="var(--fg-3)"
            >
              {copy.constellation.today}
            </text>
            <text
              textAnchor="middle"
              y={16}
              fontFamily="var(--font-sans)"
              fontSize="28"
              fontWeight="500"
              fill="var(--fg)"
              style={{ fontFeatureSettings: '"tnum" on' }}
            >
              {timeStr}
            </text>
            <text
              textAnchor="middle"
              y={38}
              fontFamily="var(--font-mono)"
              fontSize="9.5"
              fill="var(--fg-3)"
            >
              {dateStr}
            </text>
            <line x1={-30} y1={52} x2={30} y2={52} stroke="var(--line)" strokeWidth="1" />
            <circle cx={-22} cy={64} r="3" fill="var(--accent)" />
            <text x={-14} y={68} fontFamily="var(--font-sans)" fontSize="10" fill="var(--fg-2)">
              {copy.constellation.summary(data.bookmarks.length, groupsForQuadrants.length)}
            </text>
          </g>
        </svg>

        <div style={s.legend}>
          <div style={s.legendRow}>
            <span style={{ ...s.legendDot, width: 8, height: 8 }} />
            <span>{copy.constellation.sizeLegend}</span>
          </div>
          <div style={s.legendRow}>
            <span style={{ ...s.legendDot, width: 5, height: 5, opacity: 0.6 }} />
            <span>{copy.constellation.distanceLegend}</span>
          </div>
          <div style={s.legendRow}>
            <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 10 }}>
              右键节点/分组标签查看更多
            </span>
          </div>
        </div>
      </div>

      <div style={s.bottomStrip}>
        <div style={s.stripSection}>
          <div className="mono" style={s.stripLabel}>
            {copy.constellation.stripTop}
          </div>
          <div style={s.stripRow}>
            {[...data.bookmarks]
              .sort((a, b) => b.visits - a.visits)
              .slice(0, 5)
              .map((b) => (
                <button
                  key={b.id}
                  data-strip-chip
                  style={s.stripChip}
                  onClick={() => openUrl(b.url)}
                >
                  <span
                    className="favicon"
                    style={{
                      background: b.color,
                      width: 20,
                      height: 20,
                      fontSize: 9,
                    }}
                  >
                    {b.letter}
                  </span>
                  <span style={{ fontSize: 12 }}>{b.name}</span>
                </button>
              ))}
          </div>
        </div>
        <div style={s.stripDiv} />
        <div style={s.stripSection}>
          <div className="mono" style={s.stripLabel}>
            {copy.constellation.stripRecent}
          </div>
          <div style={s.stripRow}>
            {data.recents.slice(0, 4).map((r, i) => (
              <button
                key={i}
                data-strip-chip
                style={s.stripChip}
                onClick={() => openUrl(r.url)}
              >
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>
                  {r.at}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    maxWidth: 180,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {r.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={buildBmMenu(menu.bm, setEditing)}
          onClose={() => setMenu(null)}
        />
      )}

      {folderMenu && (
        <ContextMenu
          x={folderMenu.x}
          y={folderMenu.y}
          items={buildFolderMenu(folderMenu.g, countIn(folderMenu.g.id))}
          onClose={() => setFolderMenu(null)}
        />
      )}

      <BookmarkDialog
        open={adding}
        mode="create"
        groups={data.groups}
        defaultGroupId={data.groups[0]?.id}
        onCancel={() => setAdding(false)}
        onSubmit={async ({ name, url, groupId }) => {
          setAdding(false);
          await createBookmark(groupId, name, url);
        }}
      />

      <BookmarkDialog
        open={!!editing}
        mode="edit"
        initial={
          editing
            ? { name: editing.name, url: editing.url, groupId: editing.parentId }
            : undefined
        }
        groups={data.groups}
        onCancel={() => setEditing(null)}
        onSubmit={async ({ name, url, groupId }) => {
          if (!editing) return;
          const id = editing.id;
          setEditing(null);
          await updateBookmark(id, { title: name, url });
          if (groupId !== editing.parentId) {
            await moveBookmark(id, { parentId: groupId });
          }
        }}
      />

      <Modal
        open={creatingFolder}
        onClose={() => {
          setCreatingFolder(false);
          setFolderName('');
        }}
        title={copy.workspace.newFolder}
        width={360}
      >
        <input
          autoFocus
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitFolder();
          }}
          placeholder={copy.workspace.newFolderPlaceholder}
          style={s.folderInput}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              setCreatingFolder(false);
              setFolderName('');
            }}
            style={s.btnGhost}
          >
            {copy.workspace.cancel}
          </button>
          <button
            onClick={() => void submitFolder()}
            disabled={!folderName.trim()}
            style={folderName.trim() ? s.btnPrimary : s.btnDisabled}
          >
            {copy.workspace.ok}
          </button>
        </div>
      </Modal>

      {todosOpen && (
        <div style={s.todosPanel} onMouseDown={(e) => e.stopPropagation()}>
          <div style={s.todosHead}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {copy.workspace.todayLabel}
            </span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
              {copy.workspace.todayOpen(openCount)}
            </span>
            <button onClick={() => setTodosOpen(false)} style={s.todosClose} aria-label="关闭">
              ×
            </button>
          </div>
          <TodoPanel todos={todos} onToggle={toggle} onAdd={add} onRemove={remove} />
        </div>
      )}
    </div>
  );
}

function buildBmMenu(bm: Bookmark, setEditing: (b: Bookmark) => void): MenuItem[] {
  return [
    { label: '在新标签页打开', onClick: () => openUrl(bm.url) },
    { label: copy.workspace.editBookmarkTitle + '…', onClick: () => setEditing(bm) },
    { label: copy.workspace.deleteBookmark, danger: true, onClick: () => void removeBookmark(bm.id) },
  ];
}

function buildFolderMenu(g: Group, count: number): MenuItem[] {
  return [
    {
      label: copy.workspace.rename + '…',
      onClick: () => {
        const next = window.prompt(copy.workspace.rename + '：', g.label);
        if (next && next.trim() && next.trim() !== g.label) {
          void renameFolder(g.id, next.trim());
        }
      },
    },
    {
      label: copy.workspace.deleteFolder,
      danger: true,
      disabled: count > 0,
      onClick: () => {
        if (count > 0) return;
        void removeFolder(g.id);
      },
    },
  ];
}

const s: Record<string, CSSProperties> = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100vh',
    padding: '14px 20px 14px',
    gap: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
    maxWidth: 960,
    width: '100%',
    margin: '0 auto',
  },
  filter: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    flex: 1,
    minWidth: 0,
    boxShadow: 'var(--shadow-sm)',
  },
  filterInput: {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 0,
    outline: 'none',
    fontSize: 14,
    color: 'var(--fg)',
  },
  actions: { display: 'flex', gap: 6, flexShrink: 0 },
  actionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    color: 'var(--fg-2)',
    fontSize: 12.5,
    boxShadow: 'var(--shadow-sm)',
    transition: 'all 0.15s',
    cursor: 'pointer',
  },
  badge: {
    padding: '1px 6px',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    borderRadius: 999,
    lineHeight: 1.4,
  },

  canvasWrap: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  svg: {
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
    display: 'block',
  },

  legend: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    padding: '10px 12px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-soft)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    fontSize: 11,
    color: 'var(--fg-2)',
  },
  legendRow: { display: 'flex', alignItems: 'center', gap: 8 },
  legendDot: { borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' },

  bottomStrip: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 14,
    padding: '8px 12px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-soft)',
    borderRadius: 10,
    flexShrink: 0,
  },
  stripSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  stripLabel: { fontSize: 10, letterSpacing: '0.15em', color: 'var(--fg-3)' },
  stripRow: { display: 'flex', gap: 6, overflow: 'hidden', flex: 1 },
  stripChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid var(--line-soft)',
    background: 'var(--bg-2)',
    color: 'var(--fg-1)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  stripDiv: { width: 1, background: 'var(--line-soft)' },

  folderInput: {
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '8px 10px',
    color: 'var(--fg)',
    outline: 'none',
    fontSize: 13,
    width: '100%',
  },
  btnGhost: {
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    color: 'var(--fg-2)',
    border: '1px solid var(--line)',
  },
  btnPrimary: {
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    color: 'var(--accent-ink)',
    background: 'var(--accent)',
    fontWeight: 500,
  },
  btnDisabled: {
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    color: 'var(--fg-3)',
    background: 'var(--bg-2)',
    cursor: 'not-allowed',
  },

  todosPanel: {
    position: 'fixed',
    top: 80,
    right: 20,
    width: 320,
    maxHeight: '70vh',
    overflowY: 'auto',
    zIndex: 120,
    padding: 14,
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-lg)',
  },
  todosHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  todosClose: {
    marginLeft: 'auto',
    width: 22,
    height: 22,
    borderRadius: 5,
    color: 'var(--fg-3)',
    fontSize: 16,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
