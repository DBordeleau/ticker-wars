import {
  fetchTickerCloseSnapshot,
  fetchTickerHistory,
  fetchTickerProfile,
  type TickerCloseSnapshot,
  type TickerHistoryRow,
  type TickerProfile,
} from "./dashboardData";
import {
  readTickerHistoryCache,
  writeTickerHistoryCache,
} from "./dashboardPersistentCache";

// Per-ticker promise caches shared across the app. Hovering a ticker quick-look
// card and opening that ticker's detail page now resolve from the same cached
// request, so each ticker's profile/close/history is fetched from Supabase at
// most once per session. Failed requests are evicted so a later attempt can
// retry.
const profileCache = new Map<string, Promise<TickerProfile | null>>();
const closeCache = new Map<string, Promise<TickerCloseSnapshot | null>>();
const historyCache = new Map<string, Promise<TickerHistoryRow[]>>();

export function loadTickerProfile(ticker: string): Promise<TickerProfile | null> {
  const key = ticker.trim().toUpperCase();
  if (!key) {
    return Promise.resolve(null);
  }

  let cached = profileCache.get(key);
  if (!cached) {
    cached = fetchTickerProfile(key).catch((error) => {
      profileCache.delete(key);
      throw error;
    });
    profileCache.set(key, cached);
  }
  return cached;
}

export function loadTickerCloseSnapshot(ticker: string): Promise<TickerCloseSnapshot | null> {
  const key = ticker.trim().toUpperCase();
  if (!key) {
    return Promise.resolve(null);
  }

  let cached = closeCache.get(key);
  if (!cached) {
    cached = fetchTickerCloseSnapshot(key).catch((error) => {
      closeCache.delete(key);
      throw error;
    });
    closeCache.set(key, cached);
  }
  return cached;
}

export function loadTickerHistory(
  ticker: string,
  dashboardVersion: string | null = null,
): Promise<TickerHistoryRow[]> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) {
    return Promise.resolve([]);
  }

  const cacheKey = `${normalizedTicker}:${dashboardVersion ?? "unversioned"}`;
  let cached = historyCache.get(cacheKey);
  if (!cached) {
    cached = readTickerHistoryCache(normalizedTicker, dashboardVersion)
      .then(async (persisted) => {
        if (persisted) {
          return persisted;
        }
        const history = await fetchTickerHistory(normalizedTicker);
        await writeTickerHistoryCache(normalizedTicker, dashboardVersion, history);
        return history;
      })
      .catch((error) => {
        historyCache.delete(cacheKey);
        throw error;
      });
    historyCache.set(cacheKey, cached);
  }
  return cached;
}
