import type { CSSProperties, DragEvent } from 'react';
import { useState } from 'react';
import type { Bookmark, Group } from '../types';
import { folderHue } from '../designs/Graph/folderHue';
import { HuePickerButton } from './ColorPicker';
import { InlineEdit } from './InlineEdit';

interface Props {
  groups: Group[];
  bookmarks: Bookmark[];
  /** Id of the virtual "loose bookmarks" group (the bookmarks bar itself);
   *  cannot be renamed or deleted. Also used as the target parentId when
   *  a group is dropped at the top level. */
  protectedId: string | null;
  /** Id of the group currently being hovered/edited in the panel; used to
   *  drive the canvas highlight. */
  activeId: string | null;
  /** User-picked hue overrides; any group missing from the map uses its
   *  auto-assigned hash hue. */
  hueOverrides: Record<string, number>;
  onActiveChange: (id: string | null) => void;
  onRename: (id: string, next: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onChangeHue: (id: string, hue: number) => void;
  onResetHue: (id: string) => void;
  /** Move a group to `dest` using chrome.bookmarks.move semantics:
   *    - `parentId`: the real bookmark-tree parent id. For top-level drops,
   *      callers pass `protectedId` (the bookmarks-bar id).
   *    - `index`: 0-based insertion position within the destination
   *      siblings, already adjusted for remove-then-insert behaviour. */
  onMove: (id: string, dest: { parentId: string; index: number }) => void;
}

type DropZone = 'before' | 'inside' | 'after';

/**
 * Inline list of bookmark folders ("groups"). Hovering a row previews the
 * group on the canvas via onActiveChange; pencil icon enters inline rename,
 * trash icon deletes (with a confirm for non-empty groups). Protected
 * entries (the virtual bookmarks-bar root) skip the action buttons.
 *
 * Rows are drag-handle reorderable — grip on the left initiates a native
 * HTML5 drag, a colored bar indicates the drop point. Protected rows can
 * neither be dragged nor dropped onto.
 */
export function GroupsPanel({
  groups,
  bookmarks,
  protectedId,
  activeId,
  hueOverrides,
  onActiveChange,
  onRename,
  onDelete,
  onCreate,
  onChangeHue,
  onResetHue,
  onMove,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    zone: DropZone;
  } | null>(null);

  const countFor = (id: string) => bookmarks.filter((b) => b.parentId === id).length;

  /** Siblings in declaration order, used for index math on reorder drops. */
  const siblingsOf = (parentId: string | null): Group[] =>
    groups.filter((x) => x.parentGroupId === parentId);

  // Walk the group chain upward from `id`; returns true if `ancestorId`
  // appears anywhere. Used to block cycles when dragging a group into one
  // of its own descendants.
  const isDescendantOf = (id: string, ancestorId: string): boolean => {
    if (id === ancestorId) return true;
    const byId = new Map(groups.map((g) => [g.id, g] as const));
    let cursor: string | null = byId.get(id)?.parentGroupId ?? null;
    while (cursor) {
      if (cursor === ancestorId) return true;
      cursor = byId.get(cursor)?.parentGroupId ?? null;
    }
    return false;
  };

  const confirmDelete = (g: Group) => {
    const n = countFor(g.id);
    const childFolders = groups.filter((x) => x.parentGroupId === g.id).length;
    let msg: string;
    if (childFolders > 0) {
      msg = `"${g.label}"包含 ${childFolders} 个子分组和 ${n} 个书签，删除后会一并移除，是否继续？`;
    } else if (n === 0) {
      msg = `确认删除分组"${g.label}"？`;
    } else {
      msg = `"${g.label}"包含 ${n} 个书签，删除后会一同移除，是否继续？`;
    }
    if (window.confirm(msg)) onDelete(g.id);
  };

  const onRowDragStart = (e: DragEvent<HTMLDivElement>, g: Group) => {
    if (g.id === protectedId) return;
    setDragId(g.id);
    e.dataTransfer.effectAllowed = 'move';
    // Some browsers need a non-empty payload to actually start the drag.
    e.dataTransfer.setData('text/plain', g.id);
  };

  const zoneFor = (y: number, top: number, height: number): DropZone => {
    const rel = (y - top) / height;
    if (rel < 0.28) return 'before';
    if (rel > 0.72) return 'after';
    return 'inside';
  };

  const onRowDragOver = (e: DragEvent<HTMLDivElement>, g: Group) => {
    if (!dragId || dragId === g.id) return;
    // Block dropping a group into one of its descendants.
    if (isDescendantOf(g.id, dragId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    let zone = zoneFor(e.clientY, rect.top, rect.height);
    // You can't nest *inside* the virtual "置顶" row — it's not a real
    // folder in our UI sense. Collapse inside→after for it.
    if (g.id === protectedId && zone === 'inside') zone = 'after';
    if (!dropTarget || dropTarget.id !== g.id || dropTarget.zone !== zone) {
      setDropTarget({ id: g.id, zone });
    }
  };

  const onRowDrop = (e: DragEvent<HTMLDivElement>, g: Group) => {
    if (!dragId || dragId === g.id || !protectedId) {
      resetDrag();
      return;
    }
    if (isDescendantOf(g.id, dragId)) {
      resetDrag();
      return;
    }
    e.preventDefault();
    const zone = dropTarget?.zone ?? 'before';

    if (zone === 'inside') {
      // Nest dragged group as a child of `g`. Insert at the end of its
      // current children — felt like the most forgiving default.
      const destParent = g.id;
      const siblingsAfter = siblingsOf(g.id).filter((x) => x.id !== dragId);
      onMove(dragId, { parentId: destParent, index: siblingsAfter.length });
      resetDrag();
      return;
    }

    // Reorder: insert before/after `g` within g's parent. Compute the index
    // after removing the dragged group from its old position (chrome.move
    // uses remove-then-insert semantics).
    const destParentGroupId = g.parentGroupId; // may be null (top-level)
    const destParent =
      destParentGroupId === null ? protectedId : destParentGroupId;
    const destSiblings = siblingsOf(destParentGroupId);
    const withoutDragged = destSiblings.filter((x) => x.id !== dragId);
    const anchorPos = withoutDragged.findIndex((x) => x.id === g.id);
    if (anchorPos < 0) {
      resetDrag();
      return;
    }
    const index = zone === 'before' ? anchorPos : anchorPos + 1;

    const fromParentGroupId =
      groups.find((x) => x.id === dragId)?.parentGroupId ?? null;
    const fromSiblings = siblingsOf(fromParentGroupId);
    const fromIdx = fromSiblings.findIndex((x) => x.id === dragId);
    const sameParent = fromParentGroupId === destParentGroupId;
    if (sameParent && fromIdx === index) {
      resetDrag();
      return;
    }
    onMove(dragId, { parentId: destParent, index });
    resetDrag();
  };

  const resetDrag = () => {
    setDragId(null);
    setDropTarget(null);
  };

  return (
    <div>
      {groups.map((g) => {
        const isProtected = g.id === protectedId;
        const isActive = g.id === activeId;
        const isEditing = g.id === editingId;
        const isDragging = g.id === dragId;
        const hasOverride = g.id in hueOverrides;
        const hue = hueOverrides[g.id] ?? folderHue(g.id);
        const indicator = dropTarget?.id === g.id ? dropTarget.zone : null;
        return (
          <div
            key={g.id}
            draggable={!isProtected && !isEditing}
            onDragStart={(e) => onRowDragStart(e, g)}
            onDragOver={(e) => onRowDragOver(e, g)}
            onDrop={(e) => onRowDrop(e, g)}
            onDragEnd={resetDrag}
            onMouseEnter={() => onActiveChange(g.id)}
            onMouseLeave={() => onActiveChange(null)}
            style={{
              ...s.row,
              // Indent nested folders so the tree is legible. 14px per level
              // matches the grip icon width.
              paddingLeft: 8 + g.depth * 14,
              background:
                indicator === 'inside'
                  ? `oklch(0.62 0.15 ${hue} / 0.18)`
                  : isActive
                    ? 'var(--bg-2)'
                    : 'transparent',
              borderColor:
                indicator === 'inside'
                  ? `oklch(0.62 0.15 ${hue} / 0.6)`
                  : isActive
                    ? `oklch(0.62 0.15 ${hue} / 0.45)`
                    : 'transparent',
              opacity: isDragging ? 0.4 : 1,
              boxShadow:
                indicator === 'before'
                  ? 'inset 0 2px 0 var(--accent)'
                  : indicator === 'after'
                    ? 'inset 0 -2px 0 var(--accent)'
                    : undefined,
              cursor: isProtected ? 'default' : 'grab',
            }}
          >
            {isProtected ? (
              <span style={s.gripSpacer} aria-hidden />
            ) : (
              <span style={s.grip} aria-hidden>
                <GripIcon />
              </span>
            )}
            <HuePickerButton
              value={hue}
              onChange={(h) => onChangeHue(g.id, h)}
              {...(hasOverride ? { onReset: () => onResetHue(g.id) } : {})}
              size={12}
              title="改变分组颜色"
            />
            {isEditing ? (
              <InlineEdit
                value={g.label}
                style={{ flex: 1, fontSize: 13 }}
                onSubmit={(next) => {
                  setEditingId(null);
                  onRename(g.id, next);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <span
                style={s.label}
                onDoubleClick={() => !isProtected && setEditingId(g.id)}
                title={isProtected ? '书签栏根分组不可编辑' : '双击重命名'}
              >
                {g.label}
              </span>
            )}
            <span className="mono" style={s.count}>
              {countFor(g.id)}
            </span>
            {!isProtected && !isEditing && (
              <>
                <button
                  type="button"
                  onClick={() => setEditingId(g.id)}
                  style={s.iconBtn}
                  title="重命名"
                  aria-label="重命名"
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  onClick={() => confirmDelete(g)}
                  style={{ ...s.iconBtn, color: 'var(--warn)' }}
                  title="删除分组"
                  aria-label="删除分组"
                >
                  <TrashIcon />
                </button>
              </>
            )}
          </div>
        );
      })}
      <button type="button" onClick={onCreate} style={s.newBtn}>
        ＋ 新建分组
      </button>
    </div>
  );
}

function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
      <circle cx="2" cy="3" r="1.2" />
      <circle cx="8" cy="3" r="1.2" />
      <circle cx="2" cy="7" r="1.2" />
      <circle cx="8" cy="7" r="1.2" />
      <circle cx="2" cy="11" r="1.2" />
      <circle cx="8" cy="11" r="1.2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

const s: Record<string, CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 8,
    border: '1px solid transparent',
    transition: 'background 120ms ease, border-color 120ms ease, opacity 120ms ease',
  },
  grip: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--fg-3)',
    width: 12,
    flexShrink: 0,
    cursor: 'grab',
  },
  gripSpacer: {
    display: 'inline-block',
    width: 12,
    flexShrink: 0,
  },
  label: {
    flex: 1,
    fontSize: 13,
    color: 'var(--fg-1)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    cursor: 'text',
  },
  count: {
    fontSize: 10,
    color: 'var(--fg-3)',
    padding: '2px 6px',
    border: '1px solid var(--line-soft)',
    borderRadius: 999,
    flexShrink: 0,
  },
  iconBtn: {
    width: 22,
    height: 22,
    borderRadius: 5,
    color: 'var(--fg-3)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--line-soft)',
    background: 'var(--bg-2)',
    flexShrink: 0,
  },
  newBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    fontSize: 12,
    color: 'var(--fg-3)',
    padding: '8px 0 2px',
    marginTop: 4,
    borderTop: '1px dashed var(--line-soft)',
  },
};
