import { useEffect, useMemo, useRef, useState } from 'react';
import type { Group } from '../types';
import { folderHue } from '../designs/Graph/folderHue';
import './GroupSelect.css';

interface Props {
  value: string;
  groups: Group[];
  looseGroupId?: string | null;
  hueOverrides?: Record<string, number>;
  onChange: (id: string) => void;
}

interface Option {
  id: string;
  label: string;
  meta: string;
  depth: number;
  hue: number | null;
  loose: boolean;
}

export function GroupSelect({
  value,
  groups,
  looseGroupId,
  hueOverrides,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const options = useMemo<Option[]>(() => {
    const byId = new Map(groups.map((g) => [g.id, g] as const));
    const rows: Option[] = [];
    if (looseGroupId) {
      rows.push({
        id: looseGroupId,
        label: '未分组',
        meta: '书签栏直属',
        depth: 0,
        hue: null,
        loose: true,
      });
    }
    for (const g of groups) {
      const parentLabel = g.parentGroupId
        ? byId.get(g.parentGroupId)?.label ?? '子分组'
        : '顶层分组';
      rows.push({
        id: g.id,
        label: g.label,
        meta: parentLabel,
        depth: g.depth,
        hue: hueOverrides?.[g.id] ?? folderHue(g.id),
        loose: false,
      });
    }
    return rows;
  }, [groups, hueOverrides, looseGroupId]);

  const selected = options.find((o) => o.id === value) ?? options[0] ?? null;

  useEffect(() => {
    if (!open) return;
    const selectedIndex = Math.max(0, options.findIndex((o) => o.id === value));
    setActiveIndex(selectedIndex);
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (options.length === 0) return;
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const active = options[activeIndex];
      if (active) choose(active.id);
    }
  };

  return (
    <div className="group-select" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="group-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="bookmark-group-select-list"
        disabled={options.length === 0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        <GroupMark option={selected} />
        <span className="group-select__main">
          <span className="group-select__label">
            {selected?.label ?? '没有可选分组'}
          </span>
          {selected && <span className="group-select__meta">{selected.meta}</span>}
        </span>
        <ChevronIcon />
      </button>

      {open && (
        <div
          id="bookmark-group-select-list"
          className="group-select__menu"
          role="listbox"
          aria-label="选择书签分组"
        >
          {options.length > 0 ? (
            options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === value}
                data-active={index === activeIndex}
                className="group-select__option"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option.id)}
                style={{ paddingLeft: 8 + option.depth * 14 }}
              >
                <GroupMark option={option} />
                <span className="group-select__main">
                  <span className="group-select__label">{option.label}</span>
                  <span className="group-select__meta">{option.meta}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="group-select__empty">没有可用分组</div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupMark({ option }: { option: Option | null }) {
  if (!option || option.loose || option.hue === null) {
    return <span className="group-select__mark group-select__mark--loose" aria-hidden />;
  }
  return (
    <span
      className="group-select__mark"
      style={{ background: `oklch(0.62 0.15 ${option.hue})` }}
      aria-hidden
    />
  );
}

function ChevronIcon() {
  return (
    <svg
      className="group-select__chevron"
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
