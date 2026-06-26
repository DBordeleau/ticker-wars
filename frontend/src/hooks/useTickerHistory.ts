import { useEffect, useState } from "react";
import type { TickerHistoryRow } from "../api/dashboardData";
import { loadTickerHistory } from "../api/tickerCache";

export function useTickerHistory(ticker: string | undefined) {
  const [data, setData] = useState<TickerHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) {
      setData([]);
      return;
    }

    setLoading(true);
    setError(null);
    loadTickerHistory(ticker)
      .then(setData)
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Unable to load ticker history.");
      })
      .finally(() => setLoading(false));
  }, [ticker]);

  return { data, loading, error };
}
