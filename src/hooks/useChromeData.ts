import { useCallback, useEffect, useState } from 'react';
import type { ChromeData } from '../types';
import { loadChromeData, subscribeBookmarkChanges } from '../services/chromeApi';

export function useChromeData(): {
  data: ChromeData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [data, setData] = useState<ChromeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    loadChromeData()
      .then((d) => {
        setData(d);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : '无法读取 Chrome 数据';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadChromeData()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : '无法读取 Chrome 数据';
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-refresh when the user edits bookmarks in Chrome directly.
  useEffect(() => {
    const unsub = subscribeBookmarkChanges(() => {
      loadChromeData()
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : '无法读取 Chrome 数据';
          setError(msg);
        });
    });
    return unsub;
  }, []);

  return { data, loading, error, refresh };
}
