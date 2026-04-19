// Design 2: Workspace Dock — vertical "spaces" switcher (Work/Read/Play/Make)
const { useState: useState2, useEffect: useEffect2, useMemo: useMemo2 } = React;

function WorkspaceDock() {
  const data = window.NEWTAB_DATA;
  const spaces = [
    { id: 'Work',  label: 'Work',  hint: '⌘1', accentHue: 55,  tone: 'amber' },
    { id: 'Media', label: 'Play',  hint: '⌘2', accentHue: 320, tone: 'pink' },
    { id: 'Read',  label: 'Read',  hint: '⌘3', accentHue: 200, tone: 'blue' },
    { id: 'Tools', label: 'Make',  hint: '⌘4', accentHue: 150, tone: 'green' },
  ];
  const [active, setActive] = useState2('Work');
  const [q, setQ] = useState2('');
  const [now, setNow] = useState2(new Date());

  useEffect2(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const activeSpace = spaces.find(s => s.id === active);
  const spaceAccent = `oklch(0.74 0.17 ${activeSpace.accentHue})`;
  const spaceAccentSoft = `oklch(0.74 0.17 ${activeSpace.accentHue} / 0.14)`;

  const filtered = useMemo2(() => {
    const inSpace = data.bookmarks.filter(b => b.group === active);
    if (!q) return inSpace;
    return inSpace.filter(b => (b.name + b.url).toLowerCase().includes(q.toLowerCase()));
  }, [active, q]);

  const timeStr = now.toTimeString().slice(0,5);

  // session notes — local cycling copy
  const sessionBlurbs = {
    Work:  { title: 'Focus session',   sub: 'Last active: 3m ago · 4 tabs queued',  kpi: '3h 24m this week' },
    Media: { title: 'Wind‑down',        sub: 'No media today',                       kpi: 'Quiet mode on' },
    Read:  { title: 'Reading queue',   sub: '14 items · ~2h 40m to finish',         kpi: '6 read this week' },
    Tools: { title: 'Workbench',       sub: '2 projects active · 1 scratchpad',     kpi: '11 sessions · May' },
  };
  const blurb = sessionBlurbs[active];

  return (
    <div style={wdStyles.root}>
      {/* Left dock */}
      <div style={wdStyles.dock}>
        <div style={wdStyles.dockLogo}>
          <div style={{width:28, height:28, borderRadius: 8, background: 'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="2.4" strokeLinecap="round">
              <path d="M3 12h3l3-8 4 16 3-8h5"/>
            </svg>
          </div>
        </div>
        <div style={wdStyles.dockStack}>
          {spaces.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              style={{
                ...wdStyles.dockBtn,
                ...(active === s.id ? {
                  background: `oklch(0.74 0.17 ${s.accentHue} / 0.14)`,
                  color: `oklch(0.82 0.15 ${s.accentHue})`,
                  borderColor: `oklch(0.74 0.17 ${s.accentHue} / 0.3)`,
                } : {}),
              }}
            >
              <div style={{...wdStyles.dockBtnDot, background: `oklch(0.74 0.17 ${s.accentHue})`}} />
              <div style={wdStyles.dockBtnLabel}>
                <span>{s.label}</span>
                <span className="mono" style={{fontSize:10, color:'var(--fg-3)'}}>{s.hint}</span>
              </div>
              <span className="mono" style={wdStyles.dockBtnCount}>
                {data.bookmarks.filter(b => b.group === s.id).length}
              </span>
            </button>
          ))}
        </div>
        <div style={wdStyles.dockFoot}>
          <button style={wdStyles.dockIcon} title="Settings">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.65 1.65 0 0 0-1.8-.3 1.65 1.65 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.65 1.65 0 0 0-1-1.5 1.65 1.65 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.65 1.65 0 0 0 .3-1.8 1.65 1.65 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.65 1.65 0 0 0 1.5-1 1.65 1.65 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.65 1.65 0 0 0 1.8.3h0a1.65 1.65 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.65 1.65 0 0 0 1 1.5 1.65 1.65 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.65 1.65 0 0 0-.3 1.8v0a1.65 1.65 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.65 1.65 0 0 0-1.5 1z"/></svg>
          </button>
          <button style={wdStyles.dockIcon} title="History">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={wdStyles.main}>
        {/* Header strip */}
        <div style={wdStyles.header}>
          <div>
            <div style={wdStyles.crumb}>
              <span className="mono" style={{color:'var(--fg-3)'}}>Spaces /</span>
              <span style={{color: spaceAccent, fontWeight: 500}}>{activeSpace.label}</span>
            </div>
            <h1 style={wdStyles.h1}>{blurb.title}</h1>
            <div style={wdStyles.subline}>{blurb.sub}</div>
          </div>
          <div style={wdStyles.headerRight}>
            <div style={wdStyles.clock}>
              <div className="mono" style={wdStyles.clockTime}>{timeStr}</div>
              <div className="mono" style={wdStyles.clockDate}>{now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }).toUpperCase()}</div>
            </div>
            <div style={{...wdStyles.kpi, borderColor: `oklch(0.74 0.17 ${activeSpace.accentHue} / 0.3)`, background: spaceAccentSoft, color: spaceAccent}}>
              <span className="mono" style={{fontSize:11}}>{blurb.kpi}</span>
            </div>
          </div>
        </div>

        {/* Search + filter bar */}
        <div style={wdStyles.searchBar}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            value={q}
            onChange={e=>setQ(e.target.value)}
            placeholder={`Filter in ${activeSpace.label}…  or type to search the web`}
            style={wdStyles.searchInput}
          />
          <div style={wdStyles.engineSwitch}>
            {['G','Gh','Yt','Mdn'].map((e,i) => (
              <button key={e} style={{...wdStyles.engineBtn, ...(i===0 ? {background:'var(--bg-3)', color:'var(--fg)'} : {})}}>{e}</button>
            ))}
          </div>
          <span className="kbd">⌘K</span>
        </div>

        {/* Content grid */}
        <div style={wdStyles.contentGrid}>
          {/* Bookmarks grid */}
          <div style={wdStyles.bmArea}>
            <div style={wdStyles.areaHead}>
              <span style={wdStyles.areaTitle}>Bookmarks</span>
              <span className="mono" style={wdStyles.areaSub}>{filtered.length} in {activeSpace.label}</span>
              <div style={{marginLeft:'auto', display:'flex', gap: 4}}>
                <button style={{...wdStyles.viewBtn, ...wdStyles.viewBtnActive}}>Cards</button>
                <button style={wdStyles.viewBtn}>List</button>
                <button style={wdStyles.viewBtn}>Compact</button>
              </div>
            </div>
            <div style={wdStyles.bmGrid}>
              {filtered.map(b => (
                <a key={b.id} href="#" onClick={e=>e.preventDefault()} style={wdStyles.bmCard}>
                  <span className="favicon" style={{background:b.color, width:36, height:36, fontSize: 13, borderRadius: 8}}>{b.letter}</span>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={wdStyles.bmName}>{b.name}</div>
                    <div className="mono" style={wdStyles.bmUrl}>{b.url}</div>
                  </div>
                  <div style={wdStyles.bmLast}>
                    <span className="mono" style={{fontSize:10, color:'var(--fg-3)'}}>{b.last}</span>
                  </div>
                </a>
              ))}
              <button style={wdStyles.bmAdd}>
                <span style={{fontSize: 20, color: 'var(--fg-3)'}}>+</span>
                <span style={{fontSize: 11, color:'var(--fg-3)'}} className="mono">add to {activeSpace.label}</span>
              </button>
            </div>
          </div>

          {/* Right column: multi-panel */}
          <div style={wdStyles.rightCol}>
            <div style={wdStyles.panel}>
              <div style={wdStyles.panelHead}>
                <span>Pinned tabs</span>
                <span className="mono" style={{fontSize:10, color:'var(--fg-3)'}}>RESTORE · ⌥⇧T</span>
              </div>
              <div style={wdStyles.pinnedRow}>
                {data.bookmarks.filter(b=>b.group==='Work').slice(0,5).map(b => (
                  <div key={b.id} style={wdStyles.pinned} title={b.name}>
                    <span className="favicon" style={{background:b.color, width:30, height:30, fontSize: 11}}>{b.letter}</span>
                  </div>
                ))}
                <div style={{...wdStyles.pinned, borderStyle:'dashed', background:'transparent'}}>
                  <span style={{fontSize:16, color:'var(--fg-3)'}}>+</span>
                </div>
              </div>
            </div>

            <div style={wdStyles.panel}>
              <div style={wdStyles.panelHead}><span>Recent</span><span className="mono" style={{fontSize:10, color:'var(--fg-3)'}}>TODAY</span></div>
              {data.recents.slice(0,4).map((r,i) => (
                <div key={i} style={wdStyles.recentRow}>
                  <span className="mono" style={wdStyles.recentDot}/>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={wdStyles.recentTitle}>{r.title}</div>
                    <div className="mono" style={wdStyles.recentUrl}>{r.url}</div>
                  </div>
                  <span className="mono" style={{fontSize:10, color:'var(--fg-3)'}}>{r.at}</span>
                </div>
              ))}
            </div>

            <div style={wdStyles.panel}>
              <div style={wdStyles.panelHead}><span>Today</span><span className="mono" style={{fontSize:10, color:'var(--fg-3)'}}>{data.todos.filter(t=>!t.done).length} OPEN</span></div>
              {data.todos.map((t,i) => (
                <div key={i} style={wdStyles.todoRow}>
                  <div style={{...wdStyles.check, ...(t.done ? {background:spaceAccent, borderColor:spaceAccent} : {})}}>
                    {t.done && <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6l3 3 5-6" stroke="var(--bg)" strokeWidth="2.2" fill="none" strokeLinecap="round"/></svg>}
                  </div>
                  <span style={{...wdStyles.todoText, ...(t.done ? {textDecoration:'line-through', color:'var(--fg-3)'} : {})}}>{t.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const wdStyles = {
  root: { flex: 1, display: 'flex', minHeight: 'calc(100vh - 62px)' },

  dock: { width: 220, borderRight: '1px solid var(--line-soft)', background: 'var(--bg)', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 20 },
  dockLogo: { padding: '0 4px' },
  dockStack: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 },
  dockBtn: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid transparent', color: 'var(--fg-2)', transition: 'all 0.15s', textAlign: 'left' },
  dockBtnDot: { width: 8, height: 8, borderRadius: 2, flexShrink: 0 },
  dockBtnLabel: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 },
  dockBtnCount: { fontSize: 10.5, color: 'var(--fg-3)', background: 'var(--bg-2)', padding: '2px 7px', borderRadius: 5 },
  dockFoot: { display: 'flex', gap: 4, padding: 4 },
  dockIcon: { width: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)' },

  main: { flex: 1, padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 },
  crumb: { fontSize: 12, display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' },
  h1: { margin: 0, fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--fg)' },
  subline: { fontSize: 13, color: 'var(--fg-2)', marginTop: 6 },
  headerRight: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  clock: { textAlign: 'right' },
  clockTime: { fontSize: 22, fontWeight: 500, fontFeatureSettings: '"tnum" on', color: 'var(--fg)' },
  clockDate: { fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', marginTop: 2 },
  kpi: { padding: '8px 12px', borderRadius: 8, border: '1px solid' },

  searchBar: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 10 },
  searchInput: { flex: 1, background: 'transparent', border: 0, outline: 'none', fontSize: 14, color: 'var(--fg)' },
  engineSwitch: { display: 'flex', gap: 2, padding: 2, border: '1px solid var(--line-soft)', borderRadius: 6 },
  engineBtn: { padding: '3px 8px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', borderRadius: 4 },

  contentGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 2.1fr) minmax(0, 1fr)', gap: 18, flex: 1, minHeight: 0 },

  bmArea: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  areaHead: { display: 'flex', alignItems: 'baseline', gap: 12, padding: '0 4px' },
  areaTitle: { fontSize: 13, fontWeight: 500, color: 'var(--fg)' },
  areaSub: { fontSize: 11, color: 'var(--fg-3)' },
  viewBtn: { padding: '4px 10px', fontSize: 11, color: 'var(--fg-3)', borderRadius: 6 },
  viewBtnActive: { background: 'var(--bg-2)', color: 'var(--fg)' },
  bmGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 },
  bmCard: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 10, textDecoration: 'none', color: 'inherit', transition: 'all 0.15s' },
  bmName: { fontSize: 13, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  bmUrl: { fontSize: 11, color: 'var(--fg-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  bmLast: {},
  bmAdd: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, border: '1.5px dashed var(--line)', background: 'transparent', borderRadius: 10, padding: '18px', cursor: 'pointer' },

  rightCol: { display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 },
  panel: { background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 12, padding: 14 },
  panelHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, fontWeight: 500, color: 'var(--fg)', marginBottom: 10 },
  pinnedRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  pinned: { width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-2)', border: '1px solid var(--line-soft)', borderRadius: 10 },
  recentRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' },
  recentDot: { width: 5, height: 5, borderRadius: '50%', background: 'var(--fg-3)', flexShrink: 0, display: 'inline-block' },
  recentTitle: { fontSize: 12, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  recentUrl: { fontSize: 10, color: 'var(--fg-3)', marginTop: 1 },
  todoRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' },
  check: { width: 16, height: 16, borderRadius: 5, border: '1.5px solid var(--line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  todoText: { fontSize: 12.5, color: 'var(--fg-1)' },
};

window.WorkspaceDock = WorkspaceDock;
