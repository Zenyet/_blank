import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { hexToOklchHue } from '../services/color';

// Chromium's EyeDropper API isn't in the stock DOM lib yet. Narrow typing
// here keeps strict TS happy without polluting global declarations.
interface EyeDropperResult {
  sRGBHex: string;
}
interface EyeDropperLike {
  open: () => Promise<EyeDropperResult>;
}
type EyeDropperCtor = { new (): EyeDropperLike };

function getEyeDropper(): EyeDropperCtor | null {
  const w = window as unknown as { EyeDropper?: EyeDropperCtor };
  return typeof w.EyeDropper === 'function' ? w.EyeDropper : null;
}

/**
 * Hue-based color picker built on oklch(L C H).
 *
 * We only vary the H (hue) channel — L/C are fixed so every picked color lands
 * in the same perceptually-even "saturated mid" band that matches the rest of
 * the UI (group dots, accents, etc.). This keeps the palette cohesive even
 * when users pick whatever hue they like.
 *
 * Two presentations:
 *   - `<HuePalette>`: inline row of preset swatches + a hue slider. Embed
 *     directly where space allows (e.g. Tweaks panel).
 *   - `<HuePickerButton>`: a compact trigger swatch that opens a popover
 *     containing the palette. Use inline in lists (e.g. Groups rows).
 */

const DEFAULT_PRESETS = [15, 55, 95, 150, 200, 250, 290, 330];

const L = 0.74;
const C = 0.17;

export function oklchHue(hue: number, alpha = 1): string {
  return alpha >= 1
    ? `oklch(${L} ${C} ${hue})`
    : `oklch(${L} ${C} ${hue} / ${alpha})`;
}

interface HuePaletteProps {
  value: number;
  onChange: (hue: number) => void;
  presets?: number[];
  /** Optional reset-to-auto button (e.g. "use default hash hue"). */
  onReset?: () => void;
  resetLabel?: string;
}

export function HuePalette({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  onReset,
  resetLabel = '重置',
}: HuePaletteProps) {
  const EyeDropperCls = getEyeDropper();
  const [pickError, setPickError] = useState<string | null>(null);

  const pickFromPage = async () => {
    if (!EyeDropperCls) return;
    setPickError(null);
    try {
      const ed = new EyeDropperCls();
      const result = await ed.open();
      const hue = hexToOklchHue(result.sRGBHex);
      if (hue === null) {
        setPickError('这个颜色太接近灰色，无法取色');
        return;
      }
      onChange(hue);
    } catch {
      /* user cancelled — no-op */
    }
  };

  return (
    <div style={s.palette}>
      <div style={s.swatchRow}>
        {presets.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onChange(h)}
            style={{
              ...s.swatch,
              background: oklchHue(h),
              ...(Math.abs(h - value) < 2 ? s.swatchActive : null),
            }}
            aria-label={`hue ${h}`}
          />
        ))}
      </div>
      <div style={s.sliderRow}>
        <input
          type="range"
          min={0}
          max={359}
          step={1}
          value={Math.round(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          style={s.slider}
        />
        <span
          style={{ ...s.preview, background: oklchHue(value) }}
          aria-hidden
        />
        <span className="mono" style={s.hueNum}>
          {Math.round(value)}°
        </span>
      </div>
      <div style={s.paletteFooter}>
        {EyeDropperCls && (
          <button
            type="button"
            onClick={pickFromPage}
            style={s.eyedropperBtn}
            title="从屏幕取色"
            aria-label="从屏幕取色"
          >
            <EyeDropperIcon />
            <span>取色</span>
          </button>
        )}
        {onReset && (
          <button type="button" onClick={onReset} style={s.resetBtn}>
            {resetLabel}
          </button>
        )}
      </div>
      {pickError && <span style={s.pickError}>{pickError}</span>}
    </div>
  );
}

function EyeDropperIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m2 22 1-1h3l9-9" />
      <path d="M3 21v-3l9-9" />
      <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3L8 5l-.4-.4a2.1 2.1 0 1 1 3-3L15 6Z" />
    </svg>
  );
}

interface HuePickerButtonProps {
  value: number;
  onChange: (hue: number) => void;
  onReset?: () => void;
  presets?: number[];
  /** Size of the trigger dot. */
  size?: number;
  title?: string;
  children?: ReactNode;
}

export function HuePickerButton({
  value,
  onChange,
  onReset,
  presets,
  size = 14,
  title = '选择颜色',
}: HuePickerButtonProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={title}
        aria-label={title}
        style={{
          ...s.triggerDot,
          width: size,
          height: size,
          background: oklchHue(value),
        }}
      />
      {open && (
        <div style={s.popover} onMouseDown={(e) => e.stopPropagation()}>
          <HuePalette
            value={value}
            onChange={onChange}
            presets={presets}
            {...(onReset ? { onReset: () => { onReset(); setOpen(false); } } : {})}
          />
        </div>
      )}
    </span>
  );
}

const s: Record<string, CSSProperties> = {
  palette: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minWidth: 220,
  },
  swatchRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    gap: 6,
  },
  swatch: {
    width: '100%',
    aspectRatio: '1 / 1',
    borderRadius: 6,
    border: '1.5px solid transparent',
    cursor: 'pointer',
    padding: 0,
    transition: 'transform 120ms ease',
  },
  swatchActive: {
    borderColor: 'var(--fg)',
    transform: 'scale(1.06)',
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  slider: {
    flex: 1,
    accentColor: 'var(--accent)',
    background:
      'linear-gradient(to right,' +
      [0, 60, 120, 180, 240, 300, 360]
        .map((h, i, arr) => `${oklchHue(h)} ${(i / (arr.length - 1)) * 100}%`)
        .join(',') +
      ')',
    height: 8,
    borderRadius: 999,
    border: '1px solid var(--line-soft)',
    appearance: 'none',
    WebkitAppearance: 'none',
    padding: 0,
  },
  preview: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    border: '1px solid var(--line)',
    flexShrink: 0,
  },
  hueNum: {
    fontSize: 10,
    color: 'var(--fg-3)',
    minWidth: 30,
    textAlign: 'right',
  },
  paletteFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  resetBtn: {
    fontSize: 11,
    color: 'var(--fg-3)',
    padding: '2px 6px',
    marginLeft: 'auto',
  },
  eyedropperBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    padding: '4px 8px',
    borderRadius: 6,
    color: 'var(--fg-2)',
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    cursor: 'pointer',
  },
  pickError: {
    fontSize: 10,
    color: 'var(--warn)',
  },
  triggerDot: {
    display: 'inline-block',
    borderRadius: '50%',
    border: '1.5px solid color-mix(in oklab, var(--fg) 22%, transparent)',
    cursor: 'pointer',
    padding: 0,
  },
  popover: {
    position: 'absolute',
    zIndex: 200,
    top: 'calc(100% + 8px)',
    left: 0,
    padding: 12,
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    boxShadow: 'var(--shadow-lg)',
    minWidth: 240,
  },
};
