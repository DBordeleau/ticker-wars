import { useEffect, useMemo, useState } from "react";
import type { TickerProfile } from "../api/dashboardData";
import { loadTickerProfile } from "../api/tickerCache";

type TickerProfileState = {
  data: TickerProfile | null;
  loading: boolean;
  error: string | null;
};

export function useTickerProfile(ticker: string): TickerProfileState {
  const normalizedTicker = ticker.trim().toUpperCase();
  const [data, setData] = useState<TickerProfile | null>(null);
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

    loadTickerProfile(normalizedTicker)
      .then((profile) => {
        if (isCurrentRequest) {
          setData(profile);
        }
      })
      .catch((caught) => {
        if (isCurrentRequest) {
          setData(null);
          setError(caught instanceof Error ? caught.message : "Unable to load ticker profile.");
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
