import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onSubmit: (next: string) => void;
  onCancel: () => void;
  style?: CSSProperties;
  placeholder?: string;
}

/**
 * Auto-focused inline text editor. Enter submits, Escape cancels, blur submits.
 */
export function InlineEdit({ value, onSubmit, onCancel, style, placeholder }: Props) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const submit = () => {
    const t = text.trim();
    if (!t) onCancel();
    else if (t === value) onCancel();
    else onSubmit(t);
  };

  return (
    <input
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      placeholder={placeholder}
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--accent)',
        borderRadius: 4,
        padding: '2px 6px',
        outline: 'none',
        color: 'var(--fg)',
        font: 'inherit',
        fontSize: 'inherit',
        ...style,
      }}
    />
  );
}
