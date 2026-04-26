import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Bookmark,
  ChromeData,
  GraphEdge,
  Group,
  PinsMap,
  Settings,
} from "../../types";
import { BookmarkDialog } from "../../components/BookmarkDialog";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";
import { Favicon } from "../../components/Favicon";
import { GroupsPanel } from "../../components/GroupsPanel";
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
} from "../../services/chromeApi";
import {
  clearGroupHue,
  loadGroupHues,
  setGroupHue,
  subscribeGroupHues,
} from "../../services/groupHues";
import {
  getSearchProvider,
  searchUrlForSettings,
} from "../../services/searchProviders";
import { copy } from "../../i18n";
import "./graph-hud.css";
import { folderHue } from "./folderHue";
import { GraphCanvas } from "./GraphCanvas";
import {
  addEdge as addEdgeFn,
  cleanOrphans as cleanOrphanEdges,
  loadEdges,
  removeEdge as removeEdgeFn,
  saveEdges,
} from "./edges";
import { focusNeighborhood as computeFocusNeighborhood } from "./focusNeighborhood";
import { groupMembers } from "./groupMembers";
import { cleanOrphanPins, loadPins, savePins, setPin, unsetPin } from "./pins";
import { suggestRelated } from "./relationSuggest";

interface Props {
  data: ChromeData;
  settings: Settings;
}

export function Graph({ data, settings }: Props) {
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [pins, setPins] = useState<PinsMap>({});
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [inlineCreating, setInlineCreating] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupHues, setGroupHues] = useState<Record<string, number>>({});
  // Local-graph focus: when set, the canvas dims everything outside the
  // node's BFS neighborhood (depth 1 over manual edges). Entered via the
  // bookmark right-click menu or Alt+click; exited via ESC, the chip ×,
  // or selecting "退出聚焦" in the menu.
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  // Folder-subtree focus: dims the canvas to bookmarks under the selected
  // group (including descendants). This gives groups a real focus affordance
  // without stealing the hue swatch's color-picker click target.
  const [focusedGroupId, setFocusedGroupId] = useState<string | null>(null);
  const [bmMenu, setBmMenu] = useState<{
    x: number;
    y: number;
    id: string;
    worldPos: { x: number; y: number };
  } | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<{
    x: number;
    y: number;
    id: string;
  } | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
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

  // Drop group focus if the focused group was deleted elsewhere.
  useEffect(() => {
    if (focusedGroupId && !data.groups.some((g) => g.id === focusedGroupId)) {
      setFocusedGroupId(null);
    }
  }, [data.groups, focusedGroupId]);

  // Drop focus mode if the focused bookmark was deleted.
  useEffect(() => {
    if (focusedNodeId && !data.bookmarks.some((b) => b.id === focusedNodeId)) {
      setFocusedNodeId(null);
    }
  }, [data.bookmarks, focusedNodeId]);

  // BFS over manual edges from the focused node, depth 1. `null` while not
  // focused so the renderer can short-circuit.
  const focusNeighborhood = useMemo(() => {
    if (!focusedNodeId) return null;
    return computeFocusNeighborhood(edges, focusedNodeId, 1);
  }, [focusedNodeId, edges]);

  const groupFocusMembers = useMemo(() => {
    if (!focusedGroupId) return null;
    return groupMembers(focusedGroupId, data.groups, data.bookmarks);
  }, [focusedGroupId, data.groups, data.bookmarks]);

  const canvasFocusSet = focusedNodeId ? focusNeighborhood : groupFocusMembers;
  const canvasFocusKind = focusedNodeId ? "node" : focusedGroupId ? "group" : null;

  const focusedBookmark = useMemo(
    () => (focusedNodeId ? data.bookmarks.find((b) => b.id === focusedNodeId) ?? null : null),
    [focusedNodeId, data.bookmarks]
  );

  const focusedGroup = useMemo(
    () => (focusedGroupId ? data.groups.find((g) => g.id === focusedGroupId) ?? null : null),
    [focusedGroupId, data.groups]
  );

  const highlightedGroupId = activeGroupId ?? focusedGroupId;
  const highlightedGroupMembers = useMemo(() => {
    if (!highlightedGroupId) return null;
    return groupMembers(highlightedGroupId, data.groups, data.bookmarks);
  }, [highlightedGroupId, data.groups, data.bookmarks]);
  const highlightedGroupHue =
    highlightedGroupId == null
      ? null
      : groupHues[highlightedGroupId] ?? folderHue(highlightedGroupId);

  // Curated host-cluster suggestions: same-cluster bookmarks not yet linked
  // to the focused node. Empty for niche hosts — the strip then disappears.
  const focusSuggestions = useMemo(
    () => (focusedBookmark ? suggestRelated(focusedBookmark, data.bookmarks, edges, 4) : []),
    [focusedBookmark, data.bookmarks, edges]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key === "/" && !typing) {
        e.preventDefault();
        filterRef.current?.focus();
      }
      // Power-user: Cmd/Ctrl + K focuses the search from anywhere, even
      // while another input has focus (common command-palette contract).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        filterRef.current?.focus();
        filterRef.current?.select();
      }
      if (e.key === "Escape") {
        if (bmMenu) setBmMenu(null);
        else if (edgeMenu) setEdgeMenu(null);
        else if (canvasMenu) setCanvasMenu(null);
        else if (groupsOpen) setGroupsOpen(false);
        else if (focusedNodeId) setFocusedNodeId(null);
        else if (focusedGroupId) setFocusedGroupId(null);
        else if (typing) {
          (document.activeElement as HTMLElement).blur();
          setFilter("");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bmMenu, edgeMenu, canvasMenu, groupsOpen, focusedNodeId, focusedGroupId]);

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

  const buildBookmarkMenu = (
    id: string,
    worldPos: { x: number; y: number },
  ): MenuItem[] => {
    const bm = data.bookmarks.find((b) => b.id === id);
    if (!bm) return [];
    const isPinned = !!pins[id];
    const isFocused = focusedNodeId === id;
    return [
      { label: "在新标签页打开", onClick: () => openUrl(bm.url) },
      {
        label: copy.workspace.editBookmarkTitle + "…",
        onClick: () => setEditing(bm),
      },
      {
        label: isFocused ? "退出聚焦" : "聚焦此节点",
        onClick: () => {
          setFocusedGroupId(null);
          setFocusedNodeId(isFocused ? null : id);
        },
      },
      {
        label: isPinned ? "取消固定" : "固定位置",
        onClick: () => onPinToggle(id, worldPos.x, worldPos.y),
      },
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
        label: "删除连接",
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
      {
        label: "+ " + copy.workspace.addBookmark,
        onClick: () => setAdding(true),
      },
      {
        label: "+ " + copy.workspace.newFolder,
        disabled: !data.barId,
        onClick: () => {
          // Same right-click affordance as before, but the editor lives in
          // the panel now — open it and prime its inline create row.
          setGroupsOpen(true);
          setInlineCreating(true);
        },
      },
      {
        label: "分组管理…",
        onClick: () => setGroupsOpen(true),
      },
    ];
  };

  // Pre-pick a pleasant hue that isn't already used by any existing folder
  // so the inline-create swatch reads as "fresh" the moment it appears.
  const nextHue = useMemo(() => {
    const used = new Set(
      data.groups.map((g) => Math.round(groupHues[g.id] ?? folderHue(g.id))),
    );
    const options = [200, 330, 150, 55, 290, 95, 15, 250];
    return options.find((h) => !used.has(h)) ?? 200;
  }, [data.groups, groupHues]);

  const handleCommitCreate = async (name: string) => {
    if (!data.barId) return;
    const newId = await createFolder(data.barId, name);
    // If the auto-picked hue differs from the hash-derived default, persist
    // it so the new group inherits its preselected color.
    if (newId && Math.round(nextHue) !== folderHue(newId)) {
      await setGroupHue(newId, nextHue);
    }
    setInlineCreating(false);
  };

  const setGroupFocus = (id: string | null) => {
    setFocusedNodeId(null);
    setFocusedGroupId(id);
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
    if (!filterQuery)
      return {
        matchSet: null as Set<string> | null,
        matchList: [] as Bookmark[],
      };
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

  // Sort matches by visit count so the "best" bookmark surfaces at the top
  // of the command-palette dropdown and becomes the default selection.
  const rankedMatches = useMemo(
    () => [...matchList].sort((a, b) => b.visits - a.visits),
    [matchList]
  );
  const MAX_RESULTS = 8;
  const visibleMatches = rankedMatches.slice(0, MAX_RESULTS);

  const [selectedIdx, setSelectedIdx] = useState(0);
  useEffect(() => {
    setSelectedIdx(0);
  }, [filterQuery]);

  const selectedMatch =
    visibleMatches.length > 0
      ? visibleMatches[Math.min(selectedIdx, visibleMatches.length - 1)] ?? null
      : null;
  const fallbackSearchProvider = getSearchProvider(settings);

  // Camera follows the currently-selected dropdown row. Typing narrows the
  // list (selected defaults to the top-ranked match) and arrow keys move
  // the camera across candidates, tying the command palette to the graph.
  // The canvas dedupes by id, so repeat selections don't re-animate.
  const focusMatch = selectedMatch;

  const resultsListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = resultsListRef.current;
    if (!list) return;
    const el = list.children[selectedIdx] as HTMLElement | undefined;
    if (!el) return;
    const top = el.offsetTop;
    const bot = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bot > list.scrollTop + list.clientHeight)
      list.scrollTop = bot - list.clientHeight;
  }, [selectedIdx]);

  const openMatch = (bm: Bookmark) => {
    openUrl(bm.url, settings.openInNewTab);
    setFilter("");
    filterRef.current?.focus();
  };

  const openSearchFallback = () => {
    if (!filterQuery) return;
    openUrl(searchUrlForSettings(filter.trim(), settings), settings.openInNewTab);
    setFilter("");
    filterRef.current?.focus();
  };

  const onFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!filterQuery) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedMatch) openMatch(selectedMatch);
      else openSearchFallback();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) =>
        visibleMatches.length > 0
          ? Math.min(visibleMatches.length - 1, i + 1)
          : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(0, i - 1));
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
        focusBookmarkId={focusedNodeId ?? (focusedGroupId ? null : focusMatch?.id ?? null)}
        focusNeighborhood={canvasFocusSet}
        focusKind={canvasFocusKind}
        focusGroupId={focusedGroupId}
        highlightGroupId={highlightedGroupId}
        highlightGroupMembers={highlightedGroupMembers}
        highlightGroupHue={highlightedGroupHue}
        hueOverrides={groupHues}
        reduceMotion={settings.reduceMotion}
        onRequestEdge={onRequestEdge}
        onOpenBookmark={(id) => {
          const bm = data.bookmarks.find((b) => b.id === id);
          if (bm) openUrl(bm.url, settings.openInNewTab);
        }}
        onBookmarkMenu={(x, y, id, worldPos) =>
          setBmMenu({ x, y, id, worldPos })
        }
        onEdgeMenu={(x, y, id) => setEdgeMenu({ x, y, id })}
        onCanvasMenu={(x, y) => setCanvasMenu({ x, y })}
        onFocusNode={(id) => {
          setFocusedGroupId(null);
          setFocusedNodeId(id);
        }}
      />

      {/* Floating toolbar + command palette results panel */}
      <div className="graph-hud-wrap">
        <div
          className="graph-floating-toolbar"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={filterQuery.length > 0}
        >
          <div className="graph-search-field">
            <span className="graph-search-ico" aria-hidden>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="6.5" />
                <path d="M20.5 20.5 16.2 16.2" />
              </svg>
            </span>
            <input
              ref={filterRef}
              className="graph-search-input"
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={onFilterKeyDown}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={copy.constellation.filterPlaceholder}
              aria-label={copy.constellation.filterPlaceholder}
              aria-controls="graph-results-panel"
              aria-autocomplete="list"
            />
            {filter.length > 0 && (
              <button
                type="button"
                className="graph-search-clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setFilter("");
                  filterRef.current?.focus();
                }}
                aria-label="清除搜索"
              >
                <ClearSearchIcon />
              </button>
            )}
            <div className="graph-search-trail" aria-hidden>
              <span
                className="graph-search-shortcut"
                title={filterQuery ? "回车打开" : "按 / 聚焦搜索"}
              >
                {filterQuery ? (
                  <kbd className="graph-kbd graph-kbd--icon">
                    <EnterKeyIcon title="" />
                  </kbd>
                ) : (
                  <kbd className="graph-kbd">/</kbd>
                )}
              </span>
            </div>
          </div>

          <div className="graph-toolbar-sep" aria-hidden />

          <ToolButton
            title={copy.workspace.addBookmark}
            onClick={() => setAdding(true)}
          >
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

        {focusedBookmark && (
          <div
            className="graph-focus-chip"
            role="status"
            aria-live="polite"
          >
            <span className="graph-focus-chip__label">已聚焦</span>
            <Favicon
              bookmark={focusedBookmark}
              size={18}
              fontSize={9}
              radius={5}
            />
            <span className="graph-focus-chip__name" title={focusedBookmark.url}>
              {focusedBookmark.name}
            </span>
            <span
              className="graph-focus-chip__count"
              title="本地图节点数（含自身）"
            >
              {focusNeighborhood?.size ?? 1}
            </span>
            <button
              type="button"
              className="graph-focus-chip__close"
              onClick={() => setFocusedNodeId(null)}
              aria-label="退出聚焦"
              title="退出聚焦 (Esc)"
            >
              <ClearSearchIcon />
            </button>
          </div>
        )}

        {focusedGroup && (
          <div
            className="graph-focus-chip graph-focus-chip--group"
            role="status"
            aria-live="polite"
          >
            <span className="graph-focus-chip__label">分组聚焦</span>
            <span
              className="graph-focus-chip__swatch"
              style={{ background: `oklch(0.62 0.15 ${groupHues[focusedGroup.id] ?? folderHue(focusedGroup.id)})` }}
              aria-hidden
            />
            <span className="graph-focus-chip__name" title={focusedGroup.label}>
              {focusedGroup.label}
            </span>
            <span
              className="graph-focus-chip__count"
              title="分组内书签数（含子分组）"
            >
              {groupFocusMembers?.size ?? 0}
            </span>
            <button
              type="button"
              className="graph-focus-chip__close"
              onClick={() => setFocusedGroupId(null)}
              aria-label="退出分组聚焦"
              title="退出分组聚焦 (Esc)"
            >
              <ClearSearchIcon />
            </button>
          </div>
        )}

        {focusedBookmark && focusSuggestions.length > 0 && (
          <div className="graph-focus-suggest" role="group" aria-label="建议关联">
            <span className="graph-focus-suggest__label">建议关联</span>
            {focusSuggestions.map((b) => (
              <button
                key={b.id}
                type="button"
                className="graph-focus-suggest__pill"
                onClick={() => onRequestEdge(focusedBookmark.id, b.id)}
                title={`与 ${b.name} 建立关联`}
              >
                <Favicon bookmark={b} size={16} fontSize={9} radius={4} />
                <span className="graph-focus-suggest__name">{b.name}</span>
                <span className="graph-focus-suggest__plus" aria-hidden>
                  +
                </span>
              </button>
            ))}
          </div>
        )}

        {filterQuery && (
          <div
            id="graph-results-panel"
            className="graph-results-panel"
            role="listbox"
            aria-label="搜索结果"
          >
            <div
              className="graph-results-list"
              ref={resultsListRef}
              onMouseDown={(e) => e.preventDefault()}
            >
              {visibleMatches.length > 0 ? (
                visibleMatches.map((b, i) => (
                  <button
                    key={b.id}
                    type="button"
                    role="option"
                    aria-selected={i === selectedIdx}
                    className="graph-results-item"
                    onMouseEnter={() => setSelectedIdx(i)}
                    onClick={() => openMatch(b)}
                  >
                    <Favicon
                      bookmark={b}
                      size={24}
                      fontSize={11}
                      radius={6}
                    />
                    <span className="graph-results-body">
                      <HighlightedName text={b.name} query={filterQuery} />
                      <span className="graph-results-domain">
                        {domainOf(b.url)}
                      </span>
                    </span>
                    <span className="graph-results-enterhint" aria-hidden>
                      <EnterKeyIcon title="" />
                    </span>
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  role="option"
                  aria-selected
                  className="graph-results-item graph-results-item--fallback"
                  onClick={openSearchFallback}
                >
                  <span
                    className={
                      fallbackSearchProvider.id === "google"
                        ? "graph-results-favicon graph-results-favicon--google"
                        : "graph-results-favicon graph-results-favicon--provider"
                    }
                  >
                    {fallbackSearchProvider.id === "google" ? (
                      <GoogleIcon />
                    ) : (
                      <SearchProviderIcon kind={fallbackSearchProvider.kind} />
                    )}
                  </span>
                  <span className="graph-results-body">
                    <span className="graph-results-name">
                      {fallbackSearchProvider.kind === "ask" ? "向" : "用"}{" "}
                      {fallbackSearchProvider.label}
                      {fallbackSearchProvider.kind === "ask"
                        ? " 提问 "
                        : " 搜索 "}
                      "<em>{filter.trim()}</em>"
                    </span>
                  </span>
                  <span className="graph-results-enterhint" aria-hidden>
                    <EnterKeyIcon title="" />
                  </span>
                </button>
              )}
            </div>
            <div className="graph-results-footer">
              <span title="打开">
                <kbd className="graph-kbd graph-kbd--icon">
                  <EnterKeyIcon title="" />
                </kbd>
                打开
              </span>
              <span title="上下选择">
                <kbd className="graph-kbd">↑</kbd>
                <kbd className="graph-kbd">↓</kbd>
                选择
              </span>
              <span title="清空">
                <kbd className="graph-kbd">esc</kbd>
                清空
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Floating bottom strip — also overlays, so canvas runs full bleed. */}
      {settings.showStrip && (
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
                    onClick={() => openUrl(b.url, settings.openInNewTab)}
                  >
                    <Favicon
                      bookmark={b}
                      size={20}
                      fontSize={9}
                      radius={5}
                    />
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
                  onClick={() => openUrl(r.url, settings.openInNewTab)}
                >
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: "var(--fg-3)" }}
                  >
                    {r.at}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      maxWidth: 180,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
          editing
            ? {
                name: editing.name,
                url: editing.url,
                groupId: editing.parentId,
              }
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

      <div
        className={
          groupsOpen
            ? "graph-groups-dock graph-groups-dock--open"
            : "graph-groups-dock graph-groups-dock--rail"
        }
      >
        {groupsOpen ? (
          <div className="graph-groups-panel">
            <div className="graph-groups-panel__head">
              <span className="graph-groups-panel__title">分组管理</span>
              <span className="graph-groups-panel__count">
                {data.groups.length} 个分组
              </span>
              <button
                type="button"
                onClick={() => setGroupsOpen(false)}
                className="graph-groups-panel__collapse"
                aria-label="折叠分组面板"
                title="折叠"
              >
                <ChevronRightIcon />
              </button>
            </div>
            <div className="graph-groups-panel__body">
              <GroupsPanel
                groups={data.groups}
                bookmarks={data.bookmarks}
                protectedId={data.barId}
                hueOverrides={groupHues}
                focusedId={focusedGroupId}
                onActiveChange={setActiveGroupId}
                onFocusChange={setGroupFocus}
                onRename={(id, next) => void renameFolder(id, next)}
                onDelete={(id) => void removeFolder(id)}
                onChangeHue={(id, hue) => void setGroupHue(id, hue)}
                onResetHue={(id) => void clearGroupHue(id)}
                onMove={(id, dest) => void moveFolder(id, dest)}
                creating={inlineCreating}
                onCreatingChange={setInlineCreating}
                onCommitCreate={handleCommitCreate}
                nextHue={nextHue}
              />
            </div>
          </div>
        ) : (
          <div className="graph-groups-rail" aria-label="分组管理">
            <button
              type="button"
              className="graph-groups-rail__main"
              onClick={() => setGroupsOpen(true)}
              aria-label="展开分组面板"
              title="展开分组面板"
            >
              <FolderIcon />
              <span className="graph-groups-rail__badge">{data.groups.length}</span>
            </button>
            {focusedGroup && (
              <button
                type="button"
                className="graph-groups-rail__focus"
                onClick={() => setFocusedGroupId(null)}
                aria-label={`退出分组聚焦：${focusedGroup.label}`}
                title={`退出分组聚焦：${focusedGroup.label}`}
              >
                <span
                  className="graph-groups-rail__swatch"
                  style={{
                    background: `oklch(0.62 0.15 ${
                      groupHues[focusedGroup.id] ?? folderHue(focusedGroup.id)
                    })`,
                  }}
                  aria-hidden
                />
                <span className="graph-groups-rail__mini-count">
                  {groupFocusMembers?.size ?? 0}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
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

function ToolButton({
  title,
  active,
  badge,
  onClick,
  children,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={
        active ? "graph-tool-btn graph-tool-btn--active" : "graph-tool-btn"
      }
    >
      {children}
      {badge != null && <span className="graph-tool-badge">{badge}</span>}
    </button>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function EnterKeyIcon({
  title: tip,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <span
      className={className}
      title={tip}
      style={{ display: "inline-flex", alignItems: "center" }}
      aria-hidden
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 7v4a3 3 0 0 1-3 3H6" />
        <path d="M9 11l-3 3 3 3" />
      </svg>
    </span>
  );
}

function ClearSearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5Z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.2 4 9.5 8.5 6.3 14.7Z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.6 5.1C9.3 39.6 16 44 24 44Z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C36.9 39.3 44 34 44 24c0-1.3-.1-2.4-.4-3.5Z"
      />
    </svg>
  );
}

function SearchProviderIcon({ kind }: { kind: "search" | "ask" }) {
  if (kind === "ask") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9L10.1 9 12 3.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="m18.5 15.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx="11"
        cy="11"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M20 20 16 16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Renders `text` with the (case-insensitive) `query` span highlighted via
 * <em>. Falls back to plain text when the query isn't literally present (it
 * might still match via other fields like URL or folder). This keeps the
 * dropdown readable while giving the user visual feedback on why each row
 * matched.
 */
function HighlightedName({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <span className="graph-results-name">{text}</span>;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) return <span className="graph-results-name">{text}</span>;
  const pre = text.slice(0, idx);
  const hit = text.slice(idx, idx + q.length);
  const post = text.slice(idx + q.length);
  return (
    <span className="graph-results-name">
      {pre}
      <em>{hit}</em>
      {post}
    </span>
  );
}

const FLOAT_BG = "color-mix(in oklch, var(--bg-1) 72%, transparent)";

const styles: Record<string, CSSProperties> = {
  root: {
    flex: 1,
    position: "relative",
    height: "100vh",
    width: "100%",
    overflow: "hidden",
    display: "flex",
  },
  bottomStrip: {
    position: "absolute",
    bottom: 14,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 20,
    display: "flex",
    alignItems: "stretch",
    gap: 14,
    padding: "8px 12px",
    background: FLOAT_BG,
    backdropFilter: "blur(14px) saturate(160%)",
    WebkitBackdropFilter: "blur(14px) saturate(160%)",
    border: "1px solid var(--line-soft)",
    borderRadius: 12,
    boxShadow: "var(--shadow-sm)",
    maxWidth: "calc(100vw - 40px)",
  },
  stripSection: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  stripLabel: {
    fontSize: 10,
    letterSpacing: "0.15em",
    color: "var(--fg-3)",
    flexShrink: 0,
  },
  stripRow: {
    display: "flex",
    gap: 6,
    overflowX: "auto",
    overflowY: "hidden",
    flex: 1,
    minWidth: 0,
    // Subtle fade on the right edge so chips visibly "run under" the strip.
    maskImage:
      "linear-gradient(to right, black, black calc(100% - 16px), transparent)",
    WebkitMaskImage:
      "linear-gradient(to right, black, black calc(100% - 16px), transparent)",
    scrollbarWidth: "none",
  },
  stripChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid var(--line-soft)",
    background: "var(--bg-2)",
    color: "var(--fg-1)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  stripDiv: { width: 1, background: "var(--line-soft)" },
};
