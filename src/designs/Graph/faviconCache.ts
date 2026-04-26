import { bookmarkOriginKey, faviconCandidates } from '../../services/chromeApi';
import { scheduleAfterDocumentLoad } from '../../utils/scheduleAfterDocumentLoad';

type Entry = HTMLImageElement | 'loading' | 'error';

/** Abandon one URL and try the next when the request hangs (e.g. filtered network). */
const FAVICON_ATTEMPT_TIMEOUT_MS = 8000;

/**
 * Lazily preloads site favicons after the document has fully loaded, trying
 * common paths in order. `ensureLoaded` triggers a background fetch and calls
 * `onReady` when an image succeeds — use this to request a redraw.
 * `get` returns a ready image or null (draw the letter fallback).
 */
export class FaviconCache {
  private cache = new Map<string, Entry>();
  private scheduledOrigins = new Set<string>();

  get(pageUrl: string): HTMLImageElement | null {
    const key = bookmarkOriginKey(pageUrl);
    if (!key) return null;
    const entry = this.cache.get(key);
    return entry instanceof HTMLImageElement ? entry : null;
  }

  ensureLoaded(pageUrl: string, onReady: () => void): void {
    const key = bookmarkOriginKey(pageUrl);
    if (!key) return;
    if (this.cache.has(key) || this.scheduledOrigins.has(key)) return;

    const urls = faviconCandidates(pageUrl);
    if (urls.length === 0) return;

    this.scheduledOrigins.add(key);
    scheduleAfterDocumentLoad(() => {
      this.scheduledOrigins.delete(key);
      if (this.cache.has(key)) return;
      this.cache.set(key, 'loading');
      this.tryUrls(urls, key, onReady);
    });
  }

  private tryUrls(urls: string[], key: string, onReady: () => void, index = 0): void {
    if (index >= urls.length) {
      this.cache.set(key, 'error');
      return;
    }

    const url = urls[index];
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';

    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const finish = (next: 'ok' | 'retry') => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (next === 'ok' && img.naturalWidth >= 8) {
        this.cache.set(key, img);
        onReady();
        return;
      }
      img.onload = null;
      img.onerror = null;
      img.src = '';
      if (next === 'retry') {
        if (index + 1 >= urls.length) this.cache.set(key, 'error');
        else this.tryUrls(urls, key, onReady, index + 1);
      }
    };

    timeoutId = window.setTimeout(() => finish('retry'), FAVICON_ATTEMPT_TIMEOUT_MS);

    img.onload = () => {
      if (img.naturalWidth >= 8) finish('ok');
      else finish('retry');
    };
    img.onerror = () => finish('retry');

    img.src = url;
  }
}
