import { faviconUrl } from '../../services/chromeApi';

type Entry = HTMLImageElement | 'loading' | 'error';

/**
 * Lazily preloads site favicons (https://{domain}/favicon.ico) and caches them.
 * `ensureLoaded` triggers a background fetch and calls `onReady` the moment
 * a previously missing image becomes available — use this to request a redraw.
 * `get` returns a ready image or null (the caller should draw a letter fallback).
 */
export class FaviconCache {
  private cache = new Map<string, Entry>();

  get(pageUrl: string): HTMLImageElement | null {
    const key = faviconUrl(pageUrl);
    if (!key) return null;
    const entry = this.cache.get(key);
    return entry instanceof HTMLImageElement ? entry : null;
  }

  ensureLoaded(pageUrl: string, onReady: () => void): void {
    const key = faviconUrl(pageUrl);
    if (!key) return;
    if (this.cache.has(key)) return;
    this.cache.set(key, 'loading');
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (img.naturalWidth >= 8) {
        this.cache.set(key, img);
        onReady();
      } else {
        this.cache.set(key, 'error');
      }
    };
    img.onerror = () => {
      this.cache.set(key, 'error');
    };
    img.src = key;
  }
}
