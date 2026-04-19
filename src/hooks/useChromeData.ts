import { useCallback, useEffect, useState } from 'react';
import type { ChromeData } from '../types';
import { loadChromeData, subscribeBookmarkChanges } from '../services/chromeApi';

export function useChromeData(): {
  data: ChromeData | null;
  loading: boolean;
  refresh: () => void;
} {
  const [data, setData] = useState<ChromeData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    loadChromeData().then(setData);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadChromeData().then((d) => {
      if (!cancelled) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-refresh when the user edits bookmarks in Chrome directly.
  useEffect(() => {
    const unsub = subscribeBookmarkChanges(() => {
      loadChromeData().then(setData);
    });
    return unsub;
  }, []);

  return { data, loading, refresh };
}
