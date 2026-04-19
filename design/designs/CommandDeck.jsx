// Design 1: Command Deck — no search box; central command palette + frequency heatmap
const { useState, useEffect, useMemo, useRef } = React;

function CommandDeck() {
  const data = window.NEWTAB_DATA;
  const [query, setQuery] = useState('');
  const [selIdx, setSelIdx] = useState(0);
  const [now, setNow] = useState(new Date());
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Bucket bookmarks by frequency for heatmap intensity
  const maxVisits = Math.max(...data.bookmarks.map(b => b.visits));
  const heatLevel = (v) => {
    const r = v / maxVisits;
    if (r > 0.75) return 4;
    if (r > 0.5) return 3;
    if (r > 0.25) return 2;
    if (r > 0.08) return 1;
    return 0;
  };

  // Command palette items (bookmarks + actions + searches)
  const commands = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bms = data.bookmarks.map(b => ({
      kind: 'open', id: b.id, label: b.name, hint: b.url, meta: b.group, data: b,
    }));
    const actions = [
      { kind: 'action', id: 'newdoc', label: 'New Google Doc',   hint: 'docs.new',    meta: 'Quick' },
      { kind: 'action', id: 'newsheet', label: 'New Spreadsheet', hint: 'sheets.new', meta: 'Quick' },
      { kind: 'action', id: 'newmeet',  label: 'New Meet call',   hint: 'meet.new',   meta: 'Quick' },
      { kind: 'action', id: 'incog',    label: 'Incognito window',hint: '⇧⌘N',        meta: 'Quick' },
    ];
    const searches = q ? [
      { kind: 'search', id: 's-g',  label: `Search Google for "${q}"`,  hint: 'google.com',  meta: 'Search' },
      { kind: 'search', id: 's-gh', label: `Search GitHub for "${q}"`,  hint: 'github.com',  meta: 'Search' },
      { kind: 'search', id: 's-yt', label: `Search YouTube for "${q}"`, hint: 'youtube.com', meta: 'Search' },
      { kind: 'search', id: 's-mdn',label: `Search MDN for "${q}"`,     hint: 'developer.mozilla.org', meta: 'Search' },
    ] : [];
    const all = [...searches, ...bms, ...actions];
    if (!q) return all;
    return all.filter(c => (c.label + ' ' + c.hint + ' ' + c.meta).toLowerCase().includes(q));
  }, [query]);

  useEffect(() => { setSelIdx(0); }, [query]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i+1, commands.length-1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(i => Math.max(i-1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); /* would open */ }
  };

  const timeStr = now.toTimeString().slice(0,5);
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Sort bookmarks by visits for the heat ring
  const sortedBms = [...data.bookmarks].sort((a,b) => b.visits - a.visits);

  return (
    <div style={cdStyles.root}>
      {/* Meta strip — top */}
      <div style={cdStyles.metaStrip}>
        <div style={cdStyles.metaLeft}>
          <span className="mono" style={{color:'var(--fg-3)', fontSize: 11, letterSpacing:'0.08em', textTransform:'uppercase'}}>
            Deck · {dateStr}
          </span>
        </div>
        <div style={cdStyles.metaRight}>
          <div style={cdStyles.weatherPill}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'var(--accent)'}}/>
            <span className="mono" style={{fontSize:11}}>{data.weather.city}</span>
            <span className="mono" style={{fontSize:11, color:'var(--fg-2)'}}>{data.weather.temp}°</span>
          </div>
          <div style={cdStyles.weatherPill}>
            <span className="mono" style={{fontSize:11, color:'var(--fg-2)'}}>{timeStr}</span>
          </div>
        </div>
      </div>

      {/* Palette hero */}
      <div style={cdStyles.hero}>
        <div style={cdStyles.timeBlock}>
          <div className="mono" style={cdStyles.bigTime}>{timeStr}</div>
          <div style={cdStyles.greeting}>
            Good {now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}, Jia.
            <span style={{color:'var(--fg-3)'}}> You have <b style={{color:'var(--fg-1)'}}>3 things</b> on today.</span>
          </div>
        </div>

        <div style={cdStyles.palette}>
          <div style={cdStyles.paletteHead}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{color:'var(--fg-2)'}}>
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={e=>setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Type a command, site, or question…"
              style={cdStyles.paletteInput}
            />
            <span className="kbd">⌘K</span>
          </div>
          <div style={cdStyles.paletteList}>
            {commands.slice(0, 6).map((c, i) => (
              <div key={c.id} style={{...cdStyles.paletteRow, ...(i===selIdx ? cdStyles.paletteRowActive : {})}}>
                <span style={cdStyles.rowKind}>
                  {c.kind === 'open' && <Glyph k="open" />}
                  {c.kind === 'search' && <Glyph k="search" />}
                  {c.kind === 'action' && <Glyph k="action" />}
                </span>
                {c.kind === 'open' && c.data ? (
                  <span className="favicon" style={{background:c.data.color, width:18, height:18, fontSize:9, marginRight: 4}}>{c.data.letter}</span>
                ) : null}
                <span style={cdStyles.rowLabel}>{c.label}</span>
                <span className="mono" style={cdStyles.rowHint}>{c.hint}</span>
                <span className="mono" style={cdStyles.rowMeta}>{c.meta}</span>
                {i===selIdx && <span className="kbd">↵</span>}
              </div>
            ))}
            {commands.length === 0 && (
              <div style={{padding: '18px', color: 'var(--fg-3)', fontSize: 13, textAlign:'center'}}>No matches. Press Enter to search Google.</div>
            )}
          </div>
          <div style={cdStyles.paletteFoot}>
            <span style={cdStyles.footItem}><span className="kbd">↑↓</span> navigate</span>
            <span style={cdStyles.footItem}><span className="kbd">↵</span> open</span>
            <span style={cdStyles.footItem}><span className="kbd">⌥↵</span> new tab</span>
            <span style={cdStyles.footItem}><span className="kbd">/</span> filter kind</span>
            <span style={{marginLeft:'auto', color:'var(--fg-3)', fontSize:11}} className="mono">{commands.length} results</span>
          </div>
        </div>
      </div>

      {/* Heat ring of bookmarks */}
      <div style={cdStyles.lowerGrid}>
        <div style={cdStyles.frequency}>
          <div style={cdStyles.sectionHead}>
            <span style={cdStyles.sectionTitle}>Frequency</span>
            <span className="mono" style={cdStyles.sectionSub}>sorted by visits · last 30d</span>
            <div style={cdStyles.heatLegend}>
              {[0,1,2,3,4].map(l => <span key={l} style={{...cdStyles.heatCell, opacity: 0.2 + l*0.18}} />)}
              <span className="mono" style={{fontSize:10, color:'var(--fg-3)', marginLeft:4}}>less → more</span>
            </div>
          </div>
          <div style={cdStyles.heatGrid}>
            {sortedBms.map(b => {
              const lvl = heatLevel(b.visits);
              return (
                <div key={b.id} style={cdStyles.heatItem} title={`${b.name} · ${b.visits} visits`}>
                  <div style={{...cdStyles.heatBar, opacity: 0.25 + lvl * 0.18, background: 'var(--accent)'}} />
                  <span className="favicon" style={{background:b.color, width:26, height:26, fontSize:11}}>{b.letter}</span>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={cdStyles.heatName}>{b.name}</div>
                    <div className="mono" style={cdStyles.heatUrl}>{b.url}</div>
                  </div>
                  <div className="mono" style={cdStyles.heatCount}>{b.visits}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={cdStyles.sidebar}>
          <div style={cdStyles.sideCard}>
            <div style={cdStyles.sideHead}>
              <span>Today</span><span className="mono" style={{color:'var(--fg-3)', fontSize:11}}>3 · 1 done</span>
            </div>
            {data.todos.map((t,i) => (
              <div key={i} style={cdStyles.todoRow}>
                <div style={{...cdStyles.checkbox, ...(t.done ? cdStyles.checkboxDone : {})}}>
                  {t.done && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-6" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span style={{...cdStyles.todoText, ...(t.done ? {textDecoration:'line-through', color:'var(--fg-3)'} : {})}}>{t.text}</span>
                <span className="mono" style={cdStyles.todoTag}>{t.tag}</span>
              </div>
            ))}
            <button style={cdStyles.addTodo}>+ new task</button>
          </div>

          <div style={cdStyles.sideCard}>
            <div style={cdStyles.sideHead}><span>Recent</span><span className="mono" style={{color:'var(--fg-3)', fontSize:11}}>last 2h</span></div>
            {data.recents.slice(0,5).map((r,i) => (
              <div key={i} style={cdStyles.recentRow}>
                <span className="mono" style={cdStyles.recentTime}>{r.at}</span>
                <div style={{flex:1, minWidth:0}}>
                  <div style={cdStyles.recentTitle}>{r.title}</div>
                  <div className="mono" style={cdStyles.recentUrl}>{r.url}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{...cdStyles.sideCard, background: 'var(--accent-soft)', borderColor: 'var(--accent-soft)'}}>
            <div style={{fontSize: 13, lineHeight: 1.45, color:'var(--fg-1)'}}>
              “{data.quote.text}”
            </div>
            <div className="mono" style={{marginTop:10, fontSize:11, color:'var(--fg-2)'}}>— {data.quote.by}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Glyph({ k }) {
  const c = 'var(--fg-3)';
  if (k === 'search') return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
  );
  if (k === 'action') return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
  );
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M7 17L17 7M9 7h8v8"/></svg>
  );
}

const cdStyles = {
  root: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 28px 28px', gap: 20 },
  metaStrip: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0 6px' },
  metaLeft: { display: 'flex', gap: 10 },
  metaRight: { display: 'flex', gap: 8 },
  weatherPill: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--bg-1)' },

  hero: { display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 24, alignItems: 'stretch' },
  timeBlock: { display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 4px' },
  bigTime: { fontSize: 92, fontWeight: 500, letterSpacing: '-0.04em', color: 'var(--fg)', lineHeight: 1, fontFeatureSettings: '"tnum" on' },
  greeting: { marginTop: 14, fontSize: 16, color: 'var(--fg-1)', lineHeight: 1.5, maxWidth: 360 },

  palette: { background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  paletteHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line-soft)' },
  paletteInput: { flex: 1, background: 'transparent', border: 0, outline: 'none', fontSize: 15, color: 'var(--fg)' },
  paletteList: { padding: 6, flex: 1 },
  paletteRow: { display: 'grid', gridTemplateColumns: 'auto auto 1fr auto auto auto', gap: 10, alignItems: 'center', padding: '9px 10px', borderRadius: 8, color: 'var(--fg-1)', fontSize: 13 },
  paletteRowActive: { background: 'var(--bg-2)', color: 'var(--fg)' },
  rowKind: { display: 'inline-flex', width: 18, justifyContent: 'center' },
  rowLabel: { fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowHint: { fontSize: 11, color: 'var(--fg-3)' },
  rowMeta: { fontSize: 10, color: 'var(--fg-3)', padding: '2px 6px', border: '1px solid var(--line-soft)', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em' },
  paletteFoot: { display: 'flex', gap: 14, padding: '10px 14px', borderTop: '1px solid var(--line-soft)', background: 'var(--bg)', alignItems: 'center' },
  footItem: { display: 'inline-flex', gap: 5, alignItems: 'center', color: 'var(--fg-2)', fontSize: 11 },

  lowerGrid: { display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, flex: 1, minHeight: 0 },

  frequency: { background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 },
  sectionHead: { display: 'flex', alignItems: 'center', gap: 14 },
  sectionTitle: { fontSize: 13, color: 'var(--fg)', fontWeight: 500 },
  sectionSub: { fontSize: 11, color: 'var(--fg-3)' },
  heatLegend: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3 },
  heatCell: { width: 10, height: 10, borderRadius: 2, background: 'var(--accent)' },
  heatGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 },
  heatItem: { position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line-soft)', cursor: 'pointer', overflow: 'hidden' },
  heatBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  heatName: { fontSize: 12.5, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  heatUrl: { fontSize: 10.5, color: 'var(--fg-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  heatCount: { fontSize: 11, color: 'var(--fg-2)', fontFeatureSettings: '"tnum" on' },

  sidebar: { display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 },
  sideCard: { background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 14, padding: 14 },
  sideHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--fg)', marginBottom: 10, fontWeight: 500 },
  todoRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' },
  checkbox: { width: 16, height: 16, borderRadius: 5, border: '1.5px solid var(--line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkboxDone: { background: 'var(--accent)', borderColor: 'var(--accent)' },
  todoText: { flex: 1, fontSize: 13, color: 'var(--fg-1)' },
  todoTag: { fontSize: 10, color: 'var(--fg-3)', padding: '2px 6px', border: '1px solid var(--line-soft)', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em' },
  addTodo: { fontSize: 12, color: 'var(--fg-3)', padding: '6px 0', textAlign: 'left' },

  recentRow: { display: 'flex', gap: 10, padding: '7px 0', alignItems: 'baseline' },
  recentTime: { fontSize: 10.5, color: 'var(--fg-3)', width: 38, flexShrink: 0 },
  recentTitle: { fontSize: 12.5, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  recentUrl: { fontSize: 10.5, color: 'var(--fg-3)' },
};

window.CommandDeck = CommandDeck;
