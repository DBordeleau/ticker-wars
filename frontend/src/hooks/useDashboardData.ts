import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDashboardData,
  fetchTickerHistory,
  type DashboardData,
  type TickerHistoryRow,
} from "../api/dashboardData";
import { isSupabaseConfigured } from "../api/supabaseClient";

type DashboardState = DashboardData & {
  loading: boolean;
  historyLoading: boolean;
  error: string | null;
  selectedTicker: string | null;
  setSelectedTicker: (ticker: string | null) => void;
  refetch: () => Promise<void>;
};

const emptyData: DashboardData = {
  leaderboard: [],
  userLeaderboard: [],
  modelMetrics: [],
  latestPredictions: [],
  latestUserPredictions: [],
  tickerHistory: [],
  metadata: null,
  hasSupabaseConfig: isSupabaseConfigured,
};

export function useDashboardData(): DashboardState {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextData = await fetchDashboardData();
      const tickers = Array.from(new Set(nextData.latestPredictions.map((row) => row.ticker))).sort();

      setSelectedTicker((currentTicker) =>
        currentTicker && tickers.includes(currentTicker) ? currentTicker : tickers[0] ?? null,
      );
      setData((current) => ({ ...nextData, tickerHistory: current.tickerHistory }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!selectedTicker || !data.hasSupabaseConfig) {
      return;
    }

    let isCurrentRequest = true;
    setHistoryLoading(true);
    setData((current) => ({ ...current, tickerHistory: [] }));

    fetchTickerHistory(selectedTicker)
      .then((tickerHistory: TickerHistoryRow[]) => {
        if (isCurrentRequest) {
          setData((current) => ({ ...current, tickerHistory }));
        }
      })
      .catch((caught) => {
        if (isCurrentRequest) {
          setError(caught instanceof Error ? caught.message : "Unable to load ticker history.");
        }
      })
      .finally(() => {
        if (isCurrentRequest) {
          setHistoryLoading(false);
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [data.hasSupabaseConfig, selectedTicker]);

  return useMemo(
    () => ({
      ...data,
      loading,
      historyLoading,
      error,
      selectedTicker,
      setSelectedTicker,
      refetch,
    }),
    [data, error, historyLoading, loading, refetch, selectedTicker],
  );
}
