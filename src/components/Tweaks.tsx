import type { Settings } from '../types';
import { copy } from '../i18n';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  open: boolean;
  onToggle: () => void;
}

const ACCENTS = [55, 150, 215, 280, 330, 15];

export function Tweaks({ settings, onChange, open, onToggle }: Props) {
  return (
    <>
      <button
        className="tweaks-fab"
        onClick={onToggle}
        title={copy.tweaks.title}
        aria-label={copy.tweaks.title}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.65 1.65 0 0 0-1.8-.3 1.65 1.65 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.65 1.65 0 0 0-1-1.5 1.65 1.65 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.65 1.65 0 0 0 .3-1.8 1.65 1.65 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.65 1.65 0 0 0 1.5-1 1.65 1.65 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.65 1.65 0 0 0 1.8.3h0a1.65 1.65 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.65 1.65 0 0 0 1 1.5 1.65 1.65 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.65 1.65 0 0 0-.3 1.8v0a1.65 1.65 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.65 1.65 0 0 0-1.5 1z" />
        </svg>
      </button>

      {open && (
        <div className="tweaks" role="dialog" aria-label={copy.tweaks.title}>
          <h4>{copy.tweaks.title}</h4>

          <div className="row">
            <label>{copy.tweaks.theme}</label>
            <div className="toggle">
              {(['dark', 'light'] as const).map((v) => (
                <button
                  key={v}
                  className={settings.theme === v ? 'active' : ''}
                  onClick={() => onChange({ theme: v })}
                >
                  {copy.tweaks.themes[v]}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <label>{copy.tweaks.accent}</label>
            <div className="swatches">
              {ACCENTS.map((h) => (
                <span
                  key={h}
                  className={'swatch' + (settings.accentHue === h ? ' active' : '')}
                  style={{ background: `oklch(0.74 0.17 ${h})` }}
                  onClick={() => onChange({ accentHue: h })}
                />
              ))}
            </div>
          </div>

          <div className="row">
            <label>{copy.tweaks.density}</label>
            <div className="toggle">
              {(['cozy', 'compact'] as const).map((v) => (
                <button
                  key={v}
                  className={settings.density === v ? 'active' : ''}
                  onClick={() => onChange({ density: v })}
                >
                  {copy.tweaks.densities[v]}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <label>{copy.tweaks.bg}</label>
            <div className="toggle">
              {(['flat', 'grain', 'grid'] as const).map((v) => (
                <button
                  key={v}
                  className={settings.bg === v ? 'active' : ''}
                  onClick={() => onChange({ bg: v })}
                >
                  {copy.tweaks.bgs[v]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
