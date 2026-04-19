// Design 3: Constellation — radial canvas; center=you+time, 4 quadrant clusters, fuzzy filter
const { useState: useState3, useEffect: useEffect3, useMemo: useMemo3 } = React;

function Constellation() {
  const data = window.NEWTAB_DATA;
  const [q, setQ] = useState3('');
  const [hover, setHover] = useState3(null);
  const [now, setNow] = useState3(new Date());

  useEffect3(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const W = 1180, H = 680;
  const cx = W/2, cy = H/2;

  // quadrant configuration (angle range for each group)
  // Top-left: Work, Top-right: Media, Bottom-right: Tools, Bottom-left: Read
  const quadrants = {
    Work:  { name: 'WORK',  angleStart: 200, angleEnd: 250, hue: 55,  anchor: { x: cx - 360, y: cy - 200 } },
    Media: { name: 'PLAY',  angleStart: 290, angleEnd: 340, hue: 330, anchor: { x: cx + 360, y: cy - 200 } },
    Tools: { name: 'MAKE',  angleStart: 20,  angleEnd: 70,  hue: 150, anchor: { x: cx + 360, y: cy + 200 } },
    Read:  { name: 'READ',  angleStart: 110, angleEnd: 160, hue: 215, anchor: { x: cx - 360, y: cy + 200 } },
  };

  // Compute position for each bookmark: cluster by group, arrange along arcs at varying radii by visit count
  const positions = useMemo3(() => {
    const out = [];
    Object.entries(quadrants).forEach(([group, cfg]) => {
      const bms = data.bookmarks.filter(b => b.group === group);
      const n = bms.length;
      bms.forEach((b, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const ang = (cfg.angleStart + (cfg.angleEnd - cfg.angleStart) * t) * Math.PI / 180;
        // radius based on visit count — more visits = closer to center
        const maxV = Math.max(...data.bookmarks.map(x=>x.visits));
        const rFactor = 1 - (b.visits / maxV) * 0.55;
        const r = 200 + rFactor * 160 + (i % 2) * 20;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r * 0.82;
        out.push({ ...b, x, y, hue: cfg.hue, group, groupLabel: cfg.name });
      });
    });
    return out;
  }, []);

  const matches = useMemo3(() => {
    if (!q) return null;
    const s = q.toLowerCase();
    return new Set(positions.filter(p => (p.name + p.url + p.group).toLowerCase().includes(s)).map(p => p.id));
  }, [q]);

  const timeStr = now.toTimeString().slice(0,5);
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div style={csStyles.root}>
      {/* Floating filter */}
      <div style={csStyles.filter}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder="Filter the constellation…"
          style={csStyles.filterInput}
          autoFocus
        />
        <span className="mono" style={{fontSize:11, color:'var(--fg-3)'}}>
          {q ? `${(matches && matches.size) || 0} matching` : `${positions.length} sites`}
        </span>
        <span className="kbd">/</span>
      </div>

      {/* Canvas */}
      <div style={csStyles.canvasWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} style={csStyles.svg} preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="oklch(0.74 0.17 55 / 0.35)"/>
              <stop offset="60%" stopColor="oklch(0.74 0.17 55 / 0.04)"/>
              <stop offset="100%" stopColor="oklch(0.74 0.17 55 / 0)"/>
            </radialGradient>
            {[55, 330, 150, 215].map(h => (
              <radialGradient key={h} id={`glow-${h}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={`oklch(0.74 0.17 ${h} / 0.22)`}/>
                <stop offset="100%" stopColor={`oklch(0.74 0.17 ${h} / 0)`}/>
              </radialGradient>
            ))}
          </defs>

          {/* concentric rings */}
          {[120, 200, 280, 360].map(r => (
            <ellipse key={r} cx={cx} cy={cy} rx={r} ry={r*0.82} fill="none"
              stroke="var(--line-soft)" strokeWidth="1" strokeDasharray="2 4" opacity="0.5"/>
          ))}
          {/* axes */}
          <line x1={60} y1={cy} x2={W-60} y2={cy} stroke="var(--line-soft)" strokeWidth="1" opacity="0.4"/>
          <line x1={cx} y1={60} x2={cx} y2={H-60} stroke="var(--line-soft)" strokeWidth="1" opacity="0.4"/>

          {/* center radial halo */}
          <circle cx={cx} cy={cy} r={260} fill="url(#center-glow)" />

          {/* quadrant tinted glows */}
          {Object.entries(quadrants).map(([g, cfg]) => {
            const midAng = ((cfg.angleStart + cfg.angleEnd)/2) * Math.PI / 180;
            const gx = cx + Math.cos(midAng) * 320;
            const gy = cy + Math.sin(midAng) * 320 * 0.82;
            return <circle key={g} cx={gx} cy={gy} r={180} fill={`url(#glow-${cfg.hue})`} />;
          })}

          {/* quadrant labels */}
          {Object.entries(quadrants).map(([g, cfg]) => {
            const midAng = ((cfg.angleStart + cfg.angleEnd)/2) * Math.PI / 180;
            const lx = cx + Math.cos(midAng) * 420;
            const ly = cy + Math.sin(midAng) * 420 * 0.82;
            const count = data.bookmarks.filter(b=>b.group===g).length;
            return (
              <g key={g}>
                <text x={lx} y={ly} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10.5"
                  letterSpacing="3" fill={`oklch(0.82 0.14 ${cfg.hue})`}>{cfg.name}</text>
                <text x={lx} y={ly + 14} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5"
                  fill="var(--fg-3)">{count} · {g}</text>
              </g>
            );
          })}

          {/* connections center → nodes */}
          {positions.map(p => {
            const on = !matches || matches.has(p.id);
            return (
              <line key={'l-'+p.id} x1={cx} y1={cy} x2={p.x} y2={p.y}
                stroke={`oklch(0.74 0.17 ${p.hue})`}
                strokeOpacity={on ? 0.18 : 0.05}
                strokeWidth="1" />
            );
          })}

          {/* bookmark nodes */}
          {positions.map(p => {
            const on = !matches || matches.has(p.id);
            const isHover = hover === p.id;
            const size = 20 + Math.min(24, p.visits / 30);
            return (
              <g key={p.id}
                style={{cursor:'pointer', opacity: on ? 1 : 0.2, transition:'opacity 0.2s'}}
                onMouseEnter={()=>setHover(p.id)}
                onMouseLeave={()=>setHover(null)}
                transform={`translate(${p.x} ${p.y})`}
              >
                {isHover && on && (
                  <circle r={size/2 + 8} fill="none" stroke={`oklch(0.74 0.17 ${p.hue})`} strokeWidth="1.5" opacity="0.6"/>
                )}
                <rect x={-size/2} y={-size/2} width={size} height={size} rx={size*0.22}
                  fill={p.color} stroke={`oklch(0.74 0.17 ${p.hue} / 0.4)`} strokeWidth="1"/>
                <text x={0} y={4} textAnchor="middle" fontFamily="var(--font-mono)" fontWeight="600"
                  fontSize={size*0.38} fill="#fff">{p.letter}</text>
                {(isHover || (matches && matches.has(p.id))) && on && (
                  <g transform={`translate(0 ${size/2 + 16})`}>
                    <text textAnchor="middle" fontFamily="var(--font-sans)" fontSize="12"
                      fontWeight="500" fill="var(--fg)">{p.name}</text>
                    <text y={14} textAnchor="middle" fontFamily="var(--font-mono)"
                      fontSize="10" fill="var(--fg-3)">{p.url}</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Center hub */}
          <g transform={`translate(${cx} ${cy})`}>
            <circle r={80} fill="var(--bg)" stroke="var(--line)" strokeWidth="1"/>
            <circle r={76} fill="var(--bg-1)"/>
            <text textAnchor="middle" y={-14} fontFamily="var(--font-mono)" fontSize="10"
              letterSpacing="3" fill="var(--fg-3)">TODAY</text>
            <text textAnchor="middle" y={16} fontFamily="var(--font-sans)" fontSize="28"
              fontWeight="500" fill="var(--fg)" style={{fontFeatureSettings:'"tnum" on'}}>{timeStr}</text>
            <text textAnchor="middle" y={38} fontFamily="var(--font-mono)" fontSize="9.5"
              fill="var(--fg-3)">{dateStr.toUpperCase()}</text>
            <line x1={-30} y1={52} x2={30} y2={52} stroke="var(--line)" strokeWidth="1"/>
            <circle cx={-22} cy={64} r="3" fill="var(--accent)"/>
            <text x={-14} y={68} fontFamily="var(--font-sans)" fontSize="10"
              fill="var(--fg-2)">3 tasks · {data.weather.temp}°</text>
          </g>
        </svg>

        {/* corner legend */}
        <div style={csStyles.legend}>
          <div style={csStyles.legendRow}>
            <span style={{...csStyles.legendDot, width:8, height:8}}/>
            <span>size = visits</span>
          </div>
          <div style={csStyles.legendRow}>
            <span style={{...csStyles.legendDot, width:5, height:5, opacity:0.6}}/>
            <span>closer = more frequent</span>
          </div>
          <div style={csStyles.legendRow}>
            <span className="mono" style={{color:'var(--fg-3)', fontSize:10}}>21 sites · 4 clusters</span>
          </div>
        </div>
      </div>

      {/* Bottom strip: recents carousel */}
      <div style={csStyles.bottomStrip}>
        <div style={csStyles.stripSection}>
          <div className="mono" style={csStyles.stripLabel}>TOP</div>
          <div style={csStyles.stripRow}>
            {[...data.bookmarks].sort((a,b)=>b.visits-a.visits).slice(0,5).map(b => (
              <button key={b.id} style={csStyles.stripChip}>
                <span className="favicon" style={{background:b.color, width:20, height:20, fontSize:9}}>{b.letter}</span>
                <span style={{fontSize:12}}>{b.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={csStyles.stripDiv} />
        <div style={csStyles.stripSection}>
          <div className="mono" style={csStyles.stripLabel}>RECENT</div>
          <div style={csStyles.stripRow}>
            {data.recents.slice(0,4).map((r,i) => (
              <button key={i} style={csStyles.stripChip}>
                <span className="mono" style={{fontSize:10, color:'var(--fg-3)'}}>{r.at}</span>
                <span style={{fontSize:12, maxWidth:180, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{r.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const csStyles = {
  root: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, height: 'calc(100vh - 62px)', padding: '14px 20px 14px', gap: 10, position: 'relative', overflow: 'hidden' },
  filter: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 10, maxWidth: 560, margin: '0 auto', width: '100%', boxShadow: 'var(--shadow-sm)', flexShrink: 0 },
  filterInput: { flex: 1, background: 'transparent', border: 0, outline: 'none', fontSize: 14, color: 'var(--fg)' },

  canvasWrap: { flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, minWidth: 0, overflow: 'hidden' },
  svg: { width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', display: 'block' },

  legend: { position: 'absolute', bottom: 10, right: 10, padding: '10px 12px', background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: 'var(--fg-2)' },
  legendRow: { display: 'flex', alignItems: 'center', gap: 8 },
  legendDot: { borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' },

  bottomStrip: { display: 'flex', alignItems: 'stretch', gap: 14, padding: '8px 12px', background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 10, flexShrink: 0 },
  stripSection: { display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  stripLabel: { fontSize: 10, letterSpacing: '0.15em', color: 'var(--fg-3)' },
  stripRow: { display: 'flex', gap: 6, overflow: 'hidden', flex: 1 },
  stripChip: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 999, border: '1px solid var(--line-soft)', background: 'var(--bg-2)', color: 'var(--fg-1)', whiteSpace: 'nowrap', flexShrink: 0 },
  stripDiv: { width: 1, background: 'var(--line-soft)' },
};

window.Constellation = Constellation;
