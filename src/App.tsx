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
  const { data, loading, error, refresh } = useChromeData();
  const [tweaksOpen, setTweaksOpen] = useState(false);

  if (!ready || loading) {
    return (
      <div className="shell">
        <ExtensionState title={copy.loading} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="shell">
        <ExtensionState
          title="无法读取 Chrome 书签"
          body={error ?? '扩展数据尚未准备好。请刷新新标签页，或确认扩展权限仍然开启。'}
          actionLabel="重试"
          onAction={refresh}
        />
      </div>
    );
  }

  const emptyChrome =
    data.source === 'chrome' && data.bookmarks.length === 0 && data.groups.length === 0;
  if (emptyChrome) {
    return (
      <div className="shell">
        <ExtensionState
          title="还没有可显示的书签"
          body="在 Chrome 书签栏添加书签或文件夹后，它们会自动出现在这张图里。"
          actionLabel="重新读取"
          onAction={refresh}
        />
        <Tweaks
          settings={settings}
          onChange={update}
          open={tweaksOpen}
          onToggle={() => setTweaksOpen((v) => !v)}
        />
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

function ExtensionState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="extension-state">
      <div className="extension-state__mark" aria-hidden>
        BG
      </div>
      <h1>{title}</h1>
      {body && <p>{body}</p>}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
