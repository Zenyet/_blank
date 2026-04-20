import type { ChangeEvent, CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { BgPattern, Settings } from '../types';
import { BUILTIN_BACKGROUNDS, backgroundImageCssValue } from '../data/backgrounds';
import { copy } from '../i18n';
import {
  loadUserBackgrounds,
  MAX_USER_BACKGROUNDS,
  removeUserBackground,
  saveUserBackground,
  subscribeUserBackgrounds,
  type UserBackground,
} from '../services/userBackgrounds';
import { HuePalette } from './ColorPicker';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  open: boolean;
  onToggle: () => void;
}

const BG_OPTIONS: BgPattern[] = ['flat', 'grain', 'grid', 'image'];
const MAX_IMAGE_SIDE = 2400;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // post-compression ceiling.

export function Tweaks({ settings, onChange, open, onToggle }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [userBgs, setUserBgs] = useState<UserBackground[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadUserBackgrounds().then((list) => {
      if (!cancelled) setUserBgs(list);
    });
    const unsub = subscribeUserBackgrounds((list) => {
      if (!cancelled) setUserBgs([...list]);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const applyImage = (dataUrl: string) => {
    onChange({ bg: 'image', bgImage: dataUrl });
    setError(null);
  };

  const onFile = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImage(file, MAX_IMAGE_SIDE);
      if (compressed.length > MAX_IMAGE_BYTES) {
        setError(copy.tweaks.bgImageTooLarge);
        return;
      }
      applyImage(compressed);
    } catch {
      setError(copy.tweaks.bgImageTooLarge);
    }
  };

  const applyUrl = () => {
    const u = urlDraft.trim();
    if (!u) return;
    applyImage(u);
    setUrlDraft('');
  };

  const removeImage = () => {
    onChange({ bgImage: null, bg: settings.bg === 'image' ? 'flat' : settings.bg });
    setError(null);
  };

  const saveCurrentAsPreset = async () => {
    if (!settings.bgImage) return;
    const fallback = `预设 ${userBgs.length + 1}`;
    const label = (window.prompt('给这张背景取个名字', fallback) ?? '').trim();
    if (label === '' && fallback === '') return;
    await saveUserBackground({ label: label || fallback, value: settings.bgImage });
  };

  const presetsFull = userBgs.length >= MAX_USER_BACKGROUNDS;
  const canSavePreset =
    !!settings.bgImage &&
    !userBgs.some((b) => b.value === settings.bgImage) &&
    !BUILTIN_BACKGROUNDS.some((b) => b.value === settings.bgImage) &&
    !presetsFull;

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

          <div className="row rowColumn">
            <label>{copy.tweaks.accent}</label>
            <HuePalette
              value={settings.accentHue}
              onChange={(h) => onChange({ accentHue: h })}
            />
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
              {BG_OPTIONS.map((v) => (
                <button
                  key={v}
                  className={settings.bg === v ? 'active' : ''}
                  onClick={() => {
                    if (v === 'image' && !settings.bgImage) {
                      fileRef.current?.click();
                    }
                    onChange({ bg: v });
                  }}
                >
                  {copy.tweaks.bgs[v]}
                </button>
              ))}
            </div>
          </div>

          {settings.bg === 'image' && (
            <div className="row rowColumn">
              <label>{copy.tweaks.bgImageTitle}</label>

              {/* Built-in gradient gallery. Clicking a swatch stores the
                  gradient CSS directly in settings.bgImage; the currently
                  applied item gets an accent border. */}
              <div style={galleryGroupLabel}>内建</div>
              <div style={galleryGrid}>
                {BUILTIN_BACKGROUNDS.map((bg) => {
                  const active = settings.bgImage === bg.value;
                  return (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => applyImage(bg.value)}
                      title={bg.label}
                      aria-label={bg.label}
                      style={{
                        ...galleryItem,
                        backgroundImage: bg.value,
                        borderColor: active ? 'var(--accent)' : 'var(--line)',
                        boxShadow: active
                          ? '0 0 0 2px var(--accent-soft)'
                          : undefined,
                      }}
                    >
                      <span style={galleryLabel}>{bg.label}</span>
                    </button>
                  );
                })}
              </div>

              {userBgs.length > 0 && (
                <>
                  <div style={galleryGroupLabel}>
                    <span>我的背景</span>
                    <span style={{ color: 'var(--fg-3)' }}>
                      {userBgs.length}/{MAX_USER_BACKGROUNDS}
                    </span>
                  </div>
                  <div style={galleryGrid}>
                    {userBgs.map((bg) => {
                      const active = settings.bgImage === bg.value;
                      return (
                        <div key={bg.id} style={{ position: 'relative' }}>
                          <button
                            type="button"
                            onClick={() => applyImage(bg.value)}
                            title={bg.label}
                            aria-label={bg.label}
                            style={{
                              ...galleryItem,
                              backgroundImage: backgroundImageCssValue(bg.value),
                              borderColor: active ? 'var(--accent)' : 'var(--line)',
                              boxShadow: active
                                ? '0 0 0 2px var(--accent-soft)'
                                : undefined,
                            }}
                          >
                            <span style={galleryLabel}>{bg.label}</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`删除"${bg.label}"？`)) {
                                void removeUserBackground(bg.id);
                              }
                            }}
                            title="删除"
                            aria-label="删除"
                            style={galleryDelete}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {settings.bgImage && (
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '16 / 9',
                    borderRadius: 8,
                    backgroundImage: backgroundImageCssValue(settings.bgImage),
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    border: '1px solid var(--line)',
                  }}
                />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onFile}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="toggle-btn"
                  style={tweakBtnStyle}
                >
                  {copy.tweaks.bgImageUpload}
                </button>
                <button
                  type="button"
                  onClick={saveCurrentAsPreset}
                  disabled={!canSavePreset}
                  title={
                    presetsFull
                      ? `最多保存 ${MAX_USER_BACKGROUNDS} 个预设`
                      : settings.bgImage
                        ? '把当前背景保存为我的预设'
                        : '没有可保存的背景'
                  }
                  style={{
                    ...tweakBtnStyle,
                    opacity: canSavePreset ? 1 : 0.5,
                    cursor: canSavePreset ? 'pointer' : 'not-allowed',
                  }}
                >
                  保存为预设
                </button>
                {settings.bgImage && (
                  <button
                    type="button"
                    onClick={removeImage}
                    className="toggle-btn"
                    style={{ ...tweakBtnStyle, color: 'var(--warn)' }}
                  >
                    {copy.tweaks.bgImageRemove}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyUrl();
                  }}
                  placeholder={copy.tweaks.bgImageUrl}
                  style={urlInputStyle}
                />
                <button
                  type="button"
                  onClick={applyUrl}
                  disabled={!urlDraft.trim()}
                  style={{
                    ...tweakBtnStyle,
                    opacity: urlDraft.trim() ? 1 : 0.5,
                  }}
                >
                  应用
                </button>
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  color: 'var(--fg-2)',
                }}
              >
                <span style={{ flexShrink: 0 }}>{copy.tweaks.bgImageDim}</span>
                <input
                  type="range"
                  min={0}
                  max={80}
                  step={1}
                  value={Math.round(settings.bgImageDim * 100)}
                  onChange={(e) =>
                    onChange({ bgImageDim: Number(e.target.value) / 100 })
                  }
                  style={{ flex: 1 }}
                />
                <span className="mono" style={{ minWidth: 28, textAlign: 'right' }}>
                  {Math.round(settings.bgImageDim * 100)}%
                </span>
              </label>
              {error && (
                <span style={{ fontSize: 11, color: 'var(--warn)' }}>{error}</span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

const tweakBtnStyle = {
  padding: '6px 10px',
  fontSize: 11,
  borderRadius: 6,
  color: 'var(--fg-2)',
  background: 'var(--bg-2)',
  border: '1px solid var(--line)',
};

const galleryGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 6,
};

const galleryItem: CSSProperties = {
  position: 'relative',
  aspectRatio: '1 / 1',
  borderRadius: 7,
  border: '1.5px solid var(--line)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  cursor: 'pointer',
  padding: 0,
  overflow: 'hidden',
};

const galleryGroupLabel: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--fg-3)',
  marginTop: 2,
};

const galleryDelete: CSSProperties = {
  position: 'absolute',
  top: 3,
  right: 3,
  width: 18,
  height: 18,
  padding: 0,
  borderRadius: 999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  lineHeight: 1,
  color: 'oklch(1 0 0 / 0.95)',
  background: 'oklch(0 0 0 / 0.55)',
  border: '1px solid oklch(1 0 0 / 0.25)',
  backdropFilter: 'blur(4px)',
  cursor: 'pointer',
};

const galleryLabel: CSSProperties = {
  position: 'absolute',
  bottom: 2,
  left: 3,
  right: 3,
  fontSize: 9,
  color: 'oklch(1 0 0 / 0.88)',
  textShadow: '0 1px 2px oklch(0 0 0 / 0.5)',
  textAlign: 'left',
  letterSpacing: '0.04em',
};

const urlInputStyle = {
  flex: 1,
  minWidth: 0,
  padding: '6px 10px',
  fontSize: 11,
  borderRadius: 6,
  color: 'var(--fg)',
  background: 'var(--bg-2)',
  border: '1px solid var(--line)',
};

/**
 * Resize + re-encode a user-selected image to fit under our storage budget.
 * We cap the longest side at `maxSide` and encode JPEG at 0.85 quality; the
 * resulting data URL typically lands under a megabyte for 1080p-ish photos.
 */
async function compressImage(file: File, maxSide: number): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  const img = await dataUrlToImage(dataUrl);
  const { width, height } = img;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  if (scale >= 1 && file.size <= MAX_IMAGE_BYTES) {
    return dataUrl;
  }
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function dataUrlToImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}
