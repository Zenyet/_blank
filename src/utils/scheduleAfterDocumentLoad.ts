/**
 * Runs `fn` after the document `load` event has fired, then after `delayMs`.
 * Lets the browser finish the navigation "loading" state before starting
 * optional work like third-party favicon fetches.
 */
export function scheduleAfterDocumentLoad(fn: () => void, delayMs = 200): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let loadListener: (() => void) | null = null;

  const runDelayed = () => {
    loadListener = null;
    timeoutId = window.setTimeout(fn, delayMs);
  };

  if (document.readyState === 'complete') {
    runDelayed();
  } else {
    loadListener = runDelayed;
    window.addEventListener('load', loadListener, { once: true });
  }

  return () => {
    if (loadListener) window.removeEventListener('load', loadListener);
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
}
