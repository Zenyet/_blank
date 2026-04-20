import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../types';
import { loadSettings, saveSettings } from '../services/chromeApi';
import { backgroundImageCssValue } from '../data/backgrounds';

export function useSettings(): {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  ready: boolean;
} {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setReady(true);
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  // Apply settings to <html>/<body> whenever they change.
  useEffect(() => {
    if (!ready) return;
    document.body.dataset.theme = settings.theme;
    document.body.dataset.density = settings.density;
    document.body.dataset.bg = settings.bg;
    document.documentElement.style.setProperty(
      '--accent',
      `oklch(0.74 0.17 ${settings.accentHue})`
    );
    document.documentElement.style.setProperty(
      '--accent-soft',
      `oklch(0.74 0.17 ${settings.accentHue} / 0.14)`
    );
    document.documentElement.style.setProperty(
      '--accent-ink',
      `oklch(0.22 0.05 ${settings.accentHue})`
    );
    // Custom background image: applied as a layered CSS variable which the
    // `[data-bg="image"]` selector in tokens.css paints. The stored value
    // can be a URL/data URL or a gradient string; the normaliser returns
    // a CSS `background-image` expression either way.
    if (settings.bg === 'image' && settings.bgImage) {
      document.documentElement.style.setProperty(
        '--bg-image',
        backgroundImageCssValue(settings.bgImage)
      );
      document.documentElement.style.setProperty(
        '--bg-image-dim',
        String(settings.bgImageDim)
      );
    } else {
      document.documentElement.style.removeProperty('--bg-image');
      document.documentElement.style.removeProperty('--bg-image-dim');
    }
  }, [settings, ready]);

  return { settings, update, ready };
}
