import { useEffect, useMemo, useState } from "react";
import {
  fetchLivePriceSnapshots,
  fetchTickerCloseSnapshots,
  resolveTickerDisplayPrice,
  type TickerDisplayPrice,
} from "../api/livePrices";

type TickerDisplayPriceState = {
  prices: Record<string, TickerDisplayPrice | null>;
  loading: boolean;
  error: string | null;
};

export function useTickerDisplayPrices(
  tickers: string[],
  options: { pollMs?: number; enabled?: boolean } = {},
): TickerDisplayPriceState {
  const rawKey = tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean).sort().join("|");
  const normalizedTickers = useMemo(
    () => Array.from(new Set(rawKey ? rawKey.split("|") : [])).sort(),
    [rawKey],
  );
  const key = normalizedTickers.join("|");
  const enabled = options.enabled ?? normalizedTickers.length > 0;
  const pollMs = options.pollMs ?? 60_000;
  const [prices, setPrices] = useState<Record<string, TickerDisplayPrice | null>>({});
  const [loading, setLoading] = useState(Boolean(enabled && normalizedTickers.length > 0));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || normalizedTickers.length === 0) {
      setPrices({});
      setLoading(false);
      setError(null);
      return undefined;
    }

    let active = true;
    let intervalId: number | undefined;

    const load = () => {
      if (document.hidden) {
        return;
      }

      setLoading(true);
      setError(null);
      Promise.all([
        fetchLivePriceSnapshots(normalizedTickers),
        fetchTickerCloseSnapshots(normalizedTickers),
      ])
        .then(([liveSnapshots, closeSnapshots]) => {
          if (!active) {
            return;
          }
          const now = new Date();
          setPrices(
            Object.fromEntries(
              normalizedTickers.map((ticker) => [
                ticker,
                resolveTickerDisplayPrice(liveSnapshots[ticker] ?? null, closeSnapshots[ticker] ?? null, now),
              ]),
            ),
          );
        })
        .catch((caught) => {
          if (active) {
            setError(caught instanceof Error ? caught.message : "Unable to load ticker prices.");
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    };

    load();
    intervalId = window.setInterval(load, pollMs);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        load();
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
  }, [enabled, key, normalizedTickers, pollMs]);

  return useMemo(() => ({ prices, loading, error }), [error, loading, prices]);
}
