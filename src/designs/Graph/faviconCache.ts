import { bookmarkOriginKey, faviconCandidates } from '../../services/chromeApi';
import { scheduleAfterDocumentLoad } from '../../utils/scheduleAfterDocumentLoad';

type Entry = HTMLImageElement | 'loading' | 'error';

/** Abandon one URL and try the next when the request hangs (e.g. filtered network). */
const FAVICON_ATTEMPT_TIMEOUT_MS = 8000;
const MIN_FAVICON_SIDE = 8;
const MAX_FAVICON_SIDE = 192;
const MAX_FAVICON_CACHE_ENTRIES = 384;

export function isDrawableFaviconImage(img: HTMLImageElement): boolean {
  return (
    img.complete &&
    img.naturalWidth >= MIN_FAVICON_SIDE &&
    img.naturalHeight >= MIN_FAVICON_SIDE &&
    img.naturalWidth <= MAX_FAVICON_SIDE &&
    img.naturalHeight <= MAX_FAVICON_SIDE
  );
}

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
    if (!(entry instanceof HTMLImageElement)) return null;
    if (isDrawableFaviconImage(entry)) {
      this.set(key, entry);
      return entry;
    }
    this.set(key, 'error');
    return null;
  }

  markBroken(pageUrl: string): void {
    const key = bookmarkOriginKey(pageUrl);
    if (!key) return;
    this.set(key, 'error');
    this.scheduledOrigins.delete(key);
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
      this.set(key, 'loading');
      this.tryUrls(urls, key, onReady);
    });
  }

  private set(key: string, entry: Entry): void {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, entry);
    this.trim();
  }

  private trim(): void {
    while (this.cache.size > MAX_FAVICON_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) return;
      this.cache.delete(oldest);
    }
  }

  private tryUrls(urls: string[], key: string, onReady: () => void, index = 0): void {
    if (index >= urls.length) {
      this.set(key, 'error');
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
      if (next === 'ok' && isDrawableFaviconImage(img)) {
        this.set(key, img);
        onReady();
        return;
      }
      img.onload = null;
      img.onerror = null;
      img.src = '';
      if (index + 1 >= urls.length) this.set(key, 'error');
      else this.tryUrls(urls, key, onReady, index + 1);
    };

    timeoutId = window.setTimeout(() => finish('retry'), FAVICON_ATTEMPT_TIMEOUT_MS);

    img.onload = () => {
      if (!isDrawableFaviconImage(img)) {
        finish('retry');
        return;
      }
      const decoded =
        typeof img.decode === 'function' ? img.decode() : Promise.resolve();
      decoded.then(() => finish('ok'), () => finish('retry'));
    };
    img.onerror = () => finish('retry');

    img.src = url;
  }
}
