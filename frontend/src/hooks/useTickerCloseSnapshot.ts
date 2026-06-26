import { useEffect, useMemo, useState } from "react";
import type { TickerCloseSnapshot } from "../api/dashboardData";
import { loadTickerCloseSnapshot } from "../api/tickerCache";

type TickerCloseSnapshotState = {
  data: TickerCloseSnapshot | null;
  loading: boolean;
  error: string | null;
};

export function useTickerCloseSnapshot(ticker: string): TickerCloseSnapshotState {
  const normalizedTicker = ticker.trim().toUpperCase();
  const [data, setData] = useState<TickerCloseSnapshot | null>(null);
  const [loading, setLoading] = useState(Boolean(normalizedTicker));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!normalizedTicker) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let isCurrentRequest = true;
    setLoading(true);
    setError(null);

    loadTickerCloseSnapshot(normalizedTicker)
      .then((snapshot) => {
        if (isCurrentRequest) {
          setData(snapshot);
        }
      })
      .catch((caught) => {
        if (isCurrentRequest) {
          setData(null);
          setError(caught instanceof Error ? caught.message : "Unable to load latest close.");
        }
      })
      .finally(() => {
        if (isCurrentRequest) {
          setLoading(false);
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [normalizedTicker]);

  return useMemo(
    () => ({
      data,
      loading,
      error,
    }),
    [data, error, loading],
  );
}
