import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { Bookmark } from '../types';
import { faviconCandidates } from '../services/chromeApi';
import { scheduleAfterDocumentLoad } from '../utils/scheduleAfterDocumentLoad';

const FAVICON_ATTEMPT_TIMEOUT_MS = 8000;

interface Props {
  bookmark: Pick<Bookmark, 'url' | 'color' | 'letter' | 'name'>;
  size?: number;
  fontSize?: number;
  radius?: number;
  style?: CSSProperties;
}

/**
 * Color + letter chip with a site-favicon overlay. Favicon URLs are requested
 * only after `load` + a short delay so the tab can leave the "loading" state
 * first; unreachable hosts time out and we try common alternate paths.
 */
export function Favicon({ bookmark, size = 22, fontSize = 10, radius = 5, style }: Props) {
  const [ok, setOk] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const candidates = useMemo(() => faviconCandidates(bookmark.url), [bookmark.url]);
  const src = gateOpen && attempt < candidates.length ? candidates[attempt] : null;

  useEffect(() => {
    setOk(false);
    setAttempt(0);
    setGateOpen(false);
    if (candidates.length === 0) return;
    return scheduleAfterDocumentLoad(() => setGateOpen(true));
  }, [bookmark.url]);

  useEffect(() => {
    if (!src) return;
    const t = window.setTimeout(() => setAttempt((i) => i + 1), FAVICON_ATTEMPT_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [src, attempt]);

  const base: CSSProperties = {
    width: size,
    height: size,
    fontSize,
    borderRadius: radius,
    background: ok ? '#fff' : bookmark.color,
    ...style,
  };

  return (
    <span className="favicon" style={base} aria-label={bookmark.name}>
      {src && (
        <img
          key={`${src}-${attempt}`}
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth >= 8) setOk(true);
            else setAttempt((i) => i + 1);
          }}
          onError={() => setAttempt((i) => i + 1)}
          style={{
            display: ok ? 'block' : 'none',
            width: '72%',
            height: '72%',
            margin: 'auto',
            objectFit: 'contain',
          }}
        />
      )}
      {!ok && <span>{bookmark.letter}</span>}
    </span>
  );
}
