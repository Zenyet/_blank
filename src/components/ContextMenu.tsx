import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Clamp to viewport.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const px = Math.min(x, vw - 200);
  const py = Math.min(y, vh - items.length * 32 - 16);

  return (
    <div ref={ref} style={{ ...s.menu, left: px, top: py }}>
      {items.map((it, i) => (
        <button
          key={i}
          onClick={() => {
            if (it.disabled) return;
            it.onClick();
            onClose();
          }}
          disabled={it.disabled}
          style={{
            ...s.item,
            color: it.disabled
              ? 'var(--fg-3)'
              : it.danger
                ? 'oklch(0.72 0.18 25)'
                : 'var(--fg-1)',
            cursor: it.disabled ? 'default' : 'pointer',
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  menu: {
    position: 'fixed',
    zIndex: 400,
    minWidth: 160,
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: 4,
    boxShadow: 'var(--shadow-lg)',
  },
  item: {
    display: 'block',
    width: '100%',
    padding: '7px 10px',
    textAlign: 'left',
    fontSize: 13,
    borderRadius: 5,
    color: 'var(--fg-1)',
  },
};
