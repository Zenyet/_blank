import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Bookmark, ChromeData, GraphEdge, Group, PinsMap } from '../../types';
import { BookmarkDialog } from '../../components/BookmarkDialog';
import { ContextMenu, type MenuItem } from '../../components/ContextMenu';
import { Modal } from '../../components/Modal';
import { TodoPanel } from '../../components/TodoPanel';
import {
  createBookmark,
  createFolder,
  moveBookmark,
  openUrl,
  removeBookmark,
  subscribeBookmarkChanges,
  updateBookmark,
} from '../../services/chromeApi';
import { useTodos } from '../../hooks/useTodos';
import { copy } from '../../i18n';
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
  const [todosOpen, setTodosOpen] = useState(false);
  const [bmMenu, setBmMenu] = useState<{
    x: number;
    y: number;
    id: string;
    worldPos: { x: number; y: number };
  } | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number } | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const { todos, toggle, add, remove } = useTodos();

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
        else if (todosOpen) setTodosOpen(false);
        else if (typing) {
          (document.activeElement as HTMLElement).blur();
          setFilter('');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bmMenu, edgeMenu, canvasMenu, todosOpen]);

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
        onClick: () => setCreatingFolder(true),
      },
    ];
  };

  const submitFolder = async () => {
    const name = folderName.trim();
    if (!name || !data.barId) return;
    await createFolder(data.barId, name);
    setFolderName('');
    setCreatingFolder(false);
  };

  const openCount = todos.filter((t) => !t.done).length;

  return (
    <div style={styles.root}>
      <div style={styles.topBar}>
        <div style={styles.filter}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={filterRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={copy.constellation.filterPlaceholder}
            style={styles.filterInput}
          />
          <span className="kbd">/</span>
        </div>
        <div style={styles.actions}>
          <button onClick={() => setAdding(true)} style={styles.actionBtn}>
            ＋ {copy.workspace.addBookmark}
          </button>
          <button
            onClick={() => setCreatingFolder(true)}
            disabled={!data.barId}
            style={{ ...styles.actionBtn, opacity: data.barId ? 1 : 0.5 }}
          >
            ＋ {copy.workspace.newFolder}
          </button>
          <button
            onClick={() => setTodosOpen((v) => !v)}
            style={{
              ...styles.actionBtn,
              ...(todosOpen ? { background: 'var(--accent-soft)', color: 'var(--fg)' } : {}),
            }}
          >
            {copy.workspace.todayLabel}
            {openCount > 0 && <span style={styles.badge}>{openCount}</span>}
          </button>
        </div>
      </div>

      <GraphCanvas
        bookmarks={data.bookmarks}
        groups={data.groups as Group[]}
        edges={edges}
        pins={pins}
        filterText={filter}
        onRequestEdge={onRequestEdge}
        onOpenBookmark={(id) => {
          const bm = data.bookmarks.find((b) => b.id === id);
          if (bm) openUrl(bm.url);
        }}
        onBookmarkMenu={(x, y, id, worldPos) => setBmMenu({ x, y, id, worldPos })}
        onEdgeMenu={(x, y, id) => setEdgeMenu({ x, y, id })}
        onCanvasMenu={(x, y) => setCanvasMenu({ x, y })}
      />

      <div style={styles.bottomStrip}>
        <div style={styles.stripSection}>
          <div className="mono" style={styles.stripLabel}>
            {copy.constellation.stripTop}
          </div>
          <div style={styles.stripRow}>
            {[...data.bookmarks]
              .sort((a, b) => b.visits - a.visits)
              .slice(0, 5)
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
          <div style={styles.stripRow}>
            {data.recents.slice(0, 4).map((r, i) => (
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
          style={styles.folderInput}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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

      {todosOpen && (
        <div style={styles.todosPanel}>
          <div style={styles.todosHead}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{copy.workspace.todayLabel}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
              {copy.workspace.todayOpen(openCount)}
            </span>
            <button onClick={() => setTodosOpen(false)} style={styles.todosClose} aria-label="关闭">
              ×
            </button>
          </div>
          <TodoPanel todos={todos} onToggle={toggle} onAdd={add} onRemove={remove} />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
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
  stripSection: { display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
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
  todosHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
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
