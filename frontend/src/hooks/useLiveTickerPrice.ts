import { useEffect, useMemo, useState } from "react";
import { loadLivePriceSnapshot } from "../api/livePriceCache";
import type { LivePriceSnapshot } from "../api/livePrices";

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
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!normalizedTicker || !enabled) {
      setData(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    let active = true;
    let intervalId: number | undefined;

    const load = (force = false) => {
      if (document.hidden && !force) {
        return;
      }

      setLoading(true);
      setError(null);
      loadLivePriceSnapshot(normalizedTicker, { force })
        .then((snapshot) => {
          if (active) {
            setData(snapshot);
          }
        })
        .catch((caught) => {
          if (active) {
            setError(caught instanceof Error ? caught.message : "Unable to load live price.");
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    };

    load(refreshToken > 0);

    if (poll) {
      intervalId = window.setInterval(() => load(true), pollMs);
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        load(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      if (intervalId != null) {
        window.clearInterval(intervalId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, normalizedTicker, poll, pollMs, refreshToken]);

  return useMemo(
    () => ({
      data,
      loading,
      error,
      refetch: () => setRefreshToken((current) => current + 1),
    }),
    [data, error, loading],
  );
}
