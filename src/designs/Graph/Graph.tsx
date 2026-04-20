import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bookmark, ChromeData, GraphEdge, Group, PinsMap } from '../../types';
import { BookmarkDialog } from '../../components/BookmarkDialog';
import { ContextMenu, type MenuItem } from '../../components/ContextMenu';
import { HuePalette } from '../../components/ColorPicker';
import { GroupsPanel } from '../../components/GroupsPanel';
import { Modal } from '../../components/Modal';
import {
  createBookmark,
  createFolder,
  moveBookmark,
  moveFolder,
  openUrl,
  removeBookmark,
  removeFolder,
  renameFolder,
  subscribeBookmarkChanges,
  updateBookmark,
} from '../../services/chromeApi';
import {
  clearGroupHue,
  loadGroupHues,
  setGroupHue,
  subscribeGroupHues,
} from '../../services/groupHues';
import { copy } from '../../i18n';
import { folderHue } from './folderHue';
import { GraphCanvas } from './GraphCanvas';
import {
  addEdge as addEdgeFn,
  cleanOrphans as cleanOrphanEdges,
  loadEdges,
  removeEdge as removeEdgeFn,
  saveEdges,
} from './edges';
import {
  cleanOrphanPins,
  loadPins,
  savePins,
  setPin,
  unsetPin,
} from './pins';

interface Props {
  data: ChromeData;
}

export function Graph({ data }: Props) {
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [pins, setPins] = useState<PinsMap>({});
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderHueDraft, setFolderHueDraft] = useState<number>(200);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupHues, setGroupHues] = useState<Record<string, number>>({});
  const [bmMenu, setBmMenu] = useState<{
    x: number;
    y: number;
    id: string;
    worldPos: { x: number; y: number };
  } | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number } | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadGroupHues().then((m) => {
      if (!cancelled) setGroupHues(m);
    });
    const unsub = subscribeGroupHues((m) => {
      if (!cancelled) setGroupHues({ ...m });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadEdges(), loadPins()]).then(([e, p]) => {
      if (!cancelled) {
        setEdges(e);
        setPins(p);
      }
    });
    const unsub = subscribeBookmarkChanges(() => {
      Promise.all([loadEdges(), loadPins()]).then(([e, p]) => {
        if (!cancelled) {
          setEdges(e);
          setPins(p);
        }
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Clean orphans whenever bookmarks change.
  useEffect(() => {
    const validIds = new Set(data.bookmarks.map((b) => b.id));
    const cleanedEdges = cleanOrphanEdges(edges, validIds);
    const cleanedPins = cleanOrphanPins(pins, validIds);
    if (cleanedEdges.length !== edges.length) {
      setEdges(cleanedEdges);
      void saveEdges(cleanedEdges);
    }
    if (Object.keys(cleanedPins).length !== Object.keys(pins).length) {
      setPins(cleanedPins);
      void savePins(cleanedPins);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.bookmarks]);

  // Clear active group if it stops existing (e.g. was renamed/deleted).
  useEffect(() => {
    if (activeGroupId && !data.groups.some((g) => g.id === activeGroupId)) {
      setActiveGroupId(null);
    }
  }, [data.groups, activeGroupId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key === '/' && !typing) {
        e.preventDefault();
        filterRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (bmMenu) setBmMenu(null);
        else if (edgeMenu) setEdgeMenu(null);
        else if (canvasMenu) setCanvasMenu(null);
        else if (groupsOpen) setGroupsOpen(false);
        else if (typing) {
          (document.activeElement as HTMLElement).blur();
          setFilter('');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bmMenu, edgeMenu, canvasMenu, groupsOpen]);

  const onRequestEdge = (fromId: string, toId: string) => {
    const next = addEdgeFn(edges, fromId, toId);
    if (next !== edges) {
      setEdges(next);
      void saveEdges(next);
    }
  };

  const onPinToggle = (id: string, worldX: number, worldY: number) => {
    if (pins[id]) {
      const next = unsetPin(pins, id);
      setPins(next);
      void savePins(next);
    } else {
      const next = setPin(pins, id, worldX, worldY);
      setPins(next);
      void savePins(next);
    }
  };

  const buildBookmarkMenu = (id: string, worldPos: { x: number; y: number }): MenuItem[] => {
    const bm = data.bookmarks.find((b) => b.id === id);
    if (!bm) return [];
    const isPinned = !!pins[id];
    return [
      { label: '在新标签页打开', onClick: () => openUrl(bm.url) },
      { label: copy.workspace.editBookmarkTitle + '…', onClick: () => setEditing(bm) },
      { label: isPinned ? '取消固定' : '固定位置', onClick: () => onPinToggle(id, worldPos.x, worldPos.y) },
      {
        label: copy.workspace.deleteBookmark,
        danger: true,
        onClick: () => void removeBookmark(id),
      },
    ];
  };

  const buildEdgeMenu = (id: string): MenuItem[] => {
    return [
      {
        label: '删除连接',
        danger: true,
        onClick: () => {
          const next = removeEdgeFn(edges, id);
          setEdges(next);
          void saveEdges(next);
        },
      },
    ];
  };

  const buildCanvasMenu = (): MenuItem[] => {
    return [
      { label: '+ ' + copy.workspace.addBookmark, onClick: () => setAdding(true) },
      {
        label: '+ ' + copy.workspace.newFolder,
        disabled: !data.barId,
        onClick: openNewFolder,
      },
      {
        label: '分组管理…',
        onClick: () => setGroupsOpen(true),
      },
    ];
  };

  const submitFolder = async () => {
    const name = folderName.trim();
    if (!name || !data.barId) return;
    const newId = await createFolder(data.barId, name);
    // If the user picked a hue different from the default hash hue, persist it.
    if (newId && Math.round(folderHueDraft) !== folderHue(newId)) {
      await setGroupHue(newId, folderHueDraft);
    }
    setFolderName('');
    setFolderHueDraft(200);
    setCreatingFolder(false);
  };

  const openNewFolder = () => {
    // Pre-pick a pleasant hue that isn't already used by an existing folder.
    const used = new Set(
      data.groups.map((g) => Math.round(groupHues[g.id] ?? folderHue(g.id)))
    );
    const options = [200, 330, 150, 55, 290, 95, 15, 250];
    const pick = options.find((h) => !used.has(h)) ?? 200;
    setFolderHueDraft(pick);
    setCreatingFolder(true);
  };

  const filterQuery = filter.trim().toLowerCase();

  // Pre-build a `id → lowercased haystack` map once per bookmarks change.
  // Keeps filter evaluation to a single cheap `.includes` per bookmark
  // instead of re-concatenating and re-lowercasing on every keystroke.
  const haystacks = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of data.bookmarks) {
      map.set(b.id, `${b.name} ${b.url} ${b.group}`.toLowerCase());
    }
    return map;
  }, [data.bookmarks]);

  // Single memoized source of truth for filter results — consumers get
  // either the Set (O(1) membership for the renderer) or the list (for UI
  // counts, sorting, focus detection). Only recomputes when the query or
  // the bookmarks list changes, not on every unrelated re-render.
  const { matchSet, matchList } = useMemo(() => {
    if (!filterQuery) return { matchSet: null as Set<string> | null, matchList: [] as Bookmark[] };
    const set = new Set<string>();
    const list: Bookmark[] = [];
    for (const b of data.bookmarks) {
      const hay = haystacks.get(b.id);
      if (hay && hay.includes(filterQuery)) {
        set.add(b.id);
        list.push(b);
      }
    }
    return { matchSet: set, matchList: list };
  }, [filterQuery, data.bookmarks, haystacks]);

  const topMatch = useMemo(() => {
    if (matchList.length === 0) return null;
    let best = matchList[0]!;
    for (let i = 1; i < matchList.length; i++) {
      if (matchList[i]!.visits > best.visits) best = matchList[i]!;
    }
    return best;
  }, [matchList]);

  // Trigger the Hitchcock-style focus zoom as soon as the query narrows to
  // a single match — no need to type the full name.
  const focusMatch = matchList.length === 1 ? matchList[0]! : null;

  const onFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && topMatch) {
      e.preventDefault();
      openUrl(topMatch.url);
    }
  };

  return (
    <div style={styles.root}>
      <GraphCanvas
        bookmarks={data.bookmarks}
        groups={data.groups as Group[]}
        edges={edges}
        pins={pins}
        filterText={filter}
        filterMatches={matchSet}
        focusBookmarkId={focusMatch?.id ?? null}
        highlightGroupId={activeGroupId}
        hueOverrides={groupHues}
        onRequestEdge={onRequestEdge}
        onOpenBookmark={(id) => {
          const bm = data.bookmarks.find((b) => b.id === id);
          if (bm) openUrl(bm.url);
        }}
        onBookmarkMenu={(x, y, id, worldPos) => setBmMenu({ x, y, id, worldPos })}
        onEdgeMenu={(x, y, id) => setEdgeMenu({ x, y, id })}
        onCanvasMenu={(x, y) => setCanvasMenu({ x, y })}
      />

      {/* Floating toolbar — overlays the canvas instead of carving out a bar. */}
      <div style={styles.toolbar}>
        <div style={styles.searchPill}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--fg-3)"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={filterRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={onFilterKeyDown}
            placeholder={copy.constellation.filterPlaceholder}
            style={styles.searchInput}
          />
          {filterQuery ? (
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: matchList.length > 0 ? 'var(--fg-2)' : 'var(--warn)',
                whiteSpace: 'nowrap',
              }}
              title={topMatch ? `回车打开：${topMatch.name}` : '没有匹配的书签'}
            >
              {matchList.length > 0
                ? `${matchList.length} · ↵`
                : '无结果'}
            </span>
          ) : (
            <span className="kbd">/</span>
          )}
        </div>

        <div style={styles.toolbarDivider} />

        <ToolButton title={copy.workspace.addBookmark} onClick={() => setAdding(true)}>
          <PlusIcon />
        </ToolButton>
        <ToolButton
          title="分组管理"
          active={groupsOpen}
          onClick={() => setGroupsOpen((v) => !v)}
        >
          <FolderIcon />
        </ToolButton>
      </div>

      {/* Floating bottom strip — also overlays, so canvas runs full bleed. */}
      <div style={styles.bottomStrip}>
        <div style={styles.stripSection}>
          <div className="mono" style={styles.stripLabel}>
            {copy.constellation.stripTop}
          </div>
          <div className="strip-row" style={styles.stripRow}>
            {[...data.bookmarks]
              .sort((a, b) => b.visits - a.visits)
              .slice(0, 8)
              .map((b) => (
                <button
                  key={b.id}
                  style={styles.stripChip}
                  onClick={() => openUrl(b.url)}
                >
                  <span
                    className="favicon"
                    style={{ background: b.color, width: 20, height: 20, fontSize: 9 }}
                  >
                    {b.letter}
                  </span>
                  <span style={{ fontSize: 12 }}>{b.name}</span>
                </button>
              ))}
          </div>
        </div>
        <div style={styles.stripDiv} />
        <div style={styles.stripSection}>
          <div className="mono" style={styles.stripLabel}>
            {copy.constellation.stripRecent}
          </div>
          <div className="strip-row" style={styles.stripRow}>
            {data.recents.slice(0, 8).map((r, i) => (
              <button
                key={i}
                style={styles.stripChip}
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

      {bmMenu && (
        <ContextMenu
          x={bmMenu.x}
          y={bmMenu.y}
          items={buildBookmarkMenu(bmMenu.id, bmMenu.worldPos)}
          onClose={() => setBmMenu(null)}
        />
      )}
      {edgeMenu && (
        <ContextMenu
          x={edgeMenu.x}
          y={edgeMenu.y}
          items={buildEdgeMenu(edgeMenu.id)}
          onClose={() => setEdgeMenu(null)}
        />
      )}
      {canvasMenu && (
        <ContextMenu
          x={canvasMenu.x}
          y={canvasMenu.y}
          items={buildCanvasMenu()}
          onClose={() => setCanvasMenu(null)}
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
          editing ? { name: editing.name, url: editing.url, groupId: editing.parentId } : undefined
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
        width={380}
      >
        <input
          autoFocus
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitFolder();
          }}
          placeholder={copy.workspace.newFolderPlaceholder}
          style={styles.folderInput}
        />
        <div style={{ marginTop: 12, marginBottom: 4 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--fg-3)',
              marginBottom: 8,
              letterSpacing: '0.06em',
            }}
          >
            分组颜色
          </div>
          <HuePalette
            value={folderHueDraft}
            onChange={setFolderHueDraft}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            onClick={() => {
              setCreatingFolder(false);
              setFolderName('');
            }}
            style={styles.btnGhost}
          >
            {copy.workspace.cancel}
          </button>
          <button
            onClick={() => void submitFolder()}
            disabled={!folderName.trim()}
            style={folderName.trim() ? styles.btnPrimary : styles.btnDisabled}
          >
            {copy.workspace.ok}
          </button>
        </div>
      </Modal>

      {groupsOpen && (
        <div style={styles.sidePanel}>
          <div style={styles.panelHead}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>分组管理</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
              {data.groups.length} 个分组
            </span>
            <button
              onClick={() => setGroupsOpen(false)}
              style={styles.panelClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <GroupsPanel
            groups={data.groups}
            bookmarks={data.bookmarks}
            protectedId={data.barId}
            activeId={activeGroupId}
            hueOverrides={groupHues}
            onActiveChange={setActiveGroupId}
            onRename={(id, next) => void renameFolder(id, next)}
            onDelete={(id) => void removeFolder(id)}
            onCreate={openNewFolder}
            onChangeHue={(id, hue) => void setGroupHue(id, hue)}
            onResetHue={(id) => void clearGroupHue(id)}
            onMove={(id, dest) => void moveFolder(id, dest)}
          />
        </div>
      )}
    </div>
  );
}

interface ToolButtonProps {
  title: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
  children: ReactNode;
}

function ToolButton({ title, active, badge, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        ...styles.toolBtn,
        ...(active ? styles.toolBtnActive : {}),
      }}
    >
      {children}
      {badge != null && <span style={styles.toolBadge}>{badge}</span>}
    </button>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

const FLOAT_BG = 'color-mix(in oklch, var(--bg-1) 72%, transparent)';

const styles: Record<string, CSSProperties> = {
  root: {
    flex: 1,
    position: 'relative',
    height: '100vh',
    width: '100%',
    overflow: 'hidden',
    display: 'flex',
  },
  toolbar: {
    position: 'absolute',
    top: 14,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 6px',
    background: FLOAT_BG,
    backdropFilter: 'blur(14px) saturate(160%)',
    WebkitBackdropFilter: 'blur(14px) saturate(160%)',
    border: '1px solid var(--line)',
    borderRadius: 14,
    boxShadow: 'var(--shadow-md)',
    maxWidth: 'calc(100vw - 40px)',
  },
  searchPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    borderRadius: 10,
    minWidth: 220,
    flex: '0 1 320px',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 0,
    outline: 'none',
    fontSize: 13.5,
    color: 'var(--fg)',
  },
  toolbarDivider: {
    width: 1,
    height: 20,
    background: 'var(--line-soft)',
    margin: '0 4px',
  },
  toolBtn: {
    position: 'relative',
    width: 32,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid transparent',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--fg-2)',
    cursor: 'pointer',
  },
  toolBtnActive: {
    background: 'var(--accent-soft)',
    border: '1px solid var(--accent)',
    color: 'var(--fg)',
  },
  toolBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    padding: '0 4px',
    fontSize: 9.5,
    fontFamily: 'var(--font-mono)',
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  bottomStrip: {
    position: 'absolute',
    bottom: 14,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 20,
    display: 'flex',
    alignItems: 'stretch',
    gap: 14,
    padding: '8px 12px',
    background: FLOAT_BG,
    backdropFilter: 'blur(14px) saturate(160%)',
    WebkitBackdropFilter: 'blur(14px) saturate(160%)',
    border: '1px solid var(--line-soft)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-sm)',
    maxWidth: 'calc(100vw - 40px)',
  },
  stripSection: { display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  stripLabel: { fontSize: 10, letterSpacing: '0.15em', color: 'var(--fg-3)', flexShrink: 0 },
  stripRow: {
    display: 'flex',
    gap: 6,
    overflowX: 'auto',
    overflowY: 'hidden',
    flex: 1,
    minWidth: 0,
    // Subtle fade on the right edge so chips visibly "run under" the strip.
    maskImage:
      'linear-gradient(to right, black, black calc(100% - 16px), transparent)',
    WebkitMaskImage:
      'linear-gradient(to right, black, black calc(100% - 16px), transparent)',
    scrollbarWidth: 'none',
  },
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
  sidePanel: {
    position: 'fixed',
    top: 72,
    right: 20,
    width: 320,
    maxHeight: 'calc(100vh - 120px)',
    overflowY: 'auto',
    zIndex: 120,
    padding: 14,
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-lg)',
  },
  panelHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  panelClose: {
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
