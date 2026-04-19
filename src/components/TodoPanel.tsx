import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Todo } from '../types';
import { copy } from '../i18n';

interface Props {
  todos: Todo[];
  onToggle: (id: string) => void;
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
  /** When true (CommandDeck), the remove button uses a lighter look; WorkspaceDock
   *  uses the same visual, so we don't differentiate for now. */
  accent?: string;
}

/**
 * Shared todo editor used by CommandDeck + WorkspaceDock.
 * - Click checkbox or text to toggle
 * - Hover a row to reveal the × remove button
 * - + 新任务 reveals an inline input (Enter to add, Esc to cancel)
 */
export function TodoPanel({ todos, onToggle, onAdd, onRemove, accent }: Props) {
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const draftRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (drafting) draftRef.current?.focus();
  }, [drafting]);

  const submit = () => {
    const text = draft.trim();
    if (text) onAdd(text);
    setDraft('');
    setDrafting(false);
  };

  return (
    <div>
      {todos.map((t) => (
        <div
          key={t.id}
          style={s.row}
          onMouseEnter={() => setHovered(t.id)}
          onMouseLeave={() => setHovered(null)}
        >
          <div
            onClick={() => onToggle(t.id)}
            style={{
              ...s.checkbox,
              ...(t.done
                ? {
                    background: accent || 'var(--accent)',
                    borderColor: accent || 'var(--accent)',
                  }
                : {}),
            }}
          >
            {t.done && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6l3 3 5-6"
                  stroke="var(--bg)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <span
            onClick={() => onToggle(t.id)}
            style={{
              ...s.text,
              ...(t.done
                ? { textDecoration: 'line-through', color: 'var(--fg-3)' }
                : {}),
            }}
          >
            {t.text}
          </span>
          {hovered === t.id ? (
            <button
              onClick={() => onRemove(t.id)}
              style={s.removeBtn}
              title={copy.command.removeTask}
              aria-label={copy.command.removeTask}
            >
              ×
            </button>
          ) : (
            <span className="mono" style={s.tag}>
              {t.tag}
            </span>
          )}
        </div>
      ))}
      {drafting ? (
        <div style={s.row}>
          <div style={s.checkbox} />
          <input
            ref={draftRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') {
                setDraft('');
                setDrafting(false);
              }
            }}
            placeholder={copy.command.newTaskPlaceholder}
            style={s.input}
          />
        </div>
      ) : (
        <button onClick={() => setDrafting(true)} style={s.add}>
          {copy.command.newTask}
        </button>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 0',
    cursor: 'pointer',
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 5,
    border: '1.5px solid var(--line)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: { flex: 1, fontSize: 13, color: 'var(--fg-1)' },
  tag: {
    fontSize: 10,
    color: 'var(--fg-3)',
    padding: '2px 6px',
    border: '1px solid var(--line-soft)',
    borderRadius: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  removeBtn: {
    width: 20,
    height: 20,
    borderRadius: 5,
    color: 'var(--fg-3)',
    fontSize: 16,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--line-soft)',
    background: 'var(--bg-2)',
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 0,
    outline: 'none',
    fontSize: 13,
    color: 'var(--fg)',
    padding: 0,
  },
  add: {
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
