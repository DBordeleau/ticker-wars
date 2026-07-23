import { supabase } from "../supabaseClient";
import { fallbackDashboardData, fallbackTickerCloseSnapshots, fallbackTickerProfiles } from "../fallbackDashboardData";
import { isRemovedTicker } from "../tickerUniverse";
import { dashboardPageSize, dashboardRecentPredictionLimit } from "./constants";
import {
  cleanNumber,
  cleanString,
  isMissingFundamentalsProfileColumnError,
  isVisibleModelRow,
  normalizeLatestPredictionRow,
  normalizeLatestUserPredictionRow,
  normalizeLeaderboardRow,
  normalizeModelMetricRow,
  normalizeRunMetadata,
  normalizeTickerAssetRow,
  normalizeTickerCloseSnapshot,
  normalizeTickerHistoryRow,
  normalizeTickerProfileRow,
  normalizeUserLeaderboardRow,
  normalizeUserTickerLeaderboardRow,
  withFallbackTickerProfile,
} from "./normalizers";
import type {
  LatestPrediction,
  LatestUserPrediction,
  LeaderboardRow,
  ModelMetricRow,
  RunMetadata,
  TickerAsset,
  TickerCloseSnapshot,
  TickerHistoryRow,
  TickerProfile,
  UserLeaderboardRow,
  UserTickerLeaderboardRow,
} from "./types";

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  if (!supabase) {
    return fallbackDashboardData.leaderboard;
  }

  const { data, error } = await supabase
    .from("dashboard_model_leaderboard")
    .select("*")
    .order("evaluation_window")
    .order("prediction_horizon")
    .order("rank", { nullsFirst: false })
    .order("model_name");

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeLeaderboardRow).filter(isVisibleModelRow);
}

export async function fetchLatestPredictions(): Promise<LatestPrediction[]> {
  if (!supabase) {
    return fallbackDashboardData.latestPredictions;
  }

  const rows: Partial<LatestPrediction>[] = [];
  let start = 0;

  while (rows.length < dashboardRecentPredictionLimit) {
    const end = Math.min(
      start + dashboardPageSize - 1,
      dashboardRecentPredictionLimit - 1,
    );
    const { data, error } = await supabase
      .from("dashboard_latest_predictions")
      .select("*")
      .order("prediction_date", { ascending: false })
      .order("target_date", { ascending: false })
      .order("ticker")
      .order("model_slug")
      .order("prediction_horizon")
      .range(start, end);

    if (error) {
      throw error;
    }

    const rawBatch = data ?? [];
    const batch = rawBatch.filter((row) => !isRemovedTicker(row.ticker));
    rows.push(...batch);

    if (rawBatch.length < dashboardPageSize) {
      break;
    }
    start += dashboardPageSize;
  }

  return rows
    .map(normalizeLatestPredictionRow)
    .filter((row) => !isRemovedTicker(row.ticker))
    .filter(isVisibleModelRow);
}

export async function fetchUserLeaderboard(): Promise<UserLeaderboardRow[]> {
  if (!supabase) {
    return fallbackDashboardData.userLeaderboard;
  }

  const { data, error } = await supabase
    .from("dashboard_user_leaderboard")
    .select("*")
    .order("evaluation_window")
    .order("prediction_horizon")
    .order("rank", { nullsFirst: false })
    .order("username");

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeUserLeaderboardRow);
}

export async function fetchUserTickerLeaderboard(): Promise<UserTickerLeaderboardRow[]> {
  if (!supabase) {
    return fallbackDashboardData.userTickerLeaderboard;
  }

  const { data, error } = await supabase
    .from("dashboard_user_ticker_leaderboard")
    .select("*")
    .order("ticker")
    .order("evaluation_window")
    .order("prediction_horizon")
    .order("rank", { nullsFirst: false })
    .order("username");

  if (error) {
    if (error.code === "42P01" || error.message.includes("dashboard_user_ticker_leaderboard")) {
      return [];
    }
    throw error;
  }

  return (data ?? [])
    .map(normalizeUserTickerLeaderboardRow)
    .filter((row) => !isRemovedTicker(row.ticker));
}

export async function fetchLatestUserPredictions(): Promise<LatestUserPrediction[]> {
  if (!supabase) {
    return fallbackDashboardData.latestUserPredictions;
  }

  const rows: Partial<LatestUserPrediction>[] = [];
  let start = 0;

  while (rows.length < dashboardRecentPredictionLimit) {
    const end = Math.min(
      start + dashboardPageSize - 1,
      dashboardRecentPredictionLimit - 1,
    );
    const { data, error } = await supabase
      .from("dashboard_latest_user_predictions")
      .select("*")
      .order("prediction_date", { ascending: false })
      .order("target_date", { ascending: false })
      .order("ticker")
      .order("username")
      .range(start, end);

    if (error) {
      throw error;
    }

    const rawBatch = data ?? [];
    const batch = rawBatch.filter((row) => !isRemovedTicker(row.ticker));
    rows.push(...batch);

    if (rawBatch.length < dashboardPageSize) {
      break;
    }
    start += dashboardPageSize;
  }

  return rows
    .map(normalizeLatestUserPredictionRow)
    .filter((row) => !isRemovedTicker(row.ticker));
}

export async function fetchTickerHistory(ticker: string): Promise<TickerHistoryRow[]> {
  if (isRemovedTicker(ticker)) {
    return [];
  }

  if (!supabase) {
    return fallbackDashboardData.tickerHistory.filter((row) => row.ticker === ticker);
  }

  const { data, error } = await supabase.rpc("get_public_ticker_history", {
    p_ticker: ticker,
  });

  if (error) {
    if (error.code !== "42883" && !error.message.includes("get_public_ticker_history")) {
      throw error;
    }
    return fetchTickerHistoryFromTable(ticker);
  }

  return (data ?? []).map(normalizeTickerHistoryRow).filter(isVisibleModelRow);
}

async function fetchTickerHistoryFromTable(ticker: string): Promise<TickerHistoryRow[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("dashboard_ticker_history")
    .select(
      "ticker,prediction_date,target_date,prediction_horizon,actual_close,model_name,model_slug,predicted_close,predicted_close_lower,predicted_close_upper,predicted_return,actual_return,winkler_score,reasoning_summary",
    )
    .eq("ticker", ticker)
    .order("target_date")
    .order("model_name");

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeTickerHistoryRow).filter(isVisibleModelRow);
}

export async function fetchTickerProfile(ticker: string): Promise<TickerProfile | null> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) {
    return null;
  }
  if (isRemovedTicker(normalizedTicker)) {
    return null;
  }

  if (!supabase) {
    return fallbackTickerProfiles[normalizedTicker] ?? null;
  }

  const { data, error } = await supabase
    .from("fundamentals")
    .select(
      "ticker,as_of_date,sector,industry,long_name,short_name,display_name,business_summary,source",
    )
    .eq("ticker", normalizedTicker)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let profileRow = data as Record<string, unknown> | null;
  if (error && isMissingFundamentalsProfileColumnError(error)) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("fundamentals")
      .select("ticker,as_of_date,sector,industry,source")
      .eq("ticker", normalizedTicker)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallbackError) {
      if (fallbackError.code === "42P01" || fallbackError.message.includes("fundamentals")) {
        return fallbackTickerProfiles[normalizedTicker] ?? null;
      }
      throw fallbackError;
    }
    profileRow = fallbackData as Record<string, unknown> | null;
  } else if (error) {
    if (error.code === "42P01" || error.message.includes("fundamentals")) {
      return fallbackTickerProfiles[normalizedTicker] ?? null;
    }
    throw error;
  }

  const { data: assetData, error: assetError } = await supabase
    .from("ticker_assets")
    .select("ticker,logo_data_url")
    .eq("ticker", normalizedTicker)
    .maybeSingle();

  if (assetError && assetError.code !== "42P01" && !assetError.message.includes("ticker_assets")) {
    throw assetError;
  }

  return profileRow
    ? withFallbackTickerProfile(normalizeTickerProfileRow(profileRow, assetData ?? null))
    : fallbackTickerProfiles[normalizedTicker] ?? null;
}

export async function fetchTickerAssets(): Promise<TickerAsset[]> {
  if (!supabase) {
    return fallbackDashboardData.tickerAssets;
  }

  const { data, error } = await supabase
    .from("ticker_assets")
    .select("ticker,logo_data_url")
    .order("ticker");

  if (error) {
    if (error.code === "42P01" || error.message.includes("ticker_assets")) {
      return [];
    }
    throw error;
  }

  const companyNames = await fetchTickerCompanyNames();

  const assetByTicker = new Map<string, TickerAsset>();
  (data ?? [])
    .map(normalizeTickerAssetRow)
    .forEach((asset) => assetByTicker.set(asset.ticker, {
      ...asset,
      company_name: asset.company_name ?? companyNames.get(asset.ticker) ?? null,
    }));
  companyNames.forEach((companyName, ticker) => {
    if (!assetByTicker.has(ticker)) {
      assetByTicker.set(ticker, {
        ticker,
        logo_data_url: null,
        company_name: companyName,
      });
    }
  });

  return Array.from(assetByTicker.values())
    .filter((row) => !isRemovedTicker(row.ticker));
}

async function fetchTickerCompanyNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!supabase) {
    return names;
  }

  let start = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("fundamentals")
      .select("ticker,long_name,short_name,display_name,as_of_date")
      .order("ticker")
      .order("as_of_date", { ascending: false })
      .range(start, start + dashboardPageSize - 1);

    if (error) {
      if (
        error.code === "42P01" ||
        error.message.includes("fundamentals") ||
        isMissingFundamentalsProfileColumnError(error)
      ) {
        return names;
      }
      throw error;
    }

    const batch = data ?? [];
    for (const row of batch) {
      const ticker = cleanString((row as Record<string, unknown>).ticker)?.toUpperCase();
      if (!ticker || names.has(ticker)) {
        continue;
      }
      const companyName =
        cleanString((row as Record<string, unknown>).long_name) ??
        cleanString((row as Record<string, unknown>).short_name) ??
        cleanString((row as Record<string, unknown>).display_name);
      if (companyName) {
        names.set(ticker, companyName);
      }
    }

    if (batch.length < dashboardPageSize) {
      return names;
    }
    start += dashboardPageSize;
  }
}

export async function fetchTickerCloseSnapshot(ticker: string): Promise<TickerCloseSnapshot | null> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) {
    return null;
  }
  if (isRemovedTicker(normalizedTicker)) {
    return null;
  }

  if (!supabase) {
    return fallbackTickerCloseSnapshots[normalizedTicker] ?? null;
  }

  const { data, error } = await supabase
    .from("prices")
    .select("ticker,date,close")
    .eq("ticker", normalizedTicker)
    .order("date", { ascending: false })
    .limit(2);

  if (error) {
    if (error.code === "42P01" || error.message.includes("prices")) {
      return null;
    }
    throw error;
  }

  return normalizeTickerCloseSnapshot(data ?? []);
}

export type PriceChangeHorizon = "1w" | "1m" | "3m" | "1y";

export type TickerPriceChange = {
  ticker: string;
  date: string;
  close: number;
  // Trailing return over each horizon (latest close vs. the close ~that long ago).
  changes: Partial<Record<PriceChangeHorizon, number>>;
};

// Calendar-day lookback for each horizon's trailing price move.
const priceChangeLookbackDays: Record<PriceChangeHorizon, number> = {
  "1w": 7,
  "1m": 30,
  "3m": 91,
  "1y": 365,
};

// Bulk trailing price move for every ticker across all horizons, used by the
// /tickers browse grid. It resolves the latest global trading date plus the
// nearest trading date on/before each horizon's lookback anchor, then reads each
// of those dates' closes in one paginated pass — so the whole universe (all
// horizons) costs a handful of queries and is computed once per session.
export async function fetchTickerPriceChanges(): Promise<Record<string, TickerPriceChange>> {
  if (!supabase) {
    return Object.fromEntries(
      Object.values(fallbackTickerCloseSnapshots).map((snapshot) => [
        snapshot.ticker,
        {
          ticker: snapshot.ticker,
          date: snapshot.date,
          close: snapshot.close,
          // Offline demo lacks deep history; surface the one move it has.
          changes: {
            "1w": snapshot.change_percent ?? undefined,
            "1m": snapshot.change_percent ?? undefined,
            "3m": snapshot.change_percent ?? undefined,
            "1y": snapshot.change_percent ?? undefined,
          },
        },
      ]),
    );
  }

  const db = supabase;
  const latestDate = await fetchMaxPriceDate(db);
  if (!latestDate) {
    return {};
  }

  const horizons = Object.keys(priceChangeLookbackDays) as PriceChangeHorizon[];

  // Nearest actual trading date on/before each horizon's calendar anchor.
  const horizonDates = new Map<PriceChangeHorizon, string>();
  await Promise.all(
    horizons.map(async (horizon) => {
      const anchor = shiftIsoDate(latestDate, -priceChangeLookbackDays[horizon]);
      const tradingDate = await fetchMaxPriceDate(db, shiftIsoDate(anchor, 1));
      if (tradingDate) {
        horizonDates.set(horizon, tradingDate);
      }
    }),
  );

  // One close lookup per distinct date (latest + each resolved horizon date).
  const horizonDateValues = Array.from(horizonDates.values());
  const uniqueDates = Array.from(new Set([latestDate, ...horizonDateValues]));
  const closesByDate = new Map<string, Map<string, number>>();
  await Promise.all(
    uniqueDates.map(async (date) => {
      closesByDate.set(date, await fetchClosesForDate(db, date));
    }),
  );

  const latestCloses = closesByDate.get(latestDate) ?? new Map<string, number>();
  const result: Record<string, TickerPriceChange> = {};
  latestCloses.forEach((close, ticker) => {
    if (isRemovedTicker(ticker)) {
      return;
    }
    const changes: Partial<Record<PriceChangeHorizon, number>> = {};
    horizons.forEach((horizon) => {
      const horizonDate = horizonDates.get(horizon);
      const priorClose = horizonDate ? closesByDate.get(horizonDate)?.get(ticker) : undefined;
      if (priorClose != null && priorClose !== 0) {
        changes[horizon] = close / priorClose - 1;
      }
    });
    result[ticker] = { ticker, date: latestDate, close, changes };
  });
  return result;
}

// Shift a "YYYY-MM-DD" date by a number of days, in UTC to avoid TZ drift.
function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

async function fetchMaxPriceDate(
  db: NonNullable<typeof supabase>,
  before?: string,
): Promise<string | null> {
  let query = db.from("prices").select("date").order("date", { ascending: false }).limit(1);
  if (before) {
    query = query.lt("date", before);
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.message.includes("prices")) {
      return null;
    }
    throw error;
  }
  return cleanString((data as { date?: unknown } | null)?.date) ?? null;
}

async function fetchClosesForDate(
  db: NonNullable<typeof supabase>,
  date: string,
): Promise<Map<string, number>> {
  const closes = new Map<string, number>();
  let start = 0;

  for (;;) {
    const { data, error } = await db
      .from("prices")
      .select("ticker,close")
      .eq("date", date)
      .order("ticker")
      .range(start, start + dashboardPageSize - 1);

    if (error) {
      if (error.code === "42P01" || error.message.includes("prices")) {
        break;
      }
      throw error;
    }

    const batch = data ?? [];
    for (const row of batch) {
      const ticker = cleanString((row as { ticker?: unknown }).ticker);
      const close = cleanNumber((row as { close?: unknown }).close);
      if (ticker && close != null) {
        closes.set(ticker.toUpperCase(), close);
      }
    }

    if (batch.length < dashboardPageSize) {
      break;
    }
    start += dashboardPageSize;
  }

  return closes;
}

export async function fetchModelMetrics(): Promise<ModelMetricRow[]> {
  if (!supabase) {
    return fallbackDashboardData.modelMetrics;
  }

  const { data, error } = await supabase
    .from("dashboard_model_metrics")
    .select("*")
    .order("evaluation_window")
    .order("prediction_horizon")
    .order("model_name");

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeModelMetricRow).filter(isVisibleModelRow);
}

export async function fetchRunMetadata(): Promise<RunMetadata | null> {
  if (!supabase) {
    return fallbackDashboardData.metadata;
  }

  const { data, error } = await supabase
    .from("dashboard_run_metadata")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? normalizeRunMetadata(data) : null;
}

