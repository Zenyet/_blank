import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  title: string;
  /** Body copy. Pass a string for the simple case, or a ReactNode if you
   *  need bold spans / multiple lines / counts inline. */
  message: ReactNode;
  /** When true, the confirm button is rendered in the warn palette. */
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Drop-in replacement for `window.confirm` that matches our visual language.
 * Auto-focuses the confirm button so Enter commits and Escape (handled by
 * Modal) cancels — same muscle memory as the native dialog.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  danger,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Wait a tick so the modal mounts before focusing.
    const id = window.setTimeout(() => confirmRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  return (
    <Modal open={open} onClose={onCancel} title={title} width={380}>
      <div style={s.message}>{message}</div>
      <div className="dialog-actions">
        <button
          onClick={onCancel}
          className="dialog-button dialog-button--ghost"
          type="button"
        >
          {cancelLabel}
        </button>
        <button
          ref={confirmRef}
          onClick={onConfirm}
          className={
            danger
              ? 'dialog-button dialog-button--danger'
              : 'dialog-button dialog-button--primary'
          }
          type="button"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

const s: Record<string, CSSProperties> = {
  message: {
    fontSize: 13,
    color: 'var(--fg-1)',
    lineHeight: 1.55,
  },
};
