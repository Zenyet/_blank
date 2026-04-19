import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import type { Group } from '../types';
import { copy } from '../i18n';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: { name: string; url: string; groupId: string };
  groups: Group[];
  defaultGroupId?: string;
  onCancel: () => void;
  onSubmit: (values: { name: string; url: string; groupId: string }) => void;
}

export function BookmarkDialog({
  open,
  mode,
  initial,
  groups,
  defaultGroupId,
  onCancel,
  onSubmit,
}: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [groupId, setGroupId] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setUrl(initial?.url ?? '');
    setGroupId(initial?.groupId ?? defaultGroupId ?? groups[0]?.id ?? '');
  }, [open, initial, defaultGroupId, groups]);

  const valid = url.trim().length > 3 && groupId;

  const submit = () => {
    if (!valid) return;
    let finalUrl = url.trim();
    if (!/^https?:\/\//.test(finalUrl)) finalUrl = `https://${finalUrl}`;
    onSubmit({
      name: name.trim() || new URL(finalUrl).hostname,
      url: finalUrl,
      groupId,
    });
  };

  const title = mode === 'create' ? copy.workspace.addBookmarkTitle : copy.workspace.editBookmarkTitle;

  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <Field label={copy.workspace.bookmarkUrl}>
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          style={s.input}
        />
      </Field>
      <Field label={copy.workspace.bookmarkName}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Example"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          style={s.input}
        />
      </Field>
      <Field label={copy.workspace.bookmarkGroup}>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          style={s.input}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </Field>
      <div style={s.actions}>
        <button onClick={onCancel} style={s.btnGhost}>
          {copy.workspace.cancel}
        </button>
        <button onClick={submit} disabled={!valid} style={valid ? s.btnPrimary : s.btnDisabled}>
          {copy.workspace.ok}
        </button>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={s.label}>{label}</span>
      {children}
    </label>
  );
}

const s: Record<string, CSSProperties> = {
  label: {
    fontSize: 11,
    color: 'var(--fg-2)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  input: {
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '8px 10px',
    color: 'var(--fg)',
    outline: 'none',
    fontSize: 13,
    width: '100%',
  },
  actions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 },
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
};
