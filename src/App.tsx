import { useState } from 'react';
import { useChromeData } from './hooks/useChromeData';
import { useSettings } from './hooks/useSettings';
import { Tweaks } from './components/Tweaks';
import { Graph } from './designs/Graph/Graph';
import { copy } from './i18n';
import './styles/tokens.css';
import './styles/shell.css';

export default function App() {
  const { settings, update, ready } = useSettings();
  const { data, loading } = useChromeData();
  const [tweaksOpen, setTweaksOpen] = useState(false);

  if (!ready || loading || !data) {
    return (
      <div className="shell">
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--fg-3)',
            fontSize: 13,
          }}
        >
          {copy.loading}
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="stage">
        <Graph data={data} settings={settings} />
      </div>
      <Tweaks
        settings={settings}
        onChange={update}
        open={tweaksOpen}
        onToggle={() => setTweaksOpen((v) => !v)}
      />
    </div>
  );
}
