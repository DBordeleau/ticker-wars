import { useEffect, useMemo, useState } from "react";
import {
  fetchIntradayPriceBars,
  fetchRecentDailyCloses,
  type DailyPricePoint,
  type IntradayPriceBar,
} from "../api/livePrices";

type TickerPriceSeriesState = {
  daily: DailyPricePoint[];
  intraday: IntradayPriceBar[];
  loading: boolean;
  error: string | null;
};

const emptySeries: TickerPriceSeriesState = {
  daily: [],
  intraday: [],
  loading: false,
  error: null,
};

export function useTickerPriceSeries(ticker: string): TickerPriceSeriesState {
  const normalizedTicker = ticker.trim().toUpperCase();
  const [daily, setDaily] = useState<DailyPricePoint[]>([]);
  const [intraday, setIntraday] = useState<IntradayPriceBar[]>([]);
  const [loading, setLoading] = useState(Boolean(normalizedTicker));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!normalizedTicker) {
      setDaily([]);
      setIntraday([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchRecentDailyCloses(normalizedTicker),
      fetchIntradayPriceBars(normalizedTicker),
    ])
      .then(([nextDaily, nextIntraday]) => {
        if (!active) {
          return;
        }
        setDaily(nextDaily);
        setIntraday(nextIntraday);
      })
      .catch((caught) => {
        if (!active) {
          return;
        }
        setDaily([]);
        setIntraday([]);
        setError(caught instanceof Error ? caught.message : "Unable to load price history.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [normalizedTicker]);

  return useMemo(
    () =>
      normalizedTicker
        ? { daily, intraday, loading, error }
        : emptySeries,
    [daily, error, intraday, loading, normalizedTicker],
  );
}
