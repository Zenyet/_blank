// Design 1b: Quiet Deck — simplified Command Deck. One focal palette, favicon grid, minimal chrome.
const { useState: useStateQ, useEffect: useEffectQ, useMemo: useMemoQ, useRef: useRefQ } = React;

function QuietDeck() {
  const data = window.NEWTAB_DATA;
  const [query, setQuery] = useStateQ('');
  const [selIdx, setSelIdx] = useStateQ(0);
  const [now, setNow] = useStateQ(new Date());
  const [showPalette, setShowPalette] = useStateQ(false);
  const inputRef = useRefQ(null);

  useEffectQ(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffectQ(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowPalette(true);
        setTimeout(() => inputRef.current?.focus(), 10);
      }
      if (e.key === 'Escape') setShowPalette(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Top 16 bookmarks by visits — the quick-access grid
  const topBookmarks = useMemoQ(() =>
    [...data.bookmarks].sort((a,b) => b.visits - a.visits).slice(0, 16),
  []);

  const commands = useMemoQ(() => {
    const q = query.trim().toLowerCase();
    const bms = data.bookmarks.map(b => ({
      kind: 'open', id: b.id, label: b.name, hint: b.url, data: b,
    }));
    if (!q) return bms.slice(0, 8);
    const searches = [
      { kind: 'search', id: 's-g',  label: `Search Google`,  hint: q },
      { kind: 'search', id: 's-gh', label: `Search GitHub`,  hint: q },
    ];
    const filtered = bms.filter(c => (c.label + ' ' + c.hint).toLowerCase().includes(q));
    return [...filtered, ...searches];
  }, [query]);

  useEffectQ(() => { setSelIdx(0); }, [query]);

  const onKeyPal = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i+1, commands.length-1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(i => Math.max(i-1, 0)); }
    if (e.key === 'Escape')    { setShowPalette(false); }
  };

  const hh = now.getHours();
  const greeting = hh < 5 ? 'up late' : hh < 12 ? 'morning' : hh < 18 ? 'afternoon' : 'evening';
  const timeStr = now.toTimeString().slice(0,5);

  return (
    <div style={qdStyles.root}>
      {/* Minimal heading */}
      <div style={qdStyles.header}>
        <div className="mono" style={qdStyles.time}>{timeStr}</div>
        <div style={qdStyles.hello}>Good {greeting}.</div>
      </div>

      {/* Trigger row (closed state) */}
      {!showPalette && (
        <button style={qdStyles.trigger} onClick={() => { setShowPalette(true); setTimeout(() => inputRef.current?.focus(), 10); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{color:'var(--fg-3)'}}>
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <span style={{color:'var(--fg-3)', fontSize:14, flex:1, textAlign:'left'}}>Search or jump to…</span>
          <span className="kbd">⌘K</span>
        </button>
      )}

      {/* Quick-access favicon grid */}
      <div style={qdStyles.grid}>
        {topBookmarks.map(b => (
          <a key={b.id} href="#" onClick={e=>e.preventDefault()} style={qdStyles.cell}>
            <span className="favicon" style={{background: b.color, width: 44, height: 44, fontSize: 16, borderRadius: 10}}>{b.letter}</span>
            <span style={qdStyles.cellName}>{b.name}</span>
          </a>
        ))}
      </div>

      {/* Bottom: recent (subtle, single row) */}
      <div style={qdStyles.recents}>
        {data.recents.slice(0, 4).map((r, i) => (
          <a key={i} href="#" onClick={e=>e.preventDefault()} style={qdStyles.recentItem}>
            <span className="mono" style={{fontSize:11, color:'var(--fg-3)', width: 36}}>{r.at}</span>
            <span style={{fontSize: 13, color: 'var(--fg-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{r.title}</span>
          </a>
        ))}
      </div>

      {/* Palette overlay */}
      {showPalette && (
        <div style={qdStyles.overlay} onClick={() => setShowPalette(false)}>
          <div style={qdStyles.palette} onClick={e => e.stopPropagation()}>
            <div style={qdStyles.paletteHead}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e=>setQuery(e.target.value)}
                onKeyDown={onKeyPal}
                placeholder="Type a site, command, or question…"
                style={qdStyles.paletteInput}
              />
              <span className="kbd">esc</span>
            </div>
            <div style={qdStyles.paletteList}>
              {commands.slice(0, 7).map((c, i) => (
                <div key={c.id} style={{...qdStyles.paletteRow, ...(i===selIdx ? qdStyles.paletteRowActive : {})}}>
                  {c.kind === 'open' && c.data ? (
                    <span className="favicon" style={{background:c.data.color, width:22, height:22, fontSize:10, borderRadius:5}}>{c.data.letter}</span>
                  ) : (
                    <span style={{width:22, height:22, display:'inline-flex', alignItems:'center', justifyContent:'center', color:'var(--fg-3)'}}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                    </span>
                  )}
                  <span style={qdStyles.rowLabel}>{c.label}</span>
                  <span className="mono" style={qdStyles.rowHint}>{c.hint}</span>
                  {i===selIdx && <span className="kbd">↵</span>}
                </div>
              ))}
              {commands.length === 0 && (
                <div style={{padding: '18px', color: 'var(--fg-3)', fontSize: 13, textAlign:'center'}}>Press Enter to search Google.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const qdStyles = {
  root: { flex: 1, display: 'flex', flexDirection: 'column', padding: '60px 40px 32px', gap: 32, maxWidth: 880, width: '100%', margin: '0 auto', minHeight: 0 },

  header: { display: 'flex', alignItems: 'baseline', gap: 16 },
  time: { fontSize: 56, fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--fg)', fontFeatureSettings: '"tnum" on', lineHeight: 1 },
  hello: { fontSize: 18, color: 'var(--fg-2)', letterSpacing: '-0.01em' },

  trigger: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8 },
  cell: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 6px', borderRadius: 12, textDecoration: 'none', color: 'var(--fg-1)', transition: 'background 0.15s' },
  cellName: { fontSize: 11.5, color: 'var(--fg-2)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' },

  recents: { display: 'flex', flexDirection: 'column', gap: 0, marginTop: 'auto', paddingTop: 20, borderTop: '1px solid var(--line-soft)' },
  recentItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px', textDecoration: 'none', borderRadius: 6 },

  overlay: { position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '18vh', zIndex: 200 },
  palette: { width: 560, maxWidth: '90vw', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' },
  paletteHead: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--line-soft)' },
  paletteInput: { flex: 1, background: 'transparent', border: 0, outline: 'none', fontSize: 15, color: 'var(--fg)' },
  paletteList: { padding: 6 },
  paletteRow: { display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 12, alignItems: 'center', padding: '9px 10px', borderRadius: 8, color: 'var(--fg-1)' },
  paletteRowActive: { background: 'var(--bg-2)', color: 'var(--fg)' },
  rowLabel: { fontSize: 13, fontWeight: 500 },
  rowHint: { fontSize: 11, color: 'var(--fg-3)' },
};

// apply cell hover via CSS (inline styles can't do :hover)
if (!document.getElementById('qd-hover-styles')) {
  const s = document.createElement('style');
  s.id = 'qd-hover-styles';
  s.textContent = `
    [data-qd-cell]:hover { background: var(--bg-1); }
    [data-qd-recent]:hover { background: var(--bg-1); }
  `;
  document.head.appendChild(s);
}

window.QuietDeck = QuietDeck;
