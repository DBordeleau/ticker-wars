import type { TickerCloseSnapshot } from "./dashboardData";
import { supabase } from "./supabaseClient";

export type LiveMarketState = "pre" | "regular" | "post" | "closed" | "unknown";

export type LivePriceSnapshot = {
  ticker: string;
  provider: string;
  provider_symbol: string;
  currency: string | null;
  market_state: LiveMarketState;
  price: number;
  previous_close: number | null;
  day_open: number | null;
  day_high: number | null;
  day_low: number | null;
  day_volume: number | null;
  change: number | null;
  change_percent: number | null;
  as_of: string;
  fetched_at: string;
  stale_after: string;
  provider_metadata?: Record<string, unknown> | null;
};

export type TickerDisplayPrice = {
  ticker: string;
  price: number;
  label: string;
  detailLabel: string;
  asOf: string;
  marketState: LiveMarketState;
  freshness: "fresh" | "stale" | "close";
  change: number | null;
  changePercent: number | null;
  source: "live" | "close";
};

export type DailyPricePoint = {
  ticker: string;
  date: string;
  close: number;
};

export type IntradayPriceBar = {
  ticker: string;
  ts: string;
  close: number;
};

export async function fetchLivePriceSnapshot(
  ticker: string,
): Promise<LivePriceSnapshot | null> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("live_price_snapshots")
    .select("*")
    .eq("ticker", normalizedTicker)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message.includes("live_price_snapshots")) {
      return null;
    }
    throw error;
  }

  return data ? normalizeLivePriceSnapshot(data) : null;
}

export async function fetchRecentDailyCloses(
  ticker: string,
  limit = 370,
): Promise<DailyPricePoint[]> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("prices")
    .select("ticker,date,close")
    .eq("ticker", normalizedTicker)
    .order("date", { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === "42P01" || error.message.includes("prices")) {
      return [];
    }
    throw error;
  }

  return (data ?? [])
    .map(normalizeDailyPricePoint)
    .filter((row): row is DailyPricePoint => row !== null)
    .reverse();
}

export async function fetchIntradayPriceBars(ticker: string): Promise<IntradayPriceBar[]> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("intraday_price_bars")
    .select("ticker,ts,close")
    .eq("ticker", normalizedTicker)
    .order("ts", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.message.includes("intraday_price_bars")) {
      return [];
    }
    throw error;
  }

  return (data ?? [])
    .map(normalizeIntradayPriceBar)
    .filter((row): row is IntradayPriceBar => row !== null);
}

export function resolveTickerDisplayPrice(
  live: LivePriceSnapshot | null,
  close: TickerCloseSnapshot | null,
  now = new Date(),
): TickerDisplayPrice | null {
  if (live?.market_state === "regular" && isRegularMarketTime(now)) {
    const staleAt = new Date(live.stale_after).getTime();
    const isFresh = Number.isFinite(staleAt) && staleAt >= now.getTime();
    const fallbackClose = live.previous_close ?? close?.close ?? null;
    const change = live.change ?? (fallbackClose == null ? null : live.price - fallbackClose);
    const changePercent =
      live.change_percent ??
      (fallbackClose == null || fallbackClose === 0 ? null : live.price / fallbackClose - 1);

    return {
      ticker: live.ticker,
      price: live.price,
      label: isFresh ? "Live price" : "Last live price",
      detailLabel: isFresh ? `Updated ${formatRelativeAge(live.as_of, now)}` : `Stale ${formatRelativeAge(live.as_of, now)}`,
      asOf: live.as_of,
      marketState: live.market_state,
      freshness: isFresh ? "fresh" : "stale",
      change,
      changePercent,
      source: "live",
    };
  }

  if (close) {
    return {
      ticker: close.ticker,
      price: close.close,
      label: `${formatShortDate(close.date)} closing price`,
      detailLabel: "Last official close",
      asOf: close.date,
      marketState: live?.market_state ?? "closed",
      freshness: "close",
      change: close.change,
      changePercent: close.change_percent,
      source: "close",
    };
  }

  if (live) {
    const staleAt = new Date(live.stale_after).getTime();
    const isFresh = Number.isFinite(staleAt) && staleAt >= now.getTime();
    return {
      ticker: live.ticker,
      price: live.price,
      label: isFresh ? "Live price" : "Last live price",
      detailLabel: isFresh ? `Updated ${formatRelativeAge(live.as_of, now)}` : `Stale ${formatRelativeAge(live.as_of, now)}`,
      asOf: live.as_of,
      marketState: live.market_state,
      freshness: isFresh ? "fresh" : "stale",
      change: live.change,
      changePercent: live.change_percent,
      source: "live",
    };
  }

  return null;
}

export function formatRelativeAge(value: string | null | undefined, now = new Date()) {
  if (!value) {
    return "just now";
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "just now";
  }

  const seconds = Math.max(0, Math.round((now.getTime() - timestamp) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function isRegularMarketTime(now = new Date()) {
  const easternParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const part = (type: string) => easternParts.find((item) => item.type === type)?.value;
  const weekday = part("weekday");
  const hour = Number(part("hour"));
  const minute = Number(part("minute"));
  if (!weekday || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return false;
  }
  if (weekday === "Sat" || weekday === "Sun") {
    return false;
  }
  const totalMinutes = hour * 60 + minute;
  return totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60;
}

function normalizeLivePriceSnapshot(row: Record<string, unknown>): LivePriceSnapshot | null {
  const price = cleanNumber(row.price);
  const ticker = cleanString(row.ticker);
  const asOf = cleanString(row.as_of);
  const fetchedAt = cleanString(row.fetched_at);
  const staleAfter = cleanString(row.stale_after);
  if (!ticker || price == null || !asOf || !fetchedAt || !staleAfter) {
    return null;
  }

  return {
    ticker,
    provider: cleanString(row.provider) ?? "unknown",
    provider_symbol: cleanString(row.provider_symbol) ?? ticker,
    currency: cleanString(row.currency),
    market_state: cleanMarketState(row.market_state),
    price,
    previous_close: cleanNumber(row.previous_close),
    day_open: cleanNumber(row.day_open),
    day_high: cleanNumber(row.day_high),
    day_low: cleanNumber(row.day_low),
    day_volume: cleanNumber(row.day_volume),
    change: cleanNumber(row.change),
    change_percent: cleanNumber(row.change_percent),
    as_of: asOf,
    fetched_at: fetchedAt,
    stale_after: staleAfter,
    provider_metadata: isRecord(row.provider_metadata) ? row.provider_metadata : null,
  };
}

function normalizeDailyPricePoint(row: Record<string, unknown>): DailyPricePoint | null {
  const ticker = cleanString(row.ticker);
  const date = cleanString(row.date);
  const close = cleanNumber(row.close);
  if (!ticker || !date || close == null) {
    return null;
  }
  return { ticker, date, close };
}

function normalizeIntradayPriceBar(row: Record<string, unknown>): IntradayPriceBar | null {
  const ticker = cleanString(row.ticker);
  const ts = cleanString(row.ts);
  const close = cleanNumber(row.close);
  if (!ticker || !ts || close == null) {
    return null;
  }
  return { ticker, ts, close };
}

function cleanMarketState(value: unknown): LiveMarketState {
  return value === "pre" ||
    value === "regular" ||
    value === "post" ||
    value === "closed" ||
    value === "unknown"
    ? value
    : "unknown";
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  return text || null;
}

function cleanNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}
