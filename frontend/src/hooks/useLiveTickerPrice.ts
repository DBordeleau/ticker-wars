import { useCallback, useEffect, useMemo, useState } from "react";
import type { LivePriceSnapshot } from "../api/livePrices";
import { getLiveTickerPriceStore } from "./liveTickerPriceStore";

type LiveTickerPriceState = {
  data: LivePriceSnapshot | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

type LiveTickerPriceOptions = {
  enabled?: boolean;
  poll?: boolean;
  pollMs?: number;
};

export function useLiveTickerPrice(
  ticker: string,
  options: LiveTickerPriceOptions = {},
): LiveTickerPriceState {
  const normalizedTicker = ticker.trim().toUpperCase();
  const enabled = options.enabled ?? Boolean(normalizedTicker);
  const poll = options.poll ?? true;
  const pollMs = options.pollMs ?? 60_000;
  const [data, setData] = useState<LivePriceSnapshot | null>(null);
  const [loading, setLoading] = useState(Boolean(normalizedTicker && enabled));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!normalizedTicker || !enabled) {
      setData(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const store = getLiveTickerPriceStore(normalizedTicker);
    const updateState = () => {
      const snapshot = store.getSnapshot();
      setData(snapshot.data);
      setLoading(snapshot.loading);
      setError(snapshot.error);
    };
    updateState();

    return store.subscribe(updateState, { poll, pollMs });
  }, [enabled, normalizedTicker, poll, pollMs]);

  const refetch = useCallback(() => {
    if (!normalizedTicker || !enabled) {
      return;
    }
    getLiveTickerPriceStore(normalizedTicker).refetch();
  }, [enabled, normalizedTicker]);

  return useMemo(
    () => ({
      data,
      loading,
      error,
      refetch,
    }),
    [data, error, loading, refetch],
  );
}
