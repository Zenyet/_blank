import type { CSSProperties, ReactNode } from 'react';
import { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, width = 420 }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, width }} onClick={(e) => e.stopPropagation()}>
        <div style={s.head}>
          <span style={s.title}>{title}</span>
          <button onClick={onClose} style={s.close} aria-label="关闭">
            ×
          </button>
        </div>
        <div style={s.body}>{children}</div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'oklch(0 0 0 / 0.55)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '18vh',
    zIndex: 300,
  },
  modal: {
    maxWidth: '90vw',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 14,
    boxShadow: 'var(--shadow-lg)',
    overflow: 'hidden',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid var(--line-soft)',
  },
  title: { fontSize: 14, fontWeight: 500, color: 'var(--fg)' },
  close: {
    width: 28,
    height: 28,
    borderRadius: 6,
    color: 'var(--fg-2)',
    fontSize: 18,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
};
