import type { CSSProperties, DragEvent } from 'react';
import { useEffect, useState } from 'react';
import type { Bookmark, Group } from '../types';
import { folderHue } from '../designs/Graph/folderHue';
import { HuePickerButton } from './ColorPicker';
import { InlineEdit } from './InlineEdit';
import { ConfirmDialog } from './ConfirmDialog';
import './GroupsPanel.css';

interface Props {
  groups: Group[];
  bookmarks: Bookmark[];
  /** Id of the virtual "loose bookmarks" group (the bookmarks bar itself);
   *  cannot be renamed or deleted. Also used as the target parentId when
   *  a group is dropped at the top level. */
  protectedId: string | null;
  /** User-picked hue overrides; any group missing from the map uses its
   *  auto-assigned hash hue. */
  hueOverrides: Record<string, number>;
  /** Current group focus id. Unlike hover/pin preview, this dims the graph to
   *  the group's subtree and persists when the panel is folded. */
  focusedId: string | null;
  /** Whenever the effective "active group" changes (hover or pin), this is
   *  fired so the canvas can highlight the corresponding hull. Hover takes
   *  priority over pin so the user can still explore other groups while
   *  keeping a pinned anchor as fallback. */
  onActiveChange: (id: string | null) => void;
  onFocusChange: (id: string | null) => void;
  onRename: (id: string, next: string) => void;
  onDelete: (id: string) => void;
  onChangeHue: (id: string, hue: number) => void;
  onResetHue: (id: string) => void;
  /** Move a group to `dest` using chrome.bookmarks.move semantics:
   *    - `parentId`: the real bookmark-tree parent id. For top-level drops,
   *      callers pass `protectedId` (the bookmarks-bar id).
   *    - `index`: 0-based insertion position within the destination
   *      siblings, already adjusted for remove-then-insert behaviour. */
  onMove: (id: string, dest: { parentId: string; index: number }) => void;

  /** Inline-create state, lifted so canvas right-click can also trigger it. */
  creating: boolean;
  onCreatingChange: (next: boolean) => void;
  onCommitCreate: (name: string) => Promise<void> | void;
  /** Auto-picked hue for the new-group swatch — kept in sync by the parent
   *  so it stays distinct from existing groups even if hues change. */
  nextHue: number;
}

type DropZone = 'before' | 'inside' | 'after';

/**
 * Inline list of bookmark folders ("groups"). Two-level active state:
 *  - hover any row → preview that group on canvas
 *  - click row label → "pin" it; preview persists when the cursor leaves
 *  - click the pinned row again → unpin
 * Hover always wins for transient previews, with pin as the fallback.
 *
 * Action buttons (rename / delete) are hidden until row hover/focus so the
 * idle list reads quietly. Delete uses an in-app ConfirmDialog instead of
 * the native `window.confirm`. New-group flow is fully inline; a row at
 * the bottom turns into an editable input on demand.
 *
 * Rows are drag-handle reorderable — grip on the left initiates a native
 * HTML5 drag, a colored bar indicates the drop point. Protected rows can
 * neither be dragged nor dropped onto.
 */
export function GroupsPanel({
  groups,
  bookmarks,
  protectedId,
  hueOverrides,
  focusedId,
  onActiveChange,
  onFocusChange,
  onRename,
  onDelete,
  onChangeHue,
  onResetHue,
  onMove,
  creating,
  onCreatingChange,
  onCommitCreate,
  nextHue,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    zone: DropZone;
  } | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Group | null>(null);
  const [inlineName, setInlineName] = useState('');

  // Effective active = hover wins for previews, pin acts as the fallback.
  const effectiveActive = hoveredId ?? pinnedId;
  useEffect(() => {
    onActiveChange(effectiveActive);
  }, [effectiveActive, onActiveChange]);

  useEffect(() => {
    return () => onActiveChange(null);
  }, [onActiveChange]);

  // Drop pin if the pinned group disappears (renamed/deleted by an
  // out-of-band edit, e.g. via the Chrome bookmarks UI).
  useEffect(() => {
    if (pinnedId && !groups.some((g) => g.id === pinnedId)) setPinnedId(null);
  }, [groups, pinnedId]);

  // Reset the inline name field whenever the create flow toggles off.
  useEffect(() => {
    if (!creating) setInlineName('');
  }, [creating]);

  const countFor = (id: string) =>
    bookmarks.filter((b) => b.parentId === id).length;

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

  const requestDelete = (g: Group) => {
    setPendingDelete(g);
  };

  const confirmDeleteMessage = (g: Group) => {
    const n = countFor(g.id);
    const childFolders = groups.filter((x) => x.parentGroupId === g.id).length;
    if (childFolders > 0) {
      return `“${g.label}”包含 ${childFolders} 个子分组和 ${n} 个书签，删除后会一并移除。`;
    }
    if (n === 0) {
      return `确认删除分组“${g.label}”？`;
    }
    return `“${g.label}”包含 ${n} 个书签，删除后会一同移除。`;
  };

  const togglePin = (id: string) => {
    setPinnedId((prev) => (prev === id ? null : id));
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

  const submitInline = async () => {
    const name = inlineName.trim();
    if (!name) return;
    await onCommitCreate(name);
    // Parent toggles `creating` off; the useEffect clears `inlineName`.
  };

  return (
    <div>
      {groups.map((g) => {
        const isProtected = g.id === protectedId;
        const isHovered = g.id === hoveredId;
        const isPinned = g.id === pinnedId;
        const isFocused = g.id === focusedId;
        const isActiveRow = isHovered || isPinned || isFocused;
        const isEditing = g.id === editingId;
        const isDragging = g.id === dragId;
        const hasOverride = g.id in hueOverrides;
        const hue = hueOverrides[g.id] ?? folderHue(g.id);
        const indicator = dropTarget?.id === g.id ? dropTarget.zone : null;
        const dataState = isFocused
          ? 'focused'
          : isPinned
            ? 'pinned'
            : isHovered
              ? 'hover'
              : 'idle';
        return (
          <div
            key={g.id}
            className="groups-row"
            data-state={dataState}
            data-depth={g.depth}
            draggable={!isProtected && !isEditing}
            onDragStart={(e) => onRowDragStart(e, g)}
            onDragOver={(e) => onRowDragOver(e, g)}
            onDrop={(e) => onRowDrop(e, g)}
            onDragEnd={resetDrag}
            onMouseEnter={() => setHoveredId(g.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              // Indent nested folders so the tree is legible. 14px per level
              // matches the grip icon width.
              paddingLeft: 8 + g.depth * 14,
              background:
                indicator === 'inside'
                  ? `oklch(0.62 0.15 ${hue} / 0.18)`
                  : isActiveRow
                    ? 'var(--bg-2)'
                    : 'transparent',
              borderColor:
                indicator === 'inside'
                  ? `oklch(0.62 0.15 ${hue} / 0.6)`
                  : isFocused
                    ? `oklch(0.62 0.15 ${hue} / 0.62)`
                  : isPinned
                    ? `oklch(0.62 0.15 ${hue} / 0.55)`
                    : isHovered
                      ? `oklch(0.62 0.15 ${hue} / 0.32)`
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
                className="groups-row__label"
                onClick={() => !isProtected && togglePin(g.id)}
                onDoubleClick={() => !isProtected && setEditingId(g.id)}
                style={isProtected ? { cursor: 'default' } : undefined}
                title={
                  isProtected
                    ? '书签栏根分组不可编辑'
                    : isPinned
                      ? '点击取消固定（双击重命名）'
                      : '点击固定预览（双击重命名）'
                }
              >
                {g.label}
              </span>
            )}
            <span className="mono" style={s.count}>
              {countFor(g.id)}
            </span>
            {!isEditing && (
              <span className="groups-row__actions">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocusChange(isFocused ? null : g.id);
                  }}
                  className="groups-row__icon-btn groups-row__icon-btn--focus"
                  title={isFocused ? '退出分组聚焦' : '聚焦分组'}
                  aria-label={isFocused ? '退出分组聚焦' : '聚焦分组'}
                  aria-pressed={isFocused}
                >
                  <FocusIcon />
                </button>
                {!isProtected && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditingId(g.id)}
                      className="groups-row__icon-btn"
                      title="重命名"
                      aria-label="重命名"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(g)}
                      className="groups-row__icon-btn groups-row__icon-btn--danger"
                      title="删除分组"
                      aria-label="删除分组"
                    >
                      <TrashIcon />
                    </button>
                  </>
                )}
              </span>
            )}
          </div>
        );
      })}

      {creating ? (
        <div
          className="groups-row groups-row--creating"
          data-depth="0"
          style={{ paddingLeft: 8 }}
        >
          <span style={s.gripSpacer} aria-hidden />
          <span
            className="groups-row__hue-swatch"
            style={{ background: `oklch(0.62 0.15 ${nextHue})` }}
            aria-hidden
            title="新分组的预选配色，创建后可在行内修改"
          />
          <input
            autoFocus
            className="groups-row__create-input"
            value={inlineName}
            onChange={(e) => setInlineName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submitInline();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCreatingChange(false);
              }
            }}
            onBlur={() => {
              if (!inlineName.trim()) onCreatingChange(false);
            }}
            placeholder="分组名称，回车创建"
          />
        </div>
      ) : (
        <button
          type="button"
          className="groups-new-btn"
          onClick={() => onCreatingChange(true)}
          disabled={!protectedId}
          title={!protectedId ? '没有可用的书签栏根，无法创建' : ''}
        >
          ＋ 新建分组
        </button>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除分组"
        message={pendingDelete ? confirmDeleteMessage(pendingDelete) : ''}
        danger
        confirmLabel="删除"
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
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

function FocusIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
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
  count: {
    fontSize: 10,
    color: 'var(--fg-3)',
    padding: '2px 6px',
    border: '1px solid var(--line-soft)',
    borderRadius: 999,
    flexShrink: 0,
  },
};
