import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { type DashboardData, type TickerHistoryRow } from "../api/dashboardData";
import {
  ensureDashboard,
  getDashboardState,
  refreshDashboard,
  subscribeDashboard,
} from "../api/dashboardStore";
import { loadTickerHistory } from "../api/tickerCache";
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
  userTickerLeaderboard: [],
  modelMetrics: [],
  latestPredictions: [],
  latestUserPredictions: [],
  tickerAssets: [],
  tickerHistory: [],
  metadata: null,
  hasSupabaseConfig: isSupabaseConfigured,
};

export function useDashboardData(): DashboardState {
  // Shared payload from the session-level store (fetched once, reused across
  // every page). Ticker selection and ticker history remain per-instance UI
  // state, but the history request is served from the shared ticker cache.
  const store = useSyncExternalStore(subscribeDashboard, getDashboardState);
  const data = store.data ?? emptyData;

  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [tickerHistory, setTickerHistory] = useState<TickerHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    void ensureDashboard();
  }, []);

  const refetch = useCallback(async () => {
    await refreshDashboard();
  }, []);

  // Default the selected ticker once predictions are available, preserving the
  // current selection if it is still present.
  const { latestPredictions } = data;
  useEffect(() => {
    const tickers = Array.from(new Set(latestPredictions.map((row) => row.ticker))).sort();
    setSelectedTicker((current) =>
      current && tickers.includes(current) ? current : tickers[0] ?? null,
    );
  }, [latestPredictions]);

  useEffect(() => {
    if (!selectedTicker || !data.hasSupabaseConfig) {
      setTickerHistory([]);
      return;
    }

    let isCurrentRequest = true;
    setHistoryLoading(true);

    loadTickerHistory(selectedTicker, data.metadata?.generated_at ?? null)
      .then((history) => {
        if (isCurrentRequest) {
          setTickerHistory(history);
        }
      })
      .catch(() => {
        if (isCurrentRequest) {
          setTickerHistory([]);
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
  }, [data.hasSupabaseConfig, data.metadata?.generated_at, selectedTicker]);

  return useMemo(
    () => ({
      ...data,
      tickerHistory,
      loading: store.loading,
      historyLoading,
      error: store.error,
      selectedTicker,
      setSelectedTicker,
      refetch,
    }),
    [data, tickerHistory, store.loading, store.error, historyLoading, selectedTicker, refetch],
  );
}
