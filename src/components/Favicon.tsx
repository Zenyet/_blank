import type { CSSProperties } from 'react';
import { useState } from 'react';
import type { Bookmark } from '../types';
import { faviconUrl } from '../services/chromeApi';

interface Props {
  bookmark: Pick<Bookmark, 'url' | 'color' | 'letter' | 'name'>;
  size?: number;
  fontSize?: number;
  radius?: number;
  style?: CSSProperties;
}

/**
 * Color + letter chip with a site-favicon overlay (https://domain/favicon.ico).
 * Falls back to the letter monogram when the favicon is missing or broken.
 */
export function Favicon({ bookmark, size = 22, fontSize = 10, radius = 5, style }: Props) {
  const [ok, setOk] = useState(false);
  const src = faviconUrl(bookmark.url);

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
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth >= 8) setOk(true);
          }}
          onError={() => setOk(false)}
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
